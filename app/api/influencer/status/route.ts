// app/api/influencer/status/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();

  // 1) Bearer
  let user: any = null;
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) user = data.user;
  }
  // 2) Cookie
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return json({ ok: false, error: "UNAUTH" }, 401);

  // Resolve status
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role === "admin")
    return json({ ok: true, status: "admin", requested_at: null });

  const { data: infl } = await supabase
    .from("influencer_profiles")
    .select("active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (infl?.active)
    return json({ ok: true, status: "influencer", requested_at: null });

  const { data: req } = await supabase
    .from("influencer_requests")
    .select("status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (req?.status === "pending")
    return json({ ok: true, status: "pending", requested_at: req.created_at });
  if (req?.status === "rejected")
    return json({ ok: true, status: "rejected", requested_at: req.created_at });

  return json({ ok: true, status: "none", requested_at: null });
}
