import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Per-influencer cap lives on influencer_profiles.commission_cap_pct
// (admin-managed via /admin/influencers). No global constant any more.

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

  // Look up this influencer's per-account cap. Admin sets this at
  // approval time and can revise it from /admin/influencers. If the
  // row is missing (caller isn't actually an approved influencer), we
  // fail loudly rather than fall back to a constant — the previous
  // hardcoded 25% was masking this case.
  const { data: prof, error: profErr } = await sb
    .from("influencer_profiles")
    .select("commission_cap_pct")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profErr) {
    return NextResponse.json(
      { ok: false, error: profErr.message },
      { status: 500 }
    );
  }
  if (!prof || prof.commission_cap_pct == null) {
    // Stable error code — client maps to a translated string. Plain
    // English `error` kept as a fallback for non-localised callers.
    return NextResponse.json(
      {
        ok: false,
        code: "SETTINGS_NOT_FINALIZED",
        error: "Your commission settings haven't been finalized yet. Contact admin.",
      },
      { status: 400 }
    );
  }
  const cap = Number(prof.commission_cap_pct);
  if (u + c > cap + 0.0001) {
    return NextResponse.json(
      {
        ok: false,
        code: "SPLIT_EXCEEDS_CAP",
        cap,
        error: `Customer% + You% must be ≤ ${cap}`,
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
    cap_percent: cap, // per-influencer cap snapshotted at creation
    active: true,
  };

  const { data, error } = await sb
    .from("promo_codes")
    .insert(payload)
    .select("id, code")
    .single();

  if (error) {
    // Postgres 23505 = unique_violation. The promo_codes_code_key
    // index makes `code` globally unique across influencers, so two
    // influencers can never own the same code — first-come, first-
    // served on the string namespace. Surface a friendly error code
    // so the dashboard can translate it instead of dumping the raw
    // "duplicate key value violates unique constraint" text.
    if ((error as any).code === "23505") {
      return NextResponse.json(
        {
          ok: false,
          code: "CODE_ALREADY_TAKEN",
          error: "CODE_ALREADY_TAKEN",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, promo: data });
}
