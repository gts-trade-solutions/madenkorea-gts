export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { bustShippingConfigCache, getShippingConfig } from "@/lib/storeSettings";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

async function getAdminOr401() {
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();
  let user: any = null;

  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) user = data.user;
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return { supabase, user: null, error: json({ ok: false, error: "UNAUTH" }, 401) };

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((prof?.role !== "admin" && prof?.role !== "super_admin"))
    return { supabase, user: null, error: json({ ok: false, error: "FORBIDDEN" }, 403) };

  return { supabase, user, error: null };
}

export async function GET() {
  const { error } = await getAdminOr401();
  if (error) return error;
  const config = await getShippingConfig();
  return json({
    ok: true,
    deliveryThreshold: config.deliveryThreshold,
    defaultShippingFee: config.defaultShippingFee,
  });
}

export async function POST(req: Request) {
  const { supabase, user, error } = await getAdminOr401();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const deliveryThreshold = Number(body.deliveryThreshold);
  const defaultShippingFee = Number(body.defaultShippingFee);

  if (
    !Number.isFinite(deliveryThreshold) ||
    !Number.isFinite(defaultShippingFee) ||
    deliveryThreshold < 0 ||
    defaultShippingFee < 0
  ) {
    return json({ ok: false, error: "INVALID_VALUES" }, 400);
  }

  const { error: upErr } = await supabase
    .from("store_settings")
    .update({
      delivery_threshold: Math.round(deliveryThreshold),
      default_shipping_fee: Math.round(defaultShippingFee),
      updated_at: new Date().toISOString(),
      updated_by: user!.id,
    })
    .eq("id", 1);

  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  // Drop the in-process cache so the next pricing call sees the new values
  // immediately instead of waiting out the 60s TTL.
  bustShippingConfigCache();

  return json({
    ok: true,
    deliveryThreshold: Math.round(deliveryThreshold),
    defaultShippingFee: Math.round(defaultShippingFee),
  });
}
