export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const json = (d:any, s=200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

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

  const { data, error: err } = await supabase
    .from("influencer_payouts")
    .select("id, amount, currency, status, method, request_note, contact_email, settled_reference, created_at, paid_at")
    .eq("influencer_id", user.id)
    .order("created_at", { ascending: false });

  if (err) return json({ ok:false, error: err.message }, 400);
  return json({ ok:true, payouts: data ?? [] });
}
