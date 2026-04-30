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
  if (u + c > 20.0001) {
    return NextResponse.json({ ok:false, error:"Customer% + You% must be ≤ 20" }, { status:400 });
  }

  const { data, error } = await sb
    .from("promo_codes")
    .update({
      active: !!active,
      discount_percent: u,
      commission_percent: c,
      cap_percent: 20,
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
