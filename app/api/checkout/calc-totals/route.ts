import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { supabaseRouteClient } from "@/lib/supabaseRoute";
import { getPromoCodeFromCookie } from "@/lib/promo-cookie";
import { roundMoney } from "@/lib/currency";
import { computeShippingFee } from "@/lib/membership";
import { getShippingConfig } from "@/lib/storeSettings";

type LineInput = { product_id: string; qty: number };

const GLOBAL_CAP_PERCENT = 25;

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
      "id,name,price,currency,is_published,promo_exempt,sale_price,sale_starts_at,sale_ends_at,stock_qty"
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

  const currency = products![0].currency;

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

    if (p.currency !== currency) {
      return NextResponse.json(
        { ok: false, error: "MIXED_CURRENCY_NOT_SUPPORTED" },
        { status: 400 }
      );
    }
  }

  const { data: caps, error: cErr } = await sb
    .from("influence_caps")
    .select("product_id,cap_percent")
    .in("product_id", productIds);

  if (cErr) {
    return NextResponse.json(
      { ok: false, error: cErr.message },
      { status: 500 }
    );
  }

  const capMap = new Map(
    (caps as any[]).map((c) => [c.product_id, Number(c.cap_percent)])
  );

  const code = getPromoCodeFromCookie();
  let promo: any = null;

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
      !p.promo_exempt &&
      (promo.scope === "global" || promo.product_id === p.id);

    if (eligible) {
      const cap = capMap.get(p.id) ?? GLOBAL_CAP_PERCENT;

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

 const shippingConfig = await getShippingConfig();
 const shipping_fee = roundMoney(
   computeShippingFee(subtotal, activeMembership, shippingConfig)
 );

const total = roundMoney(subtotal + shipping_fee - discount_total);

  return NextResponse.json({
    ok: true,
    currency,
    subtotal,
    shipping_fee,
    discount_total,
    total,
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
