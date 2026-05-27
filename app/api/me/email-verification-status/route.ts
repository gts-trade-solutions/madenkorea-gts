// GET /api/me/email-verification-status
//
// Returns the signed-in user's verification status (stage, deadline,
// days remaining). Anon callers get { authenticated: false } so the
// banner can render nothing without erroring.

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getEmailVerificationStatus } from "@/lib/auth/emailVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();

  let userId: string | null = null;
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(auth.slice(7));
    userId = data.user?.id ?? null;
  }
  if (!userId) {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  }

  if (!userId) {
    return NextResponse.json({ authenticated: false });
  }

  const status = await getEmailVerificationStatus(userId);
  return NextResponse.json({
    authenticated: true,
    ...status,
  });
}
