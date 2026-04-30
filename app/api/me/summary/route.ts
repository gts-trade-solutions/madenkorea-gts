import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * Shared auth helper – same pattern as your other routes.
 */
async function withUser(req: NextRequest) {
  const cookieStore = cookies();
  const sbCookies = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
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

export async function GET(req: NextRequest) {
  const { user, sb } = await withUser(req);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // ---------- 1) Commissions: order_attributions ----------
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

  const commissionRows: any[] = lifeAgg || [];

  // Total commission from all orders (any status)
  const lifetime = commissionRows.reduce(
    (sum, r) => sum + Number(r.commission_amount || 0),
    0
  );

  // Only "approved" commission is actually withdrawable
  const approvedCommission = commissionRows
    .filter((r) => r.status === "approved")
    .reduce(
      (sum, r) => sum + Number(r.commission_amount || 0),
      0
    );

  // ---------- 2) Payouts: influencer_payouts ----------
  const { data: payoutsAgg, error: payoutsErr } = await sb
    .from("influencer_payouts")
    .select("amount, status")
    .eq("influencer_id", user.id);

  if (payoutsErr) {
    console.error("payouts error", payoutsErr);
    return NextResponse.json(
      { ok: false, error: "Failed to load payouts." },
      { status: 500 }
    );
  }

  const payoutRows: any[] = payoutsAgg || [];

  // Treat legacy "pending" as pending too, along with "initiated" & "processing"
  const pendingPayout = payoutRows
    .filter((r) =>
      ["pending", "initiated", "processing"].includes(String(r.status))
    )
    .reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0
    );

  const paidPayout = payoutRows
    .filter((r) => String(r.status) === "paid")
    .reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0
    );

  // Everything that is not failed/canceled but already requested is "debited"
  const debited = pendingPayout + paidPayout;

  // ---------- 3) Available wallet ----------
  // Available = approved commissions – (pending payouts + paid payouts)
  const available = Math.max(0, approvedCommission - debited);

  return NextResponse.json({
    ok: true,
    lifetime_commission: lifetime,       // total earned (all statuses)
    pending_total: pendingPayout,        // payout requests waiting (UI "Pending")
    paid_total: paidPayout,              // fully paid-out withdrawals
    available_to_withdraw: available,    // current wallet balance
  });
}
