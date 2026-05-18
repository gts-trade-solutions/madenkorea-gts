import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabaseRoute";
import {
  FALLBACK_RATES,
  isSupportedCurrency,
  roundMoney,
  toRazorpayMinorUnits,
  type CurrencyCode,
} from "@/lib/currency";
import {
  getCountryShippingRate,
  totalCartWeightGrams,
} from "@/lib/internationalShipping";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

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

    // The order row was created by `create_order_from_cart` with all
    // amounts in INR. For international buyers we now (a) override
    // shipping with the weight-based rate for their country, (b) FX-
    // convert to the buyer's currency, and (c) update the orders row
    // with both the buyer-currency view AND the INR snapshot + rate so
    // emails, refunds, and analytics can read either.

    const cookieJar = cookies();
    const rawCountry = cookieJar.get("mik_country")?.value;
    const country = isSupportedCountry(rawCountry)
      ? rawCountry
      : DEFAULT_COUNTRY;
    const rawCurrency = cookieJar.get("mik_currency")?.value;
    const buyerCurrency: CurrencyCode = isSupportedCurrency(rawCurrency)
      ? rawCurrency
      : "INR";
    const isIntl = country !== "IN";

    // Snapshot the buyer's preferred locale (from the same cookie the
    // storefront's CountrySwitcher writes) so the order confirmation
    // email gets sent in the language they were using at order time —
    // even if their session locale changes between create and verify.
    const recipientLocale = cookieJar.get("mik_locale")?.value || null;

    let subtotalInr = roundMoney(Number(order.subtotal) || 0);
    let discountInr = roundMoney(Number(order.discount_total) || 0);
    let shippingInr = roundMoney(Number(order.shipping_fee) || 0);

    if (isIntl) {
      // Pull cart-line weights for the products in this order. We
      // intentionally read from `order_items` (not the live cart)
      // because the order is the source of truth from this point on.
      const { data: orderItems, error: oiErr } = await admin
        .from("order_items")
        .select("product_id, quantity")
        .eq("order_id", order.id);
      if (oiErr || !orderItems?.length) {
        return NextResponse.json(
          { ok: false, error: "ORDER_ITEMS_NOT_FOUND" },
          { status: 500 }
        );
      }

      const { data: weightRows, error: wErr } = await admin
        .from("products")
        .select("id, net_weight_g")
        .in(
          "id",
          orderItems.map((r: any) => r.product_id)
        );
      if (wErr) {
        return NextResponse.json(
          { ok: false, error: wErr.message },
          { status: 500 }
        );
      }
      const weightMap = new Map(
        (weightRows ?? []).map((r: any) => [r.id, r.net_weight_g])
      );

      const missing = orderItems.find(
        (it: any) =>
          !weightMap.get(it.product_id) ||
          Number(weightMap.get(it.product_id)) <= 0
      );
      if (missing) {
        return NextResponse.json(
          {
            ok: false,
            error: "MISSING_PRODUCT_WEIGHT",
            product_id: missing.product_id,
          },
          { status: 400 }
        );
      }

      const rate = await getCountryShippingRate(country);
      if (!rate) {
        return NextResponse.json(
          { ok: false, error: "NO_SHIPPING_RATE_FOR_COUNTRY", country },
          { status: 400 }
        );
      }

      const grams = totalCartWeightGrams(
        orderItems.map((it: any) => ({
          qty: it.quantity,
          net_weight_g: weightMap.get(it.product_id) ?? null,
        }))
      );
      shippingInr = roundMoney(grams * Number(rate.rate_per_gram_inr));
    }

    const totalInr = roundMoney(subtotalInr + shippingInr - discountInr);

    // FX rate snapshot. INR keeps a rate of 1.0; international buyers
    // get whatever the current `currency_rates` row says, with the
    // compiled-in fallback as a safety net so we never crash mid-pay.
    let fxRate = 1;
    if (isIntl && buyerCurrency !== "INR") {
      const { data: rateRow } = await admin
        .from("currency_rates")
        .select("rate_from_inr, active")
        .eq("code", buyerCurrency)
        .eq("active", true)
        .maybeSingle();
      fxRate =
        Number(rateRow?.rate_from_inr) ||
        FALLBACK_RATES[buyerCurrency]?.rate_from_inr ||
        1;
    }

    const buyerSubtotal = roundMoney(subtotalInr * fxRate);
    const buyerDiscount = roundMoney(discountInr * fxRate);
    const buyerShipping = roundMoney(shippingInr * fxRate);
    const buyerTotal = roundMoney(totalInr * fxRate);

    const orderCurrency: CurrencyCode = isIntl ? buyerCurrency : "INR";

    // Persist the dual-currency view + the FX snapshot so verify can
    // render correctly and reporting can roll up across currencies.
    // Existing amount columns hold the buyer-currency view going
    // forward; the *_inr columns hold the INR snapshot.
    await admin
      .from("orders")
      .update({
        currency: orderCurrency,
        subtotal: buyerSubtotal,
        shipping_fee: buyerShipping,
        discount_total: buyerDiscount,
        total: buyerTotal,
        subtotal_inr: subtotalInr,
        shipping_fee_inr: shippingInr,
        discount_total_inr: discountInr,
        total_inr: totalInr,
        fx_rate_snapshot: fxRate,
        recipient_locale: recipientLocale,
        status: "pending_payment",
      })
      .eq("id", order.id);

    const amountMinor = toRazorpayMinorUnits(buyerTotal, orderCurrency);

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
                currency: orderCurrency,
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
      amount: amountMinor,
      currency: orderCurrency,
      receipt: order.id,
      notes,
    });

    await admin.from("payment_orders").insert({
      order_id: order.id,
      provider: "razorpay",
      provider_order_id: rzpOrder.id,
      amount: buyerTotal,
      currency: orderCurrency,
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
