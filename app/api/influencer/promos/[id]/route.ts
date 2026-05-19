import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

async function withUser(req: NextRequest) {
  const cookieStore = cookies();
  const sbCookies = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
  let { data: { user } } = await sbCookies.auth.getUser();
  let sb = sbCookies;

  if (!user) {
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (token) {
      const sbBearer = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data } = await sbBearer.auth.getUser(token);
      if (data.user) { user = data.user; sb = sbBearer as any; }
    }
  }
  return { user, sb };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(()=> ({}));
  const { active, discount_percent, commission_percent } = body;

  const { user, sb } = await withUser(req);
  if (!user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const u = Number(discount_percent ?? body.user_discount_pct ?? 0);
  const c = Number(commission_percent ?? body.commission_pct ?? 0);
  if (u < 0 || c < 0 || u > 100 || c > 100) {
    return NextResponse.json({ ok:false, error:"Percents must be 0..100" }, { status:400 });
  }

  // Per-influencer cap. Previously this endpoint enforced a hardcoded
  // 20% (inconsistent with the POST sibling which used 25), so an
  // influencer could create at 25 but couldn't edit past 20. Both now
  // read the same per-influencer value from influencer_profiles.
  const { data: prof, error: profErr } = await sb
    .from("influencer_profiles")
    .select("commission_cap_pct")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profErr) {
    return NextResponse.json({ ok:false, error: profErr.message }, { status:500 });
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

  const { data, error } = await sb
    .from("promo_codes")
    .update({
      active: !!active,
      discount_percent: u,
      commission_percent: c,
      cap_percent: cap,
    })
    .eq("id", params.id)
    .eq("influencer_id", user.id)
    .is("product_id", null) // GLOBAL only
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:400 });
  return NextResponse.json({ ok:true, id:data.id });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, sb } = await withUser(req);
  if (!user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const { error } = await sb
    .from("promo_codes")
    .delete()
    .eq("id", params.id)
    .eq("influencer_id", user.id)
    .is("product_id", null);

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:400 });
  return NextResponse.json({ ok:true });
}
