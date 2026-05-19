import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { supabaseRouteClient } from "@/lib/supabaseRoute";
import { getPromoCodeFromCookie } from "@/lib/promo-cookie";
import {
  roundMoney,
  isSupportedCurrency,
  type CurrencyCode,
} from "@/lib/currency";
import { computeShippingFee } from "@/lib/membership";
import { getShippingConfig } from "@/lib/storeSettings";
import {
  getCountryShippingRate,
  totalCartWeightGrams,
} from "@/lib/internationalShipping";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

type LineInput = { product_id: string; qty: number };

// Per-influencer commission cap lives on
// influencer_profiles.commission_cap_pct (admin-managed). The previous
// GLOBAL_CAP_PERCENT = 25 constant is gone; we look up the cap per
// promo based on its influencer_id.
//
// NOTE: The `influence_caps` table (per-product overrides) is no
// longer read here. Kept in the DB schema and will be re-wired later;
// see CODEBASE_REFERENCE.md → "Deferred wiring".

function isSaleActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function effectiveUnitPrice(p: any) {
  const saleOk =
    p?.sale_price != null &&
    isSaleActive(p?.sale_starts_at ?? null, p?.sale_ends_at ?? null);

  return saleOk && p?.sale_price != null
    ? Number(p.sale_price)
    : Number(p.price ?? 0);
}

