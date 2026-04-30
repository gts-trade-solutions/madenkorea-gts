// app/api/influencer/request/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();

  // Bearer or cookie
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
  if (!user) return json({ ok: false, error: "UNAUTH" }, 401);

  // Already an influencer?
  const { data: infl } = await supabase
    .from("influencer_profiles")
    .select("active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (infl?.active)
    return json({
      ok: true,
      status: "influencer",
      message: "Already approved",
    });

  // Existing request?
  const { data: last } = await supabase
    .from("influencer_requests")
    .select("id, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last?.status === "pending") {
    return json({
      ok: true,
      status: "pending",
      requested_at: last.created_at,
      message: "Request already pending",
    });
  }

  // Create (or re-apply after rejection)
  const { data: created, error } = await supabase
    .from("influencer_requests")
    .insert({
      user_id: user.id,
      handle: (body.handle || "").trim() || null,
      note: (body.note || "").trim() || null,
      social: body.social ?? {},
      status: "pending",
    })
    .select("id, created_at")
    .single();

  if (error) return json({ ok: false, error: error.message }, 400);

  return json({
    ok: true,
    status: "pending",
    requested_at: created.created_at,
    message: "Request submitted",
  });
}
