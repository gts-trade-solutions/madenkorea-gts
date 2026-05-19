// International shipping math — weight-slab pricing (Korea Post EMS).
//
// Indian orders use the existing store_settings threshold flow (see
// lib/membership.ts → computeShippingFee). Any non-IN country reads a
// per-country slab table from `country_shipping_rates` and three
// global knobs from `store_settings`:
//
//   intl_packaging_tare_pct      — uplift on cart's gross weight to
//                                  cover outer/shipping packaging.
//   intl_buffer_pct              — markup over EMS base cost. Covers
//                                  FX swings + handling. Applied
//                                  AFTER slab lookup so admin can
//                                  change it without re-importing
//                                  the rate table.
//   intl_max_shipping_weight_kg  — hard cap (post-tare). Above this,
//                                  checkout is blocked at the cart
//                                  with a contact-us message.
//
// Flow:
//   1) gross_g  = sum(gross_weight_g × qty) across lines
//   2) effective_g = gross_g × (1 + tare/100)
//   3) if effective_g > max * 1000 → OVER_CAP
//   4) slab = first slab key with cutoff >= effective weight
//   5) base = country_shipping_rates[country][slab]
//   6) customer fee = base × (1 + buffer/100)
//
// Storage currency is INR end-to-end (matches the rest of the app);
// FX conversion to the buyer's currency happens downstream in
// razorpay/create.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Slab cutoffs in grams, ordered ascending. Round-up bracketing — any
// effective weight ≤ N grams uses the row's slab column at index N.
// Keep in lockstep with the column names below.
export const SLAB_CUTOFFS_G = [500, 1000, 2000, 3000, 5000, 7000, 10000, 15000, 20000] as const;

export const SLAB_COLUMNS = [
  "slab_500g_inr",
  "slab_1kg_inr",
  "slab_2kg_inr",
  "slab_3kg_inr",
  "slab_5kg_inr",
  "slab_7kg_inr",
  "slab_10kg_inr",
  "slab_15kg_inr",
  "slab_20kg_inr",
] as const;

export type SlabColumn = (typeof SLAB_COLUMNS)[number];

export type CountryShippingRate = {
  country: string;
  active: boolean;
  notes: string | null;
  slab_500g_inr: number;
  slab_1kg_inr: number;
  slab_2kg_inr: number;
  slab_3kg_inr: number;
  slab_5kg_inr: number;
  slab_7kg_inr: number;
  slab_10kg_inr: number;
  slab_15kg_inr: number;
  slab_20kg_inr: number;
};

export type IntlShippingSettings = {
  intl_packaging_tare_pct: number;
  intl_buffer_pct: number;
  intl_max_shipping_weight_kg: number;
};

function client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Read the active slab matrix for a destination country. Returns null
 * if the country isn't configured, isn't active, or the lookup errors.
 * Callers must treat that as "international shipping not available for
 * this country" and surface a useful error.
 */
export async function getCountryShippingRate(
  country: string
): Promise<CountryShippingRate | null> {
  const upper = country.toUpperCase();
  if (upper === "IN") return null;

  const sb = client();
  const { data, error } = await sb
    .from("country_shipping_rates")
    .select(
      "country, active, notes, slab_500g_inr, slab_1kg_inr, slab_2kg_inr, slab_3kg_inr, slab_5kg_inr, slab_7kg_inr, slab_10kg_inr, slab_15kg_inr, slab_20kg_inr"
    )
    .eq("country", upper)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as CountryShippingRate;
}

/** Read the three global slab settings from store_settings (id=1). */
export async function getIntlShippingSettings(): Promise<IntlShippingSettings> {
  const sb = client();
  const { data } = await sb
    .from("store_settings")
    .select(
      "intl_packaging_tare_pct, intl_buffer_pct, intl_max_shipping_weight_kg"
    )
    .eq("id", 1)
    .maybeSingle();
  return {
    intl_packaging_tare_pct: Number((data as any)?.intl_packaging_tare_pct ?? 15),
    intl_buffer_pct: Number((data as any)?.intl_buffer_pct ?? 20),
    intl_max_shipping_weight_kg: Number(
      (data as any)?.intl_max_shipping_weight_kg ?? 20
    ),
  };
}

/**
 * Sum line-level GROSS weight contributions (in grams). Lines whose
 * gross weight is null/0 are skipped — callers must verify upstream
 * that every line has a usable weight or the order will silently
 * under-price.
 */
export function totalCartWeightGrams(
  lines: Array<{ qty: number; gross_weight_g: number | null | undefined }>
): number {
  let total = 0;
  for (const l of lines) {
    const w = Number(l.gross_weight_g ?? 0);
    if (!Number.isFinite(w) || w <= 0) continue;
    total += w * Number(l.qty || 0);
  }
  return total;
}

/** gross + tare uplift, rounded to whole grams. */
export function applyTare(grossG: number, tarePct: number): number {
  const safeTare = Math.max(0, Number(tarePct) || 0);
  return Math.round(grossG * (1 + safeTare / 100));
}

/**
 * Pick the slab whose cutoff is the smallest ≥ the effective weight.
 * Returns null if the weight exceeds the 20kg ceiling (caller treats
 * this as OVER_CAP). Effective weight ≤ 0 returns the smallest slab so
 * a zero-weight cart still picks up a token shipping fee — though the
 * upstream validators should never let a 0-weight order through.
 */
export function pickSlabKey(effectiveG: number): SlabColumn | null {
  for (let i = 0; i < SLAB_CUTOFFS_G.length; i++) {
    if (effectiveG <= SLAB_CUTOFFS_G[i]) return SLAB_COLUMNS[i];
  }
  return null;
}

export type ComputeResult =
  | { ok: true; amountInr: number; slab: SlabColumn; effectiveG: number; baseInr: number }
  | { ok: false; reason: "OVER_CAP"; effectiveG: number; maxG: number }
  | { ok: false; reason: "NO_RATES"; country: string };

/**
 * End-to-end international shipping fee, INR. Pure function — caller
 * supplies the live rate row + settings (typically loaded together
 * inside the calc-totals route, then passed in).
 */
export function computeIntlShippingInr(input: {
  grossG: number;
  rate: CountryShippingRate | null;
  settings: IntlShippingSettings;
}): ComputeResult {
  const { grossG, rate, settings } = input;
  if (!rate) {
    return { ok: false, reason: "NO_RATES", country: "" };
  }
  const effectiveG = applyTare(grossG, settings.intl_packaging_tare_pct);
  const maxG = settings.intl_max_shipping_weight_kg * 1000;
  if (effectiveG > maxG) {
    return { ok: false, reason: "OVER_CAP", effectiveG, maxG };
  }
  const slab = pickSlabKey(effectiveG);
  if (!slab) {
    // Defensive: pickSlabKey only returns null above 20kg, which
    // OVER_CAP already covers. Keep the guard so the type narrows.
    return { ok: false, reason: "OVER_CAP", effectiveG, maxG };
  }
  const baseInr = Number(rate[slab]);
  const amountInr =
    Math.round(baseInr * (1 + (settings.intl_buffer_pct || 0) / 100) * 100) / 100;
  return { ok: true, amountInr, slab, effectiveG, baseInr };
}
