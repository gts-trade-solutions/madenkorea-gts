// International shipping rate lookup.
//
// Indian orders use the existing store_settings threshold flow
// (see lib/membership.ts → computeShippingFee). Any non-IN country
// reads a per-gram rate from `country_shipping_rates`. The order's
// total weight × that rate = shipping fee in INR; FX conversion to
// the buyer's currency happens downstream in razorpay/create.
//
// Spec: INTERNATIONAL_PAYMENTS.md

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type CountryShippingRate = {
  country: string;
  rate_per_gram_inr: number;
  active: boolean;
  notes: string | null;
};

function client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Read the active per-gram shipping rate for a destination country.
 * Returns null if the country isn't configured, isn't active, or the
 * lookup errors — callers must treat that as "international shipping
 * not available for this country" and surface a useful error.
 */
export async function getCountryShippingRate(
  country: string
): Promise<CountryShippingRate | null> {
  const upper = country.toUpperCase();
  if (upper === "IN") return null;

  const sb = client();
  const { data, error } = await sb
    .from("country_shipping_rates")
    .select("country, rate_per_gram_inr, active, notes")
    .eq("country", upper)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as CountryShippingRate;
}

/**
 * Sum line-level weight contributions. Returns total grams across
 * the cart. Callers must verify `null` weight has been rejected
 * upstream — this helper treats a null/zero weight as 0 grams which
 * would underprice an international order if it slipped through.
 */
export function totalCartWeightGrams(
  lines: Array<{ qty: number; net_weight_g: number | null | undefined }>
): number {
  let total = 0;
  for (const l of lines) {
    const w = Number(l.net_weight_g ?? 0);
    if (!Number.isFinite(w) || w <= 0) continue;
    total += w * Number(l.qty || 0);
  }
  return total;
}
