import "server-only";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { DEFAULT_SHIPPING_CONFIG, type ShippingConfig } from "@/lib/membership";

const CACHE_TTL_MS = 60 * 1000;

let cached: { value: ShippingConfig; expiresAt: number } | null = null;

/**
 * Read the live shipping config from `public.store_settings`. Cached for
 * 60 seconds in process memory so calc-totals doesn't hammer Supabase on
 * every request. Falls back to {@link DEFAULT_SHIPPING_CONFIG} if the
 * table or row is missing — never throws.
 *
 * On admin update, call {@link bustShippingConfigCache} so the change
 * shows up in the next pricing call instead of waiting out the TTL.
 */
export async function getShippingConfig(): Promise<ShippingConfig> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("store_settings")
      .select("delivery_threshold, default_shipping_fee")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) {
      cached = { value: DEFAULT_SHIPPING_CONFIG, expiresAt: now + CACHE_TTL_MS };
      return DEFAULT_SHIPPING_CONFIG;
    }

    const value: ShippingConfig = {
      deliveryThreshold: Number(data.delivery_threshold ?? DEFAULT_SHIPPING_CONFIG.deliveryThreshold),
      defaultShippingFee: Number(data.default_shipping_fee ?? DEFAULT_SHIPPING_CONFIG.defaultShippingFee),
    };
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    cached = { value: DEFAULT_SHIPPING_CONFIG, expiresAt: now + CACHE_TTL_MS };
    return DEFAULT_SHIPPING_CONFIG;
  }
}

export function bustShippingConfigCache() {
  cached = null;
}
