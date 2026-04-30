export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const json = (d:any, s=200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

async function getAdminOr401() {
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

  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return { supabase, user: null, error: json({ ok:false, error:"FORBIDDEN" }, 403) };

  return { supabase, user, error: null };
}

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, error } = await getAdminOr401();
  if (error) return error;

  const id = params.id;

  const body = await _req.json().catch(() => ({}));
  const status = String(body.status || "").toLowerCase();
  const settled_reference = body.settled_reference ?? null;
  const notes = body.notes ?? null;

  if (!["paid","failed","processing"].includes(status)) {
    return json({ ok:false, error:"Invalid status." }, 400);
  }

  const patch:any = { status, settled_reference, notes };
  if (status === "paid") patch.paid_at = new Date().toISOString();

  const { data, error: err } = await supabase
    .from("influencer_payouts")
    .update(patch)
    .eq("id", id)
    .select("id, amount, status, settled_reference, paid_at")
    .single();

  if (err) return json({ ok:false, error: err.message }, 400);
  return json({ ok:true, payout: data });
}
