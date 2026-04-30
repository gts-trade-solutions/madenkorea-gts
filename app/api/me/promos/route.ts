// app/api/me/promos/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const json = (d:any, s=200) => NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

async function getUserOr401() {
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();
  let user: any = null;

  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) user = data.user;
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return { supabase, user: null, error: json({ ok:false, error:"UNAUTH" }, 401) };
  return { supabase, user, error: null };
}

export async function GET() {
  const { supabase, user, error } = await getUserOr401();
  if (!user) return error!;

  // Pull promos for this influencer
  const { data: promos, error: err } = await supabase
    .from("promo_codes")
    .select("id, code, scope, product_id, discount_percent, commission_percent, active, uses")
    .eq("influencer_id", user.id)
    .order("created_at", { ascending: false });

  if (err) return json({ ok:false, error: err.message }, 400);

  // Attach product names for product-scoped promos
  const ids = Array.from(new Set((promos ?? []).map(p => p.product_id).filter(Boolean))) as string[];
  let map: Record<string, { name: string, slug: string }> = {};
  if (ids.length) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, slug")
      .in("id", ids as any);
    for (const p of products ?? []) map[p.id as string] = { name: p.name as string, slug: p.slug as string };
  }

  const out = (promos ?? []).map(p => ({
    ...p,
    product_name: p.product_id ? map[p.product_id]?.name ?? null : null,
    product_slug: p.product_id ? map[p.product_id]?.slug ?? null : null,
  }));

  return json({ ok:true, promos: out });
}