export async function POST(req: NextRequest) {
const body = await req.json().catch(() => ({}));
const lines: LineInput[] = Array.isArray(body?.lines) ? body.lines : [];

// C-32 fix: shipping fee is computed server-side from the cart subtotal
// and the user's membership status. The previous override
// (`body.shippingFee`) let any caller force shipping to 0; that path is
// now removed entirely. If clients send a `shippingFee` value it is
// silently ignored.

  if (!lines.length) {
    return NextResponse.json(
      { ok: false, error: "EMPTY_CART" },
      { status: 400 }
    );
  }

  if (!lines.every((l) => l.product_id && Number(l.qty) > 0)) {
    return NextResponse.json(
      { ok: false, error: "BAD_LINES" },
      { status: 400 }
    );
  }

  const sb = createAdminClient();
  const routeClient = supabaseRouteClient();

  const { data: authData } = await routeClient.auth.getUser();
  const userId = authData.user?.id ?? null;

  const productIds = [...new Set(lines.map((l) => l.product_id))];

  const { data: products, error: pErr } = await sb
    .from("products")
    .select(
      "id,name,price,currency,is_published,promo_exempt,sale_price,sale_starts_at,sale_ends_at,stock_qty,net_weight_g"
    )
    .in("id", productIds);

  if (pErr) {
    return NextResponse.json(
      { ok: false, error: pErr.message },
      { status: 500 }
    );
  }

  const prodMap = new Map(products!.map((p: any) => [p.id, p]));

  if (prodMap.size !== productIds.length) {
    return NextResponse.json(
      { ok: false, error: "PRODUCT_NOT_FOUND" },
      { status: 404 }
    );
  }

  // All products are stored canonically in INR. The mixed-currency
  // guard from the INR-only era is gone — international support
  // (model A) does the per-buyer FX conversion further down. We still
  // validate that every row claims INR so a future bad import row
  // doesn't silently slip in.
  for (const p of products as any[]) {
    if (!p.is_published) {
      return NextResponse.json(
        { ok: false, error: "UNPUBLISHED_ITEM" },
        { status: 400 }
      );
    }
    if (Number(p.stock_qty ?? 0) <= 0) {
      return NextResponse.json(
        { ok: false, error: "OUT_OF_STOCK_ITEM", product_id: p.id },
        { status: 400 }
      );
    }
    if (p.currency && p.currency !== "INR") {
      return NextResponse.json(
        { ok: false, error: "NON_INR_PRODUCT_PRICE", product_id: p.id },
        { status: 500 }
      );
    }
  }

  // Per-product caps from `influence_caps` are intentionally NOT
  // queried right now — that's the deferred wiring noted at the top.
  // The only cap that governs checkout math is the influencer's own
  // commission_cap_pct, resolved per-promo below.

  const code = getPromoCodeFromCookie();
  let promo: any = null;
  let influencerCap: number | null = null;

  if (code) {
    const { data: pd, error: perr } = await sb.rpc("get_promo_details", {
      p_code: code,
    });

    if (perr) {
      return NextResponse.json(
        { ok: false, error: perr.message },
        { status: 500 }
      );
    }

    const row = (Array.isArray(pd) ? pd[0] : pd) as any;

    if (row) {
      promo = {
        id: row.id,
        code: row.code,
        scope: row.scope,
        influencer_id: row.influencer_id,
        product_id: row.product_id,
        user_discount_percent: Number(row.user_discount_percent),
        commission_percent: Number(row.commission_percent),
      };

      // Resolve this influencer's cap. If somehow missing (data
      // corruption, manual SQL insert), we treat the promo as
      // ineligible — safer than letting it run uncapped.
      if (promo.influencer_id) {
        const { data: prof } = await sb
          .from("influencer_profiles")
          .select("commission_cap_pct")
          .eq("user_id", promo.influencer_id)
          .maybeSingle();
        if (prof && prof.commission_cap_pct != null) {
          influencerCap = Number(prof.commission_cap_pct);
        }
      }
    }
  }

  const lineResults: any[] = [];
  let subtotal = 0;
  let discount_total = 0;
  let commission_total = 0;

  for (const l of lines) {
    const p = prodMap.get(l.product_id)!;
    const qty = Number(l.qty);

    const unit = effectiveUnitPrice(p);
    const lineSub = roundMoney(unit * qty);
    subtotal = roundMoney(subtotal + lineSub);

    let effUserPct = 0;
    let effCommPct = 0;

    const eligible =
      !!promo &&
      influencerCap != null &&
      !p.promo_exempt &&
      (promo.scope === "global" || promo.product_id === p.id);

    if (eligible) {
      // Only one cap source now: this influencer's per-account cap.
      // No product fallback (deferred), no global constant fallback.
      const cap = influencerCap!;

      effCommPct = Math.min(promo.commission_percent, cap);
      effUserPct = Math.max(
        0,
        Math.min(promo.user_discount_percent, cap - effCommPct)
      );
    }

    const lineDiscount = roundMoney(lineSub * (effUserPct / 100));
    const lineCommission = roundMoney(lineSub * (effCommPct / 100));

    discount_total = roundMoney(discount_total + lineDiscount);
    commission_total = roundMoney(commission_total + lineCommission);

    lineResults.push({
      product_id: p.id,
      qty,
      unit_price: unit,
      line_subtotal: lineSub,
      promo_applied: eligible,
      effective_user_discount_pct: effUserPct,
      effective_commission_pct: effCommPct,
      line_discount: lineDiscount,
      line_commission: lineCommission,
    });
  }

  let activeMembership: { status: string; ends_at: string } | null = null;

  if (userId) {
    const { data: membership } = await sb
      .from("user_memberships")
      .select("status, ends_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    activeMembership = membership ?? null;
  }

  // ─── International vs Indian shipping branch ────────────────────
  //
  // Indian carts use the existing threshold + K-Plus logic. Non-IN
  // carts derive shipping from `country_shipping_rates.rate_per_gram_inr`
  // multiplied by `sum(product.net_weight_g × qty)`. The buyer's
  // currency comes from the `mik_currency` cookie; the amount sent
  // to Razorpay is INR × the current FX rate, snapshotted on the
  // order at create-time so the bill the customer pays matches the
  // total they saw on this page.

  const cookieJar = cookies();
  const rawCountry = cookieJar.get("mik_country")?.value;
  const country = isSupportedCountry(rawCountry) ? rawCountry : DEFAULT_COUNTRY;
  const rawCurrency = cookieJar.get("mik_currency")?.value;
  const buyerCurrency: CurrencyCode =
    isSupportedCurrency(rawCurrency) ? rawCurrency : "INR";

  const isIntl = country !== "IN";

  let shipping_fee_inr = 0;
  let shippingError: { error: string; product_id?: string } | null = null;

  if (!isIntl) {
    const shippingConfig = await getShippingConfig();
    shipping_fee_inr = roundMoney(
      computeShippingFee(subtotal, activeMembership, shippingConfig)
    );
  } else {
    // Every product participating in an international cart MUST have a
    // positive net_weight_g. Catching this here means the UI can show
    // a clear "missing weight" error instead of Razorpay failing later.
    const missing = (products as any[]).filter(
      (p) => !p.net_weight_g || Number(p.net_weight_g) <= 0
    );
    if (missing.length > 0) {
      shippingError = {
        error: "MISSING_PRODUCT_WEIGHT",
        product_id: missing[0].id,
      };
    } else {
      const rate = await getCountryShippingRate(country);
      if (!rate) {
        shippingError = { error: "NO_SHIPPING_RATE_FOR_COUNTRY" };
      } else {
        const grams = totalCartWeightGrams(
          lines.map((l) => ({
            qty: l.qty,
            net_weight_g: prodMap.get(l.product_id)?.net_weight_g ?? null,
          }))
        );
        shipping_fee_inr = roundMoney(grams * Number(rate.rate_per_gram_inr));
      }
    }
  }

  if (shippingError) {
    return NextResponse.json(
      { ok: false, ...shippingError },
      { status: 400 }
    );
  }

  const total = roundMoney(subtotal + shipping_fee_inr - discount_total);

  // Response amounts are in INR — the storefront's `useCurrency()`
  // hook converts to the buyer's currency at render-time via
  // `formatPrice(amountInr)`. Keeping the response INR-canonical
  // means callers don't have to know whether they're rendering for
  // an Indian or international visitor; the conversion is one
  // consistent layer, not two.
  //
  // razorpay/create re-reads the order row (INR) and applies the FX
  // snapshot when it creates the Razorpay order, so it doesn't
  // consume calc-totals output at all.

  return NextResponse.json({
    ok: true,
    currency: "INR",
    subtotal,
    shipping_fee: shipping_fee_inr,
    discount_total,
    total,
    country,
    is_intl: isIntl,
    buyer_currency: buyerCurrency,
    commission_total,
    applied: promo
      ? {
          type: "promo",
          code: promo.code,
          scope: promo.scope,
          influencer_id: promo.influencer_id,
        }
      : null,
    lines: lineResults,
  });
}
