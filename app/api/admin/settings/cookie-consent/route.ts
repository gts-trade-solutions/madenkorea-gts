// /api/admin/settings/cookie-consent
//
// GET  — returns { delaySeconds }
// POST — updates the column on store_settings (admin only).
//
// Bounded server-side: 1..60 seconds.

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

const json = (d: any, s = 200) =>
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
  if (!user)
    return { supabase, user: null, error: json({ ok: false, error: "UNAUTH" }, 401) };

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "admin" && prof?.role !== "super_admin")
    return { supabase, user: null, error: json({ ok: false, error: "FORBIDDEN" }, 403) };

  return { supabase, user, error: null };
}

function clampDelay(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(60, Math.floor(n)));
}

function clampScroll(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

export async function GET() {
  const { error, supabase } = await getAdminOr401();
  if (error) return error;
  const { data } = await supabase
    .from("store_settings")
    .select(
      "cookie_consent_delay_seconds, cookie_consent_scroll_threshold"
    )
    .eq("id", 1)
    .maybeSingle();
  return json({
    ok: true,
    delaySeconds: clampDelay(data?.cookie_consent_delay_seconds ?? 7),
    scrollThreshold: clampScroll(data?.cookie_consent_scroll_threshold ?? 1),
  });
}

export async function POST(req: Request) {
  const { supabase, error } = await getAdminOr401();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const delaySeconds = clampDelay(body?.delaySeconds);
  const scrollThreshold = clampScroll(body?.scrollThreshold);

  const { error: upErr } = await supabase
    .from("store_settings")
    .update({
      cookie_consent_delay_seconds: delaySeconds,
      cookie_consent_scroll_threshold: scrollThreshold,
    })
    .eq("id", 1);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  return json({ ok: true, delaySeconds, scrollThreshold });
}
