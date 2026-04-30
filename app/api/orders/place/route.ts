// app/api/orders/place/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getPromoCodeFromCookie } from "@/lib/promo-cookie";

type PlaceInput = { lines: { product_id: string; qty: number }[]; shippingFee: number };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as PlaceInput;

  // Reuse the calc endpoint to ensure identical math
  const calcRes = await fetch(new URL("/api/checkout/calc-totals", req.nextUrl.origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines: body.lines, shippingFee: body.shippingFee }),
    cache: "no-store",
  });
  const calc = await calcRes.json();
  if (!calc.ok) return NextResponse.json(calc, { status: 400 });

  const sb = createAdminClient();

  // 1) Create order (add your address/payment refs as needed)
  const { data: order, error: oErr } = await sb
    .from("orders")
    .insert({
      user_id: null, // attach your auth user if available
      subtotal: calc.subtotal,
      shipping_fee: calc.shipping_fee,
      discount_total: calc.discount_total,
      total: calc.total,
      status: "paid",
      currency: calc.currency,
    })
    .select("id")
    .single();
  if (oErr) return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });

  // 2) Attribution rows (only if promo applied)
  if (calc.applied?.type === "promo") {
    const code = getPromoCodeFromCookie();
    let promoId: string | null = null;
    let influencerId: string | null = calc.applied.influencer_id ?? null;

    if (code) {
      const { data: pd } = await sb.rpc("get_promo_details", { p_code: code });
      const row = (Array.isArray(pd) ? pd[0] : pd) as any;
      promoId = row?.id ?? null;
      influencerId = influencerId ?? row?.influencer_id ?? null;
    }

    if (influencerId) {
      // order_attributions (order level)
      const { error: aErr } = await sb.from("order_attributions").insert({
        order_id: order.id,
        influencer_id: influencerId,
        promo_code_id: promoId,
        attributed_by: "promo",
        user_discount_total: calc.discount_total,
        commission_total: calc.commission_total,
        currency: calc.currency,
        status: "pending",
      });
      if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });

      // order_attribution_items (per-line)
      const rows = (calc.lines as any[])
        .filter((l) => l.promo_applied)
        .map((l) => ({
          order_id: order.id,
          influencer_id: influencerId!,
          promo_code_id: promoId,
          product_id: l.product_id,
          qty: l.qty,
          unit_price: l.unit_price,
          currency: calc.currency,
          effective_user_discount_pct: l.effective_user_discount_pct,
          effective_commission_pct: l.effective_commission_pct,
          discount_amount: l.line_discount,
          commission_amount: l.line_commission,
        }));

      if (rows.length) {
        const { error: aiErr } = await sb.from("order_attribution_items").insert(rows);
        if (aiErr) return NextResponse.json({ ok: false, error: aiErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, order_id: order.id, summary: calc });
}
