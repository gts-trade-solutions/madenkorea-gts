// Currency helpers — display-layer multi-currency + money rounding.
//
// We store every price canonically in INR. This module:
//  - converts an INR amount into a target currency for *display*
//  - formats using `Intl.NumberFormat` so locale-specific decimal
//    separators, currency symbol placement, and digit grouping all
//    work without per-currency special-casing
//  - keeps the legacy `roundMoney` helper used by calc-totals
//
// Source of truth for live rates is `public.currency_rates`. The
// constants below are compiled-in fallbacks for when the rate table
// is unreachable.

/**
 * Banker-safe rounding for monetary amounts. Used by server-side
 * pricing in /api/checkout/calc-totals to avoid floating-point drift
 * when summing line totals + shipping − discounts.
 */
export function roundMoney(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type CurrencyCode =
  | "INR" | "USD" | "EUR" | "GBP" | "PLN"
  | "ZAR" | "VND" | "TZS" | "NGN" | "QAR" | "AED";

export const SUPPORTED_CURRENCIES: CurrencyCode[] = [
  "INR", "USD", "EUR", "GBP", "PLN",
  "ZAR", "VND", "TZS", "NGN", "QAR", "AED",
];

export type CurrencyRate = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
  rate_from_inr: number;
  active: boolean;
  last_updated_at?: string;
};

// Compiled-in fallback so the UI never renders empty prices when the
// rate table is unreachable. Rates here are illustrative; live values
// come from the DB. INR stays at exactly 1.0.
export const FALLBACK_RATES: Record<CurrencyCode, CurrencyRate> = {
  INR: { code: "INR", name: "Indian Rupee",         symbol: "₹",   decimals: 0, rate_from_inr: 1,        active: true },
  USD: { code: "USD", name: "US Dollar",            symbol: "$",   decimals: 2, rate_from_inr: 0.012,    active: true },
  EUR: { code: "EUR", name: "Euro",                 symbol: "€",   decimals: 2, rate_from_inr: 0.011,    active: true },
  GBP: { code: "GBP", name: "British Pound",        symbol: "£",   decimals: 2, rate_from_inr: 0.0095,   active: true },
  PLN: { code: "PLN", name: "Polish Zloty",         symbol: "zł",  decimals: 2, rate_from_inr: 0.048,    active: true },
  ZAR: { code: "ZAR", name: "South African Rand",   symbol: "R",   decimals: 2, rate_from_inr: 0.22,     active: true },
  VND: { code: "VND", name: "Vietnamese Dong",      symbol: "₫",   decimals: 0, rate_from_inr: 296,      active: true },
  TZS: { code: "TZS", name: "Tanzanian Shilling",   symbol: "TSh", decimals: 0, rate_from_inr: 30,       active: true },
  NGN: { code: "NGN", name: "Nigerian Naira",       symbol: "₦",   decimals: 2, rate_from_inr: 19.5,     active: true },
  QAR: { code: "QAR", name: "Qatari Riyal",         symbol: "﷼",   decimals: 2, rate_from_inr: 0.044,    active: true },
  AED: { code: "AED", name: "UAE Dirham",           symbol: "د.إ", decimals: 2, rate_from_inr: 0.044,    active: true },
};

// Locale to use for Intl.NumberFormat per currency. Where there's no
// strong country-locale match we pick a representative one that
// formats numbers in a way readers of the target language expect.
const FORMAT_LOCALE: Record<CurrencyCode, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "de-DE",  // dot/comma swapped vs US; widely read across EU
  GBP: "en-GB",
  PLN: "pl-PL",
  ZAR: "en-ZA",
  VND: "vi-VN",
  TZS: "sw-TZ",
  NGN: "en-NG",
  QAR: "ar-QA",
  AED: "ar-AE",
};

// ISO 3166-1 alpha-2 → currency code. Used by middleware to pick a
// default currency from the visitor's geo header. Anything not in
// this map falls through to INR.
export const COUNTRY_TO_CURRENCY: Record<string, CurrencyCode> = {
  // India
  IN: "INR",

  // United States
  US: "USD",

  // Eurozone — EU/EEA members that use EUR. Poland deliberately
  // excluded; it uses zloty even though it's an EU member.
  AT: "EUR", BE: "EUR", CY: "EUR", DE: "EUR", EE: "EUR", ES: "EUR",
  FI: "EUR", FR: "EUR", GR: "EUR", IE: "EUR", IT: "EUR", LT: "EUR",
  LU: "EUR", LV: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SI: "EUR",
  SK: "EUR", HR: "EUR",

  // UK
  GB: "GBP",

  // Poland
  PL: "PLN",

  // South Africa
  ZA: "ZAR",

  // Vietnam
  VN: "VND",

  // Tanzania
  TZ: "TZS",

  // Nigeria
  NG: "NGN",

  // Qatar
  QA: "QAR",

  // UAE
  AE: "AED",
};

/** Convert an INR amount into the target currency (no formatting). */
export function convertFromINR(amountInr: number, rate: CurrencyRate): number {
  return amountInr * rate.rate_from_inr;
}

/**
 * Format an INR amount into a localized currency string. Uses
 * `Intl.NumberFormat` so:
 *  - Decimal/thousands separators match the target locale.
 *  - Currency symbol position (before/after, spaced/unspaced) is
 *    correct without per-currency code.
 *  - Zero-decimal currencies (VND, TZS) round to integers.
 *
 * Falls back to plain "<symbol><number>" if Intl somehow rejects the
 * code (shouldn't happen for ISO 4217 codes we support).
 */
export function formatPrice(amountInr: number, rate: CurrencyRate): string {
  const converted = convertFromINR(amountInr, rate);
  const locale = FORMAT_LOCALE[rate.code] ?? "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: rate.code,
      minimumFractionDigits: rate.decimals,
      maximumFractionDigits: rate.decimals,
    }).format(converted);
  } catch {
    const rounded = converted.toFixed(rate.decimals);
    return `${rate.symbol}${rounded}`;
  }
}

/** Resolve a country code to its preferred currency. Defaults to INR. */
export function currencyForCountry(country?: string | null): CurrencyCode {
  if (!country) return "INR";
  const upper = country.toUpperCase();
  return COUNTRY_TO_CURRENCY[upper] ?? "INR";
}

/** Type-narrow an unknown string to a supported CurrencyCode. */
export function isSupportedCurrency(code: unknown): code is CurrencyCode {
  return typeof code === "string" && (SUPPORTED_CURRENCIES as string[]).includes(code);
}
