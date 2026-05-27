// POST /api/admin/users/[user_id]/verification
//
// Per-user admin actions for the email verification system.
// Body shape: { action: "extend" | "mark-verified" | "resend", days?: number }
//
//   - extend          : adds `days` to the current deadline (computed or
//                       override). Stored as an absolute override timestamp,
//                       so future global config changes don't shift it.
//   - mark-verified   : admin override — sets profiles.email_verified_at =
//                       now(). Useful when a customer confirms identity via
//                       another channel (WhatsApp, phone).
//   - resend          : fires a fresh verification email to the user's
//                       current address. Subject to the same rate limit
//                       (60s) as the user-facing resend.

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createServiceClient } from "@/lib/supabaseServer";
import {
  canResendVerification,
  getEmailVerificationConfig,
  getEmailVerificationStatus,
  markUserVerified,
} from "@/lib/auth/emailVerification";
import { sendVerificationEmail } from "@/lib/auth/sendVerificationEmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

async function getAdminOr401() {
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();
  let user: any = null;
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(auth.slice(7));
    user = data.user;
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return { user: null, error: json({ ok: false, error: "UNAUTH" }, 401) };
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "admin" && prof?.role !== "super_admin")
    return { user: null, error: json({ ok: false, error: "FORBIDDEN" }, 403) };
  return { user, error: null };
}

export async function POST(
  req: Request,
  { params }: { params: { user_id: string } }
) {
  const { user: admin, error } = await getAdminOr401();
  if (error) return error;

  const userId = params.user_id;
  if (!userId) return json({ ok: false, error: "missing_user_id" }, 400);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "").trim();
  const sb = createServiceClient();

  if (action === "extend") {
    const days = Math.max(1, Math.min(365, Math.floor(Number(body?.days) || 0)));
    if (days <= 0) return json({ ok: false, error: "invalid_days" }, 400);

    // Compute the new absolute deadline based on the CURRENT effective
    // deadline (override or computed) + N days. Storing as absolute
    // prevents shifts when the global lockout changes later.
    const status = await getEmailVerificationStatus(userId);
    const cfg = await getEmailVerificationConfig();
    const graceStart = status.graceStartsAt
      ? new Date(status.graceStartsAt)
      : new Date();
    const currentDeadline = status.lockoutAt
      ? new Date(status.lockoutAt)
      : new Date(graceStart.getTime() + cfg.lockoutDays * 86400000);
    const newDeadline = new Date(currentDeadline.getTime() + days * 86400000);

    const { error: upErr } = await sb
      .from("profiles")
      .update({
        email_verification_deadline_override: newDeadline.toISOString(),
      })
      .eq("id", userId);
    if (upErr) return json({ ok: false, error: upErr.message }, 500);

    return json({
      ok: true,
      deadline: newDeadline.toISOString(),
      addedDays: days,
    });
  }

  if (action === "mark-verified") {
    await markUserVerified(userId);
    return json({ ok: true });
  }

  if (action === "resend") {
    // Look up canonical email + locale.
    const { data: authUser } = await sb.auth.admin.getUserById(userId);
    if (!authUser?.user?.email)
      return json({ ok: false, error: "no_email" }, 400);

    const { data: profile } = await sb
      .from("profiles")
      .select("preferred_locale, email_verified_at")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.email_verified_at)
      return json({ ok: true, alreadyVerified: true });

    const allowed = await canResendVerification(userId, 60);
    if (!allowed)
      return json(
        { ok: false, error: "rate_limited", message: "User received a verification email in the last minute." },
        429
      );

    await sendVerificationEmail({
      userId,
      email: authUser.user.email,
      locale: (profile?.preferred_locale as string | null) ?? null,
      origin: new URL(req.url).origin,
    });
    return json({ ok: true });
  }

  return json({ ok: false, error: "invalid_action" }, 400);
}
