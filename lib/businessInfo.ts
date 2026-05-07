import { createClient } from "@supabase/supabase-js";

// NOTE: this module deliberately has NO `server-only` import. It's
// pulled into the server-rendered footer (which gets bundled as a
// client component when used inside CustomerLayout from a `'use client'`
// page like the PDP), so any server-only side effects in here would
// break compilation. The data we read is public-by-design (entity name,
// address, support contacts, GO details), so anon-key read is correct
// — no service role needed.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Stand-alone anon client. We don't import the project singleton from
// `lib/supabaseClient.ts` because that one persists sessions to
// localStorage and would noisy-warn in server contexts where there's no
// window object.
function client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type BusinessInfo = {
  legalEntityName: string | null;
  registeredAddress: string | null;
  publicPhone: string | null;
  supportEmail: string;
  businessHours: string;
  grievanceOfficerName: string | null;
  grievanceOfficerDesignation: string | null;
  grievanceOfficerEmail: string | null;
  gstin: string | null;
  cdscoRegistration: string | null;
  jurisdictionCity: string | null;
  // When true, the PDP renders a "Sold by" disclosure card for any
  // product attached to a vendor. Off by default — admin enables once
  // the vendor records have accurate legal name / address / GSTIN
  // populated.
  marketplaceDisclosureEnabled: boolean;
};

export const DEFAULT_BUSINESS_INFO: BusinessInfo = {
  legalEntityName: null,
  registeredAddress: null,
  publicPhone: null,
  supportEmail: "info@madenkorea.com",
  businessHours: "Mon-Fri 9AM - 6PM IST",
  grievanceOfficerName: null,
  grievanceOfficerDesignation: null,
  grievanceOfficerEmail: null,
  gstin: null,
  cdscoRegistration: null,
  jurisdictionCity: null,
  marketplaceDisclosureEnabled: false,
};

const CACHE_TTL_MS = 60 * 1000;
let cached: { value: BusinessInfo; expiresAt: number } | null = null;

export async function getBusinessInfo(): Promise<BusinessInfo> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const sb = client();
    const { data, error } = await sb
      .from("store_settings")
      .select(
        "legal_entity_name, registered_address, public_phone, support_email, business_hours, grievance_officer_name, grievance_officer_designation, grievance_officer_email, gstin, cdsco_registration, jurisdiction_city, marketplace_disclosure_enabled"
      )
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) {
      cached = { value: DEFAULT_BUSINESS_INFO, expiresAt: now + CACHE_TTL_MS };
      return DEFAULT_BUSINESS_INFO;
    }

    const value: BusinessInfo = {
      legalEntityName: (data.legal_entity_name as string | null) ?? null,
      registeredAddress: (data.registered_address as string | null) ?? null,
      publicPhone: (data.public_phone as string | null) ?? null,
      supportEmail:
        ((data.support_email as string | null) || "").trim() ||
        DEFAULT_BUSINESS_INFO.supportEmail,
      businessHours:
        ((data.business_hours as string | null) || "").trim() ||
        DEFAULT_BUSINESS_INFO.businessHours,
      grievanceOfficerName: (data.grievance_officer_name as string | null) ?? null,
      grievanceOfficerDesignation:
        (data.grievance_officer_designation as string | null) ?? null,
      grievanceOfficerEmail:
        (data.grievance_officer_email as string | null) ?? null,
      gstin: (data.gstin as string | null) ?? null,
      cdscoRegistration: (data.cdsco_registration as string | null) ?? null,
      jurisdictionCity: (data.jurisdiction_city as string | null) ?? null,
      marketplaceDisclosureEnabled:
        (data.marketplace_disclosure_enabled as boolean | null) ?? false,
    };
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    cached = { value: DEFAULT_BUSINESS_INFO, expiresAt: now + CACHE_TTL_MS };
    return DEFAULT_BUSINESS_INFO;
  }
}

export function bustBusinessInfoCache() {
  cached = null;
}
