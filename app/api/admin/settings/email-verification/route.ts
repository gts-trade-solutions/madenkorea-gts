// /api/admin/settings/email-verification
//
// GET  → returns { graceDays, lockoutDays }
// POST → updates the two columns on store_settings (admin only).
//
// Days are bounded server-side: grace 1..90, lockout 1..365. Ensures
// the UI can't push pathological values that effectively disable
// gating or lock everyone out instantly.

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getEmailVerificationConfig } from "@/lib/auth/emailVerification";

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

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function GET() {
  const { error } = await getAdminOr401();
  if (error) return error;
  const cfg = await getEmailVerificationConfig();
  return json({ ok: true, ...cfg });
}

export async function POST(req: Request) {
  const { supabase, error } = await getAdminOr401();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const graceDays = clampInt(body?.graceDays, 1, 90, 7);
  const lockoutDays = clampInt(body?.lockoutDays, 1, 365, 30);

  if (graceDays > lockoutDays) {
    return json(
      { ok: false, error: "Grace days must be less than or equal to lockout days." },
      400
    );
  }

  const { error: upErr } = await supabase
    .from("store_settings")
    .update({
      email_verification_grace_days: graceDays,
      email_verification_lockout_days: lockoutDays,
    })
    .eq("id", 1);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  return json({ ok: true, graceDays, lockoutDays });
}
