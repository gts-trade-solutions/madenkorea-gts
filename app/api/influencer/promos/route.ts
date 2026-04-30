import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const CAP_PERCENT = 25;

async function withUser(req: NextRequest) {
  const cookieStore = cookies();
  const sbCookies = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
  let {
    data: { user },
  } = await sbCookies.auth.getUser();
  let sb = sbCookies;

  if (!user) {
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (token) {
      const sbBearer = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      const { data } = await sbBearer.auth.getUser(token);
      if (data.user) {
        user = data.user;
        sb = sbBearer as any;
      }
    }
  }
  return { user, sb };
}

export async function GET(req: NextRequest) {
  const { user, sb } = await withUser(req);
  if (!user)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );

  const { data, error } = await sb
    .from("promo_codes")
    .select(
      "id, code, product_id, active, discount_percent, commission_percent, uses, max_uses"
    )
    .eq("influencer_id", user.id)
    .is("product_id", null) // GLOBAL only
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  return NextResponse.json({ ok: true, promos: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { code, discount_percent, commission_percent } = body;

  const { user, sb } = await withUser(req);
  if (!user)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );

  const u = Number(discount_percent ?? body.user_discount_pct ?? 0);
  const c = Number(commission_percent ?? body.commission_pct ?? 0);
  if (!code || !String(code).trim()) {
    return NextResponse.json(
      { ok: false, error: "Code required" },
      { status: 400 }
    );
  }
  if (u < 0 || c < 0 || u > 100 || c > 100) {
    return NextResponse.json(
      { ok: false, error: "Percents must be 0..100" },
      { status: 400 }
    );
  }
if (u + c > CAP_PERCENT + 0.0001) {
    return NextResponse.json(
      {
        ok: false,
        error: `Customer% + You% must be ≤ ${CAP_PERCENT}`,
      },
      { status: 400 }
    );
  }

  const payload = {
    influencer_id: user.id,
    code: String(code).toUpperCase(),
    product_id: null, // GLOBAL
    discount_percent: u,
    commission_percent: c,
    cap_percent: CAP_PERCENT, // global cap
    active: true,
  };

  const { data, error } = await sb
    .from("promo_codes")
    .insert(payload)
    .select("id, code")
    .single();

  if (error)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  return NextResponse.json({ ok: true, promo: data });
}
