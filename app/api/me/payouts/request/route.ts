// app/api/me/payouts/request/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.SES_REGION || "ap-south-1",
});

/**
 * Shared helper to get Supabase client + authenticated user
 * (matches the pattern you use in other routes like /api/me/summary)
 */
async function withUser(req: NextRequest) {
  const cookieStore = cookies();

  const sbCookies = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {
          // no-op on server
        },
        remove() {
          // no-op on server
        },
      },
    }
  );

  let {
    data: { user },
  } = await sbCookies.auth.getUser();
  let sb: any = sbCookies;

  // Fallback to Authorization: Bearer token (used by your frontend)
  if (!user) {
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

    if (token) {
      const sbBearer = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );

      const { data } = await sbBearer.auth.getUser(token);
      if (data.user) {
        user = data.user;
        sb = sbBearer as any;
      }
    }
  }

  return { user, sb };
}

export async function POST(req: NextRequest) {
  const { user, sb } = await withUser(req);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // ---- Parse body from frontend ----
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const amount = Number(body.amount || 0);
  const method: string = body.method || "manual"; // e.g. "manual", "upi", "bank"
  const contact_email: string | null = body.contact_email || user.email || null;
  const request_note: string | null = body.request_note || null;

  if (!(amount > 0)) {
    return NextResponse.json(
      { ok: false, error: "Amount must be greater than 0." },
      { status: 400 }
    );
  }

  // ---- 1) Recalculate available wallet on the server ----
  // Same logic idea as your /api/me/summary: available = approved commissions - payouts
  const { data: lifeAgg, error: lifeErr } = await sb
    .from("order_attributions")
    .select("commission_amount, status")
    .eq("influencer_id", user.id);

  if (lifeErr) {
    console.error("order_attributions error", lifeErr);
    return NextResponse.json(
      { ok: false, error: "Failed to load earnings." },
      { status: 500 }
    );
  }

  const lifetimeRows = lifeAgg || [];

  // Only commissions that are actually unlocked / withdrawable
  const approvedTotal = lifetimeRows
    .filter((r: any) => r.status === "approved")
    .reduce((acc: number, r: any) => acc + Number(r.commission_amount || 0), 0);

  const { data: payoutsAgg, error: payoutsErr } = await sb
    .from("influencer_payouts")
    .select("amount, status")
    .eq("influencer_id", user.id)
    // any payout that isn't failed/canceled is treated as debited
    .in("status", ["initiated", "processing", "paid"]);

  if (payoutsErr) {
    console.error("payouts error", payoutsErr);
    return NextResponse.json(
      { ok: false, error: "Failed to load payouts." },
      { status: 500 }
    );
  }

  const debited = (payoutsAgg || []).reduce(
    (acc: number, r: any) => acc + Number(r.amount || 0),
    0
  );

  const available = Math.max(0, approvedTotal - debited);

  if (amount > available + 0.0001) {
    return NextResponse.json(
      {
        ok: false,
        error: `You can request up to ${available.toFixed(2)} right now.`,
      },
      { status: 400 }
    );
  }

  // ---- 2) Insert payout row: this creates "Pending" in UI & debits wallet ----
  // NOTE: even though DB default is 'pending', we explicitly set 'initiated'
  // so it matches your frontend PayoutRow status & "Pending review" badge.
  const { data: inserted, error: insertErr } = await sb
    .from("influencer_payouts")
    .insert({
      influencer_id: user.id,
      amount,
      currency: "INR",
      status: "initiated", // <-- pending request in UI
      method,
      contact_email,
      notes: request_note, // JSON string with UPI/bank details from frontend
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("insert payout error", insertErr);
    return NextResponse.json(
      { ok: false, error: "Could not create payout request." },
      { status: 500 }
    );
  }

  // ---- 3) Send AWS SES email to admin with payout details ----
  const adminEmail = "operations@madenkorea.com";
  const fromEmail = "info@madenkorea.com";

  if (adminEmail && fromEmail) {
    try {
      const textLines = [
        "New payout request",
        "",
        `Influencer ID: ${user.id}`,
        `Email: ${user.email || "N/A"}`,
        `Requested amount: ₹${amount.toFixed(2)}`,
        `Method: ${method}`,
        `Contact email: ${contact_email || "N/A"}`,
        "",
        "Raw request note (JSON):",
        request_note || "(none)",
      ];

      const cmd = new SendEmailCommand({
        Source: fromEmail,
        Destination: {
          ToAddresses: [adminEmail],
          // Operations is CC'd on all team-facing notifications so
          // payout requests land in both inboxes.
          CcAddresses: ["operations@madenkorea.com"],
        },
        Message: {
          Subject: {
            Data: `New payout request: ₹${amount.toFixed(2)}`,
          },
          Body: {
            Text: {
              Data: textLines.join("\n"),
            },
          },
        },
      });

      await ses.send(cmd);
    } catch (err) {
      console.error("Failed to send payout SES email", err);
      // do NOT fail the API if email fails – the payout row is already created
    }
  } else {
    console.warn(
      "PAYOUT_ADMIN_EMAIL or SES_FROM_EMAIL not set, skipping SES email."
    );
  }

  // ---- 4) Done ----
  return NextResponse.json({ ok: true, payout_id: inserted.id });
}
