import { NextRequest, NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabaseRoute";
import { createServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELIGIBLE_ORDER_STATUSES = [
  "paid",
  "processing",
  "dispatched",
  "shipped",
  "delivered",
];

export async function POST(req: NextRequest) {
  try {
    const routeClient = supabaseRouteClient();
    const admin = createServiceClient();

    const { data: auth } = await routeClient.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.product_id || "").trim();
    const rating = Number(body?.rating || 0);
    const title = body?.title ? String(body.title) : null;
    const bodyText = body?.body ? String(body.body) : null;
    const photos = Array.isArray(body?.photos) ? body.photos : [];
    const displayName = body?.display_name ? String(body.display_name) : null;
    const avatarUrl = body?.avatar_url ? String(body.avatar_url) : null;

    if (!productId || rating < 1 || rating > 5) {
      return NextResponse.json(
        { ok: false, error: "INVALID_REVIEW_PAYLOAD" },
        { status: 400 }
      );
    }

    const { data: orders, error: orderErr } = await admin
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .in("status", ELIGIBLE_ORDER_STATUSES);

    if (orderErr) {
      return NextResponse.json(
        { ok: false, error: orderErr.message },
        { status: 500 }
      );
    }

    const orderIds = (orders ?? []).map((o: any) => o.id);
    if (orderIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "PURCHASE_REQUIRED" },
        { status: 403 }
      );
    }

    const { data: purchased, error: purchaseErr } = await admin
      .from("order_items")
      .select("order_id")
      .eq("product_id", productId)
      .in("order_id", orderIds)
      .limit(1);

    if (purchaseErr) {
      return NextResponse.json(
        { ok: false, error: purchaseErr.message },
        { status: 500 }
      );
    }

    if (!purchased || purchased.length === 0) {
      return NextResponse.json(
        { ok: false, error: "PURCHASE_REQUIRED" },
        { status: 403 }
      );
    }

    const { error: insertErr } = await admin.from("product_reviews").insert({
      product_id: productId,
      user_id: userId,
      rating,
      title,
      body: bodyText,
      photos,
      is_verified_purchase: true,
      status: "pending",
      display_name: displayName,
      avatar_url: avatarUrl,
    });

    if (insertErr) {
      if ((insertErr as any).code === "23505") {
        return NextResponse.json(
          { ok: false, error: "ALREADY_REVIEWED" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "REVIEW_CREATE_FAILED" },
      { status: 500 }
    );
  }
}
