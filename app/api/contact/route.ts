import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/ses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "").trim();

    if (!name || !email || !message || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, message: "Please provide valid contact details." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("contact_messages").insert({
      name,
      email,
      subject: subject || null,
      message,
      status: "new",
    });

    if (error) {
      console.error("[contact] insert failed:", error);
      return NextResponse.json(
        {
          success: false,
          message: "We could not save your message right now. Please try again.",
        },
        { status: 500 }
      );
    }

    const notifyTo = process.env.CONTACT_NOTIFY_EMAIL || "info@madenkorea.com";
    try {
      await sendEmail({
        to: notifyTo,
        cc: ["operations@madenkorea.com"],
        subject: `New contact message${subject ? `: ${subject}` : ""}`,
        html: `
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject || "-"}</p>
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, "<br/>")}</p>
        `,
      });
    } catch (mailError) {
      console.error("[contact] notification email failed:", mailError);
    }

    return NextResponse.json({
      success: true,
      message: "Message submitted successfully.",
    });
  } catch (err) {
    console.error("[contact] unexpected error:", err);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to submit your message right now.",
      },
      { status: 500 }
    );
  }
}
