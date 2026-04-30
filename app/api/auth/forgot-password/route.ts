import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/ses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_MESSAGE =
  "If an account exists for this email, a reset link has been sent.";
const DELIVERY_FAILURE_MESSAGE =
  "We couldn't send the reset email right now. Please try again later or contact support.";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findAuthUserByEmail(supabase: any, email: string) {
  const target = email.toLowerCase();
  const perPage = 200;
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const users = data?.users ?? [];
    const found = users.find(
      (u: any) => (u?.email || "").toLowerCase() === target
    );
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = String(body?.email || "").trim();
    const email = emailRaw.toLowerCase();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({
        success: true,
        message: GENERIC_MESSAGE,
        deliveryStatus: "accepted",
      });
    }

    const supabase = createServiceClient();
    const user = await findAuthUserByEmail(supabase as any, email);

    let deliveryStatus: "accepted" | "sent" | "failed" = "accepted";
    let success = true;
    let message = GENERIC_MESSAGE;

    if (user?.id) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 1000 * 60 * 30).toISOString();

      const { error: invalidateError } = await supabase
        .from("password_reset_tokens")
        .update({ used_at: now.toISOString() })
        .eq("email", email)
        .is("used_at", null);

      if (invalidateError) {
        console.error("[forgot-password] token invalidate failed:", invalidateError);
        return NextResponse.json({
          success: false,
          message: DELIVERY_FAILURE_MESSAGE,
          deliveryStatus: "failed",
        });
      }

      const { error: insertError } = await supabase
        .from("password_reset_tokens")
        .insert({
          email,
          token_hash: tokenHash,
          expires_at: expiresAt,
        });

      if (!insertError) {
        const appBase =
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.APP_URL ||
          req.nextUrl.origin;
        const resetUrl = `${appBase}/auth/reset?token=${encodeURIComponent(
          token
        )}`;
        const resetFrom ="info@madenkorea.com";
        const sesRegion =
          process.env.AWS_SES_REGION ||
          process.env.SES_REGION ||
          process.env.AWS_REGION ||
          "";

        try {
          console.log("[forgot-password] attempting SES send", {
            email,
            userId: user.id,
            sender: resetFrom || "(empty)",
            sesRegion: sesRegion || "(empty)",
          });

          await sendEmail({
            to: email,
            from: resetFrom,
            subject: "Reset your password",
            html: `
              <p>Hello,</p>
              <p>We received a request to reset your password.</p>
              <p><a href="${resetUrl}">Reset your password</a></p>
              <p>This link expires in 30 minutes and can only be used once.</p>
              <p>If you did not request this, you can ignore this email.</p>
            `,
          });
          console.log("[forgot-password] SES send success", {
            email,
            userId: user.id,
          });
          deliveryStatus = "sent";
        } catch (mailError) {
          console.error("[forgot-password] email send failed:", {
            email,
            userId: user.id,
            reason:
              mailError instanceof Error ? mailError.message : String(mailError),
            sender: resetFrom || "(empty)",
            sesRegion: sesRegion || "(empty)",
            hasAppUrl:
              !!process.env.NEXT_PUBLIC_APP_URL ||
              !!process.env.APP_URL ||
              !!req.nextUrl.origin,
            hasRegion:
              !!process.env.AWS_SES_REGION ||
              !!process.env.SES_REGION ||
              !!process.env.AWS_REGION,
            hasAccessKey: !!process.env.SES_ACCESS_KEY_ID,
            hasSecret: !!process.env.SES_SECRET_ACCESS_KEY,
            hasFrom: !!process.env.AWS_FROM_EMAIL || !!process.env.MAIL_FROM,
          });
          success = false;
          message = DELIVERY_FAILURE_MESSAGE;
          deliveryStatus = "failed";
        }
      } else {
        console.error("[forgot-password] token insert failed:", insertError);
        success = false;
        message = DELIVERY_FAILURE_MESSAGE;
        deliveryStatus = "failed";
      }
    }

    return NextResponse.json({
      success,
      message,
      deliveryStatus,
    });
  } catch (error) {
    console.error("[forgot-password] unexpected error:", error);
    return NextResponse.json({
      success: false,
      message: DELIVERY_FAILURE_MESSAGE,
      deliveryStatus: "failed",
    });
  }
}
