import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.SES_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.SES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY!,
  },
});

const FROM_EMAIL = "info@madenkorea.com";
const ADMIN_EMAILS = [
  "kh@raceinnovations.in",
  "operations@madenkorea.com",
  "arunpandian972000@gmail.com",
];

const money = (n: any) => +Number(n || 0).toFixed(2);

function resolveSiteUrl(req: NextRequest) {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    req.nextUrl.origin;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  const dbg: any[] = [];
  try {
    // Basic SES env debug
    console.log("RZP verify: SES env", {
      region: process.env.SES_REGION,
      hasAccessKey: !!process.env.SES_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.SES_SECRET_ACCESS_KEY,
    });

    const url = new URL(req.url);
    const DEBUG = url.searchParams.get("debug") === "1";
    const ALLOW_DEBUG = process.env.NODE_ENV !== "production";
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      app_order_id,
      raw,
      __debug,
    } = body || {};
    const WANT_DEBUG = ALLOW_DEBUG && (DEBUG || !!__debug);

    dbg.push({
      step: "init",
      env: {
        hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasRZPKeyId: !!process.env.RAZORPAY_KEY_ID,
        hasRZPKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
      },
    });

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !app_order_id
    ) {
      const res = {
        ok: false,
        error: "Missing fields",
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 400 });
    }

    // 1) Verify signature
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const sigOk = expected === razorpay_signature;
    dbg.push({
      step: "sig",
      expected,
      provided: razorpay_signature,
      ok: sigOk,
    });
    if (!sigOk) {
      const res = {
        ok: false,
        error: "Invalid signature",
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 400 });
    }

    // Admin (service role) client
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2) Load order (+ fields we use)
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select(
        `
        id,
        user_id,
        status,
        subtotal,
        shipping_fee,
        discount_total,
        total,
        currency,
        order_number,
        promo_code_id,
        promo_snapshot
      `
      )
      .eq("id", app_order_id)
      .maybeSingle();

    dbg.push({ step: "order.load", error: oErr?.message, order });
    if (oErr || !order) {
      const res = {
        ok: false,
        error: "Order not found",
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 404 });
    }
    if (order.status === "paid") {
      const res = {
        ok: true,
        order_id: order.id,
        order_number: order.order_number ?? order.id,
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res);
    }
    if (!["pending_payment", "created"].includes(order.status)) {
      const res = {
        ok: false,
        error: `Order status ${order.status}`,
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 400 });
    }

    // 3) Existing attribution?
    const { data: attrib, error: aErr } = await admin
      .from("order_attributions")
      .select(
        "order_id, influencer_id, promo_code_id, attributed_by, discount_percent, commission_percent, commission_amount, currency, status"
      )
      .eq("order_id", order.id)
      .maybeSingle();
    dbg.push({ step: "attrib.load", error: aErr?.message, attrib });

    let discountPct = attrib?.discount_percent
      ? Number(attrib.discount_percent)
      : 0;
    let commissionPct = attrib?.commission_percent
      ? Number(attrib.commission_percent)
      : 0;
    let influencerId = attrib?.influencer_id || null;
    let promoCodeId = attrib?.promo_code_id || null;
    let attributedBy = attrib?.attributed_by || null;

    console.log("RZP verify: influencerId", influencerId);

    const tryLoadPromoById = async (id?: string | null) => {
      if (!id) return null;
      const { data: promo, error } = await admin
        .from("promo_codes")
        .select("id, influencer_id, discount_percent, commission_percent")
        .eq("id", id)
        .maybeSingle();
      dbg.push({ step: "promo.lookup", id, error: error?.message, promo });
      return promo || null;
    };

    // 4) Prefer orders.promo_code_id / promo_snapshot, then fallback to RZP notes
    if (
      (!attrib || !influencerId) &&
      (order.promo_code_id || order.promo_snapshot)
    ) {
      let promo: any = null;
      if (order.promo_code_id)
        promo = await tryLoadPromoById(order.promo_code_id);
      if (!promo && order.promo_snapshot) {
        const snap = order.promo_snapshot as any;
        const idGuess = snap?.id ?? snap?.promo_code_id ?? null;
        if (idGuess) promo = await tryLoadPromoById(idGuess);
      }
      if (promo) {
        influencerId = promo.influencer_id;
        promoCodeId = promo.id;
        discountPct = Number(promo.discount_percent || 0);
        commissionPct = Number(promo.commission_percent || 0);
        attributedBy = "promo";
      }
      dbg.push({
        step: "attrib.from.order",
        influencerId,
        promoCodeId,
        discountPct,
        commissionPct,
        attributedBy,
      });
    }

    // Fetch RZP order (to get notes + amount_paid)
    let ro: any = null;
    {
      const key_id = process.env.RAZORPAY_KEY_ID!;
      const key_secret = process.env.RAZORPAY_KEY_SECRET!;
      const auth = Buffer.from(`${key_id}:${key_secret}`).toString("base64");
      try {
        const r = await fetch(
          `https://api.razorpay.com/v1/orders/${razorpay_order_id}`,
          {
            headers: { Authorization: `Basic ${auth}` },
          }
        );
        ro = await r.json();
        dbg.push({
          step: "rzp.order",
          id: razorpay_order_id,
          amount: ro?.amount,
          amount_paid: ro?.amount_paid,
          notes: ro?.notes,
        });
      } catch (e: any) {
        dbg.push({ step: "rzp.order.error", error: e?.message || String(e) });
      }
    }

    if ((!attrib || !influencerId) && ro?.notes) {
      const notes = ro.notes;
      const promoId = notes?.promo_code_id || notes?.promoId || null;
      if (notes?.type === "promo" && promoId && notes?.influencer_id) {
        const promo = await tryLoadPromoById(promoId);
        if (promo) {
          influencerId = promo.influencer_id;
          promoCodeId = promo.id;
          discountPct = Number(promo.discount_percent || 0);
          commissionPct = Number(promo.commission_percent || 0);
          attributedBy = "promo";
        }
      }
      dbg.push({
        step: "attrib.from.notes",
        influencerId,
        promoCodeId,
        discountPct,
        commissionPct,
        attributedBy,
      });
    }

    // 5) Compute commission from SUBTOTAL
    const base = money(order.subtotal);
    const commissionAmount = money(base * (commissionPct / 100));
    dbg.push({ step: "commission", base, commissionPct, commissionAmount });

    // 5b) Write attribution robustly (insert then update)
    if (influencerId) {
      const ins = await admin.from("order_attributions").insert({
        order_id: order.id,
        influencer_id: influencerId,
        promo_code_id: promoCodeId ?? null,
        attributed_by: attributedBy ?? (promoCodeId ? "promo" : "link"),
        discount_percent: discountPct,
        commission_percent: commissionPct,
        commission_amount: commissionAmount,
        currency: order.currency || "INR",
        status: "pending",
      });
      dbg.push({ step: "attrib.insert", error: ins.error?.message });

      if (ins.error) {
        const upd = await admin
          .from("order_attributions")
          .update({
            influencer_id: influencerId,
            promo_code_id: promoCodeId ?? null,
            attributed_by: attributedBy ?? (promoCodeId ? "promo" : "link"),
            discount_percent: discountPct,
            commission_percent: commissionPct,
            commission_amount: commissionAmount,
            currency: order.currency || "INR",
            status: "pending",
          })
          .eq("order_id", order.id);
        dbg.push({ step: "attrib.update", error: upd.error?.message });
      }
    } else {
      dbg.push({ step: "attrib.skip", reason: "no influencerId resolved" });
    }

    // 6) Mark order paid + write actual paid
    const shippingFee = money(order.shipping_fee);
    const discountAmount = money(base * (discountPct / 100));
    const computedFinal = money(base - discountAmount + shippingFee);

    const paidAmount =
      ro && typeof ro.amount_paid === "number"
        ? money(ro.amount_paid / 100)
        : computedFinal;

    const updOrder = await admin
      .from("orders")
      .update({
        status: "paid",
        discount_total: discountAmount,
        total: paidAmount,
        payment_provider: "razorpay",
        payment_reference: razorpay_payment_id,
        payment_meta: raw ? { raw } : null,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    // M-07: persist a row in `payments` for every successful capture so
    // refund / reporting flows have a real record to read. Best-effort —
    // if it fails we log but don't fail the payment.
    try {
      const payIns = await admin.from("payments").insert({
        order_id: order.id,
        provider: "razorpay",
        provider_payment_id: razorpay_payment_id,
        provider_order_id: razorpay_order_id,
        method: raw?.method ?? null,
        status: "captured",
        amount: paidAmount,
        currency: order.currency || "INR",
        signature: razorpay_signature,
        raw: raw ?? null,
      });
      dbg.push({ step: "payments.insert", error: payIns.error?.message });
    } catch (err: any) {
      dbg.push({ step: "payments.insert", error: err?.message });
    }

    // C-13/C-14 prep — Track D: auto-create DTDC shipment on payment
    // verify. Gated by env flag so it stays off until the merchant is
    // comfortable. Failure here must not roll back the payment.
    if (process.env.DTDC_AUTO_CREATE_ON_PAYMENT === "true") {
      try {
        // Idempotency: skip if an active shipment already exists for
        // this order (e.g. admin already created it manually).
        const existing = await admin
          .from("dtdc_shipments")
          .select("id")
          .eq("order_id", order.id)
          .eq("is_active", true)
          .maybeSingle();
        if (!existing.data) {
          const { createDtdcShipmentForOrder } = await import(
            "@/lib/dtdc/createShipmentForOrder"
          );
          await createDtdcShipmentForOrder(admin as any, order.id, {
            mode: "auto",
            force_new: false,
          });
          dbg.push({ step: "dtdc.auto_create", ok: true });
        } else {
          dbg.push({ step: "dtdc.auto_create", ok: true, skipped: "existing" });
        }
      } catch (err: any) {
        dbg.push({ step: "dtdc.auto_create", ok: false, error: err?.message });
      }
    }

    dbg.push({
      step: "order.update",
      error: updOrder.error?.message,
      write: { discountAmount, paidAmount, shippingFee },
    });
    if (updOrder.error) {
      const res = {
        ok: false,
        error: updOrder.error.message,
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 500 });
    }

    // 7) Promo uses (best-effort)
    if (promoCodeId) {
      const uses = await admin.rpc("increment_promo_use", {
        p_promo_id: promoCodeId,
      });
      dbg.push({
        step: "promo.uses",
        error: uses.error?.message,
        incremented: uses.data ?? null,
      });
    }

    // 8) Clear cart
    if (order.user_id) {
      const cleared = await admin.rpc("cart_clear_for_user", {
        p_user_id: order.user_id,
      });
      dbg.push({ step: "cart.clear", error: cleared.error?.message });
    }

    // 9) Send confirmation emails (best-effort; failures won't affect order success)
    try {
      const orderNumber = order.order_number ?? order.id;
      const currency = order.currency || "INR";
      const totalFormatted = `${currency} ${paidAmount.toFixed(2)}`;
      const siteUrl = resolveSiteUrl(req);
      const accountOrdersUrl = `${siteUrl}/account/orders`;
      const supportPhoneDisplay = "9384857587";
      const supportPhoneHref = "tel:+919384857587";
      const supportEmail = "info@madenkorea.com";

      let userEmail: string | null = null;
      let userName: string | null = null;

      if (order.user_id) {
        // profile for full_name
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", order.user_id)
          .maybeSingle();

        // auth user for email (correct admin API)
        const { data: userData, error: userErr } =
          await admin.auth.admin.getUserById(order.user_id);

        dbg.push({ step: "user.load", error: userErr?.message });
        console.log("RZP verify: loaded user from Supabase", {
          userErr,
          hasUser: !!userData?.user,
        });

        userEmail = userData?.user?.email ?? null;
        userName =
          profile?.full_name ??
          (userData?.user?.user_metadata as any)?.full_name ??
          null;
      }

      // === User confirmation email ===
      if (userEmail) {
        const friendlyName = userName || "there";
        const subject = `Your MadenKorea order ${orderNumber} is confirmed`;

        console.log("SES: sending user email", { to: userEmail, subject });

        const userHtml = `
          <div
            style="
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
                sans-serif;
              font-size: 14px;
              color: #111827;
              background-color: #f9fafb;
              padding: 24px;
            "
          >
            <div
              style="
                max-width: 640px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 10px;
                border: 1px solid #e5e7eb;
                padding: 24px 24px 20px;
              "
            >
              <div style="text-align: center; margin-bottom: 24px">
                <div
                  style="
                    display: inline-block;
                    padding: 8px 14px;
                    border-radius: 999px;
                    background: #f9731610;
                    color: #ea580c;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                  "
                >
                  Order Confirmed
                </div>
                <h2
                  style="
                    font-size: 20px;
                    font-weight: 600;
                    margin-top: 12px;
                    margin-bottom: 4px;
                  "
                >
                  Hi ${friendlyName}, your order is on its way!
                </h2>
                <p style="margin: 0; color: #4b5563; font-size: 13px">
                  Thank you for shopping with
                  <strong>MadenKorea</strong>. We’ve received your payment and your
                  order is now being processed.
                </p>
              </div>

              <div
                style="
                  background: #f9fafb;
                  border-radius: 10px;
                  padding: 16px 18px;
                  margin-bottom: 20px;
                "
              >
                <h3
                  style="
                    margin: 0 0 8px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #111827;
                  "
                >
                  Order summary
                </h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px">
                  <tbody>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">Order number</td>
                      <td style="padding: 4px 0; text-align: right; font-weight: 500">
                        ${orderNumber}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">Subtotal</td>
                      <td style="padding: 4px 0; text-align: right;">
                        ${currency} ${base.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">Discount</td>
                      <td style="padding: 4px 0; text-align: right;">
                        - ${currency} ${discountAmount.toFixed(
          2
        )} (${discountPct.toFixed(2)}%)
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">Shipping</td>
                      <td style="padding: 4px 0; text-align: right;">
                        ${currency} ${shippingFee.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">Total paid</td>
                      <td
                        style="
                          padding: 4px 0;
                          text-align: right;
                          font-weight: 600;
                          color: #111827;
                        "
                      >
                        ${totalFormatted}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">Payment method</td>
                      <td style="padding: 4px 0; text-align: right">Razorpay</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style="margin-bottom: 20px">
                <h3
                  style="
                    margin: 0 0 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #111827;
                  "
                >
                  Track your order & download invoice
                </h3>
                <p style="margin: 0 0 10px; color: #4b5563; font-size: 13px">
                  You can view your complete order details, download invoice copies,
                  and check your transaction history anytime from your account.
                </p>
                <a
                  href="${accountOrdersUrl}"
                  style="
                    display: inline-block;
                    padding: 8px 14px;
                    border-radius: 999px;
                    background: #111827;
                    color: #f9fafb;
                    font-size: 12px;
                    font-weight: 500;
                    text-decoration: none;
                  "
                >
                  View my orders & invoices
                </a>
              </div>

              <div
                style="
                  margin-bottom: 20px;
                  padding: 14px 16px;
                  border-radius: 10px;
                  background: #fef3c7;
                  border: 1px solid #facc15;
                "
              >
                <h3
                  style="
                    margin: 0 0 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #92400e;
                  "
                >
                  Need help with your order?
                </h3>
                <p style="margin: 0 0 4px; color: #92400e; font-size: 13px">
                  For any support, product queries, or shipment updates, you can reach
                  us at:
                </p>
                <p style="margin: 0; color: #92400e; font-size: 13px">
                  <strong>Phone:</strong>
                  <a href="${supportPhoneHref}" style="color: inherit; text-decoration: none"
                    >${supportPhoneDisplay}</a
                  ><br />
                  <strong>Email:</strong>
                  <a
                    href="mailto:${supportEmail}"
                    style="color: inherit; text-decoration: none"
                    >${supportEmail}</a
                  >
                </p>
              </div>

              <div style="margin-bottom: 16px">
                <h3
                  style="
                    margin: 0 0 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #111827;
                  "
                >
                  A quick note about your products
                </h3>
                <p style="margin: 0 0 6px; color: #4b5563; font-size: 13px">
                  All our products are curated from trusted Korean brands. For the best
                  experience:
                </p>
                <ul style="margin: 0 0 6px 18px; padding: 0; color: #4b5563; font-size: 13px">
                  <li>Follow the usage instructions on the product packaging.</li>
                  <li>Store in a cool, dry place away from direct sunlight.</li>
                  <li>Do a patch test before first use if you have sensitive skin.</li>
                </ul>
                <p style="margin: 0; color: #4b5563; font-size: 13px">
                  You’ll see the exact products and quantities for this order inside your
                  account under <strong>“Orders”</strong>.
                </p>
              </div>

              <p
                style="
                  margin-top: 20px;
                  margin-bottom: 4px;
                  color: #4b5563;
                  font-size: 13px;
                "
              >
                Thank you again for choosing
                <strong>MadenKorea</strong>. We’re excited for you to receive your
                order!
              </p>
              <p style="margin: 0; color: #4b5563; font-size: 13px">
                Love,<br />
                <strong>Team MadenKorea</strong>
              </p>
            </div>

            <p
              style="
                margin: 16px auto 0;
                max-width: 640px;
                text-align: center;
                color: #9ca3af;
                font-size: 11px;
              "
            >
              You’re receiving this email because you placed an order on
              <strong>madenkorea.com</strong>.
            </p>
          </div>
        `;

        const userText = [
          `Hi ${friendlyName},`,
          "",
          "Thank you for shopping with MadenKorea. Your order has been placed successfully and is now being processed.",
          "",
          `Order number: ${orderNumber}`,
          `Subtotal: ${currency} ${base.toFixed(2)}`,
          `Discount: ${currency} ${discountAmount.toFixed(
            2
          )} (${discountPct.toFixed(2)}%)`,
          `Shipping: ${currency} ${shippingFee.toFixed(2)}`,
          `Total paid: ${totalFormatted}`,
          "Payment method: Razorpay",
          "",
          "You can view your full order, download invoice copies, and see your transaction history here:",
          `Account orders: ${accountOrdersUrl}`,
          "",
          "For any support, product questions, or shipment updates, contact us at:",
          `Phone: ${supportPhoneDisplay}`,
          `Email: ${supportEmail}`,
          "",
          "Love,",
          "Team MadenKorea",
        ].join("\n");

        await ses.send(
          new SendEmailCommand({
            Source: FROM_EMAIL,
            Destination: { ToAddresses: [userEmail] },
            Message: {
              Subject: { Data: subject },
              Body: {
                Html: { Data: userHtml },
                Text: { Data: userText },
              },
            },
          })
        );

        console.log("SES: user email sent OK", { to: userEmail });
        dbg.push({ step: "email.user.ok", to: userEmail });
      } else {
        console.log("SES: skipping user email – no userEmail resolved", {
          userId: order.user_id,
        });
        dbg.push({ step: "email.user.skip", reason: "no user email" });
      }

      // === Admin notification email ===
      const adminSubject = `New order placed: ${orderNumber}`;
      const hasPromo = !!promoCodeId;
      const hasInfluencer = !!influencerId;

      const adminHtml = `
        <div
          style="
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
              sans-serif;
            font-size: 14px;
            color: #111827;
            background-color: #f9fafb;
            padding: 24px;
          "
        >
          <div
            style="
              max-width: 640px;
              margin: 0 auto;
              background: #ffffff;
              border-radius: 10px;
              border: 1px solid #e5e7eb;
              padding: 24px 24px 20px;
            "
          >
            <h2
              style="
                font-size: 18px;
                font-weight: 600;
                margin: 0 0 12px;
              "
            >
              New order placed
            </h2>

            <div
              style="
                background: #f9fafb;
                border-radius: 10px;
                padding: 14px 16px;
                margin-bottom: 16px;
              "
            >
              <h3
                style="
                  margin: 0 0 8px;
                  font-size: 13px;
                  font-weight: 600;
                  color: #111827;
                "
              >
                Order details
              </h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px">
                <tbody>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Order number</td>
                    <td style="padding: 4px 0; text-align: right; font-weight: 500">
                      ${orderNumber}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Subtotal</td>
                    <td style="padding: 4px 0; text-align: right;">
                      ${currency} ${base.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Discount</td>
                    <td style="padding: 4px 0; text-align: right;">
                      - ${currency} ${discountAmount.toFixed(
        2
      )} (${discountPct.toFixed(2)}%)
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Shipping</td>
                    <td style="padding: 4px 0; text-align: right;">
                      ${currency} ${shippingFee.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Total paid</td>
                    <td
                      style="
                        padding: 4px 0;
                        text-align: right;
                        font-weight: 600;
                        color: #111827;
                      "
                    >
                      ${currency} ${paidAmount.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Payment provider</td>
                    <td style="padding: 4px 0; text-align: right;">Razorpay</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              style="
                background: #eef2ff;
                border-radius: 10px;
                padding: 14px 16px;
                margin-bottom: 16px;
              "
            >
              <h3
                style="
                  margin: 0 0 8px;
                  font-size: 13px;
                  font-weight: 600;
                  color: #1d4ed8;
                "
              >
                Customer details
              </h3>
              <p style="margin: 0 0 4px; color: #1f2937; font-size: 13px">
                <strong>User ID:</strong> ${order.user_id || "guest"}
              </p>
              <p style="margin: 0 0 4px; color: #1f2937; font-size: 13px">
                <strong>User email:</strong> ${userEmail || "—"}
              </p>
            </div>

            <div
              style="
                background: #ecfdf5;
                border-radius: 10px;
                padding: 14px 16px;
                margin-bottom: 16px;
              "
            >
              <h3
                style="
                  margin: 0 0 8px;
                  font-size: 13px;
                  font-weight: 600;
                  color: #047857;
                "
              >
                Promotion & attribution
              </h3>
              <p style="margin: 0 0 4px; color: #064e3b; font-size: 13px">
                <strong>Promo code ID:</strong> ${promoCodeId || "—"}
              </p>
              <p style="margin: 0 0 4px; color: #064e3b; font-size: 13px">
                <strong>Influencer ID:</strong> ${influencerId || "—"}
              </p>
              <p style="margin: 0 0 4px; color: #064e3b; font-size: 13px">
                <strong>Discount % (attribution):</strong> ${discountPct.toFixed(
        2
      )}%
              </p>
              <p style="margin: 0 0 4px; color: #064e3b; font-size: 13px">
                <strong>Commission %:</strong> ${commissionPct.toFixed(2)}%
              </p>
              <p style="margin: 0; color: #064e3b; font-size: 13px">
                <strong>Commission amount:</strong> ${currency} ${commissionAmount.toFixed(
        2
      )}
              </p>
            </div>

            <p style="margin: 0; color: #6b7280; font-size: 12px">
              For full product line items and shipping details, refer to the admin
              dashboard or Supabase orders table.
            </p>
          </div>
        </div>
      `;

      const adminText = [
        "New order placed:",
        `Order number: ${orderNumber}`,
        `Subtotal: ${currency} ${base.toFixed(2)}`,
        `Discount: ${currency} ${discountAmount.toFixed(
          2
        )} (${discountPct.toFixed(2)}%)`,
        `Shipping: ${currency} ${shippingFee.toFixed(2)}`,
        `Total paid: ${currency} ${paidAmount.toFixed(2)}`,
        `User ID: ${order.user_id || "guest"}`,
        `User email: ${userEmail || "—"}`,
        `Payment provider: Razorpay`,
        `Promo code ID: ${promoCodeId || "—"}`,
        `Influencer ID: ${influencerId || "—"}`,
        `Commission %: ${commissionPct.toFixed(2)}%`,
        `Commission amount: ${currency} ${commissionAmount.toFixed(2)}`,
      ].join("\n");

      console.log("SES: sending admin email", {
        to: ADMIN_EMAILS,
        subject: adminSubject,
      });

      await ses.send(
        new SendEmailCommand({
          Source: FROM_EMAIL,
          Destination: {
            ToAddresses: ADMIN_EMAILS,
            CcAddresses: [FROM_EMAIL],
          },
          Message: {
            Subject: { Data: adminSubject },
            Body: {
              Html: { Data: adminHtml },
              Text: { Data: adminText },
            },
          },
        })
      );

      console.log("SES: admin email sent OK", { to: ADMIN_EMAILS });
      dbg.push({ step: "email.admin.ok", to: ADMIN_EMAILS });
    } catch (e: any) {
      console.error("SES: email sending failed", e);
      dbg.push({ step: "email.error", error: e?.message || String(e) });
    }

    const res = {
      ok: true,
      order_id: order.id,
      order_number: order.order_number ?? order.id,
      debug: WANT_DEBUG ? dbg : undefined,
    };
    return NextResponse.json(res);
  } catch (e: any) {
    console.error("RZP verify fatal error", e);
    dbg.push({ step: "fatal", error: e?.message || String(e) });
    const allowDebug = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Failed",
        debug: allowDebug ? dbg : undefined,
      },
      { status: 500 }
    );
  }
}
