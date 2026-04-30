// app/api/me/payouts/request/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/** Helper: get user either from sb-* cookies or Authorization: Bearer */
async function withUser(req: NextRequest) {
  const cookieStore = cookies();
  const sbCookies = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
  let { data: { user } } = await sbCookies.auth.getUser();
  let sb = sbCookies;

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
      if (data.user) { user = data.user; sb = sbBearer as any; }
    }
  }
  return { user, sb };
}

/** Helper: compute available-to-withdraw without requiring an RPC */
async function computeAvailable(sb: any, influencerId: string) {
  // Sum approved commissions
  const { data: atts } = await sb
    .from("order_attributions")
    .select("commission_amount, status")
    .eq("influencer_id", influencerId);
  const approved = (atts || [])
    .filter((r: any) => r.status === "approved")
    .reduce((a: number, r: any) => a + Number(r.commission_amount || 0), 0);

  // Sum payouts (initiated/processing/paid)
  const { data: pays } = await sb
    .from("influencer_payouts")
    .select("amount, status")
    .eq("influencer_id", influencerId)
    .in("status", ["initiated", "processing", "paid"]);
  const debited = (pays || []).reduce((a: number, r: any) => a + Number(r.amount || 0), 0);

  return Math.max(0, approved - debited);
}

export async function POST(req: NextRequest) {
  const { user, sb } = await withUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { method, amount, contact_email, request_note } = await req.json().catch(() => ({}));

  const amt = Number(amount);
  if (!(amt > 0)) return NextResponse.json({ ok: false, error: "Amount must be > 0" }, { status: 400 });
  if (method !== "manual") return NextResponse.json({ ok: false, error: "Only manual payouts supported here" }, { status: 400 });

  // Try RPC first (if you have it); otherwise compute inline
  let available = 0;
  try {
    const { data } = await sb.rpc("influencer_available_to_withdraw", { p_influencer_id: user.id }).single();
    if (data && typeof data.available !== "undefined") {
      available = Number(data.available || 0);
    } else {
      available = await computeAvailable(sb, user.id);
    }
  } catch {
    available = await computeAvailable(sb, user.id);
  }

  if (amt > available + 0.0001) {
    return NextResponse.json({ ok: false, error: "Amount exceeds available balance" }, { status: 400 });
  }

  // Store the request (no email side-effect)
  const note =
    request_note
      ? String(request_note)
      : `manual_payout | ${JSON.stringify({ contact: contact_email || null })}`;

  const { data, error } = await sb
    .from("influencer_payouts")
    .insert({
      influencer_id: user.id,
      amount: amt,
      currency: "INR",
      status: "initiated",      // Admin will move to processing/paid later
      notes: note,
      covering_orders: [],
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
