import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabaseRoute";

// International order request endpoint.
//
// Non-Indian visitors can't checkout via Razorpay (no shipping
// integration, no GST, no INR billing setup). Instead, they submit a
// structured cart-plus-address request from the cart page. We persist
// it to `international_orders` so admin can see it at
// /admin/international-orders.
//
// While the SES pipeline is offline, the primary delivery channel for
// the team is a `mailto:` link the customer's own mail app opens —
// see `components/InternationalOrderModal.tsx`. This endpoint is
// fire-and-forget from the client's perspective; the customer's
// outgoing email is what actually reaches the team.
//
// Auth: optional. Signed-in customers get their `user_id` linked to
// the request; anonymous visitors can submit too.

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type CartLine = {
  product_id: string;
  name: string;
  sku?: string | null;
  quantity: number;
  unit_price_inr: number;
  line_total_inr: number;
  hero_image_url?: string | null;
};

type Address = {
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postal_code: string;
  country: string;
};

type RequestBody = {
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  country: string;
  address: Address;
  cart: CartLine[];
  currency_code: string;
  display_total: number;  // total in the customer's currency
  inr_total: number;      // total in INR
  notes?: string;
};

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Minimal validation. Frontend modal also validates; this is the
  // defensive backstop for direct POSTs / bots.
  if (
    !body.customer_name ||
    !body.customer_email ||
    !body.country ||
    !body.address?.line1 ||
    !body.address?.city ||
    !body.address?.postal_code ||
    !body.address?.country ||
    !Array.isArray(body.cart) ||
    body.cart.length === 0 ||
    !body.currency_code ||
    !Number.isFinite(body.inr_total) ||
    !Number.isFinite(body.display_total)
  ) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // Link signed-in customer if present.
  let userId: string | null = null;
  try {
    const sb = supabaseRouteClient();
    const { data } = await sb.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    // anonymous OK
  }

  // Persist request. RLS allows anon INSERT.
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("international_orders")
    .insert({
      status: "new",
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      customer_phone: body.customer_phone ?? null,
      country: body.country,
      address: body.address,
      cart_snapshot: body.cart,
      currency_code: body.currency_code,
      display_total: body.display_total,
      inr_total: body.inr_total,
      notes: body.notes ?? null,
      user_id: userId,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { ok: false, error: insertError?.message ?? "insert_failed" },
      { status: 500 }
    );
  }

  // No server-side email here. The InternationalOrderModal opens the
  // customer's own mail app via mailto: which carries the structured
  // request straight to the team — that's the live delivery channel
  // while SES is offline. This row just gives admin a permanent
  // record visible at /admin/international-orders.
  return NextResponse.json({
    ok: true,
    request_id: inserted.id,
  });
}
