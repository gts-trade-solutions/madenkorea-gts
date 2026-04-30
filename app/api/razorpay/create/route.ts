import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabaseRoute";

export async function POST(req: NextRequest) {
  try {
    const routeClient = supabaseRouteClient();
    const { data: authData } = await routeClient.auth.getUser();
    const userId = authData.user?.id ?? null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { order_id, attribution } = body || {};

    if (!order_id) {
      return NextResponse.json(
        { ok: false, error: "Missing order_id" },
        { status: 400 }
      );
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select(
        "id, user_id, subtotal, shipping_fee, discount_total, total, currency, status"
      )
      .eq("id", order_id)
      .maybeSingle();

    if (oErr || !order) {
      return NextResponse.json(
        { ok: false, error: "Order not found" },
        { status: 404 }
      );
    }

    if (order.user_id !== userId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    if (!["created", "pending_payment"].includes(order.status)) {
      return NextResponse.json(
        { ok: false, error: `Order status ${order.status} not payable` },
        { status: 400 }
      );
    }

    const orderSubtotal = Number(order.subtotal) || 0;
    const orderDiscount = Number(order.discount_total) || 0;
    const serverShipping = Number(order.shipping_fee) || 0;
    const serverTotal = Number(order.total) || 0;

    const shippingToUse = Number(serverShipping.toFixed(2));
    let amountToUse = serverTotal;
    if (!(amountToUse > 0)) {
      amountToUse = orderSubtotal + shippingToUse - orderDiscount;
    }

    amountToUse = Number(amountToUse.toFixed(2));

    await admin
      .from("orders")
      .update({
        shipping_fee: shippingToUse,
        total: amountToUse,
        status: "pending_payment",
      })
      .eq("id", order.id);

    const amountPaise = Math.round(amountToUse * 100);

    const notes: Record<string, any> = {
      app_order_id: order.id,
    };

    let promoCodeId: string | null = null;
    let influencerId: string | null = null;
    let discountPercent = 0;
    let commissionPercent = 0;

    if (attribution?.type === "promo" && attribution?.code) {
      const { data: promo, error: promoErr } = await admin
        .from("promo_codes")
        .select(
          "id, influencer_id, discount_percent, commission_percent, active, starts_at, expires_at"
        )
        .eq("code", attribution.code)
        .eq("active", true)
        .maybeSingle();

      if (promoErr) {
        console.warn("[RZP:create] promo lookup error:", promoErr.message);
      }

      if (promo) {
        const now = new Date();
        const inWindow =
          (!promo.starts_at || new Date(promo.starts_at) <= now) &&
          (!promo.expires_at || new Date(promo.expires_at) >= now);

        if (inWindow) {
          promoCodeId = promo.id;
          influencerId = promo.influencer_id;
          discountPercent = Number(promo.discount_percent || 0);
          commissionPercent = Number(promo.commission_percent || 0);

          await admin
            .from("order_attributions")
            .upsert(
              {
                order_id: order.id,
                influencer_id: influencerId,
                promo_code_id: promoCodeId,
                attributed_by: "promo",
                discount_percent: discountPercent,
                commission_percent: commissionPercent,
                commission_amount: 0,
                currency: order.currency || "INR",
                status: "pending",
              },
              { onConflict: "order_id" }
            );

          await admin
            .from("orders")
            .update({
              promo_code_id: promoCodeId,
              promo_snapshot: {
                id: promo.id,
                code: attribution.code,
                discount_percent: discountPercent,
                commission_percent: commissionPercent,
                influencer_id: influencerId,
              },
            })
            .eq("id", order.id);

          notes.type = "promo";
          notes.code = attribution.code;
          notes.promo_code_id = promoCodeId;
          notes.influencer_id = influencerId;
          notes.discount_percent = discountPercent;
          notes.commission_percent = commissionPercent;
        }
      }
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const rzpOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: order.currency || "INR",
      receipt: order.id,
      notes,
    });

    await admin.from("payment_orders").insert({
      order_id: order.id,
      provider: "razorpay",
      provider_order_id: rzpOrder.id,
      amount: amountToUse,
      currency: order.currency || "INR",
      status: "created",
      receipt: rzpOrder.receipt || order.id,
    });

    return NextResponse.json({
      ok: true,
      key: process.env.RAZORPAY_KEY_ID,
      razorpay_order: rzpOrder,
    });
  } catch (e: any) {
    console.error("[RZP:create] error", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed" },
      { status: 500 }
    );
  }
}
