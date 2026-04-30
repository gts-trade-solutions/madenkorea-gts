import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { checkPincodeWithShipsy } from "@/lib/dtdc/serviceability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_DAYS = 7;
const TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("pincode") ?? "";
  const pincode = raw.trim().replace(/[^0-9]/g, "");
  if (pincode.length !== 6) {
    return NextResponse.json(
      { ok: false, error: "BAD_PINCODE" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1) Cache lookup — only return if it's still fresh.
  const cached = await admin
    .from("pincode_serviceability_cache")
    .select("pincode, serviceable, eta_days_min, eta_days_max, last_checked_at")
    .eq("pincode", pincode)
    .maybeSingle();

  if (cached.data) {
    const ageMs = Date.now() - new Date(cached.data.last_checked_at).getTime();
    if (ageMs < TTL_MS) {
      return NextResponse.json({
        ok: true,
        pincode,
        serviceable: cached.data.serviceable,
        etaDaysMin: cached.data.eta_days_min,
        etaDaysMax: cached.data.eta_days_max,
        source: "cache",
      });
    }
  }

  // 2) Cache miss / stale → call Shipsy.
  const result = await checkPincodeWithShipsy(pincode);
  const debug = url.searchParams.get("debug") === "1";

  // Fail-open: if we couldn't determine, return undetermined and don't
  // poison the cache. Caller will treat null as "we'll confirm at
  // checkout" and not block the user.
  if (result.serviceable === null) {
    // Log server-side so we can see exactly what went wrong with Shipsy
    // even though the customer-facing response stays opaque.
    console.warn("[serviceability] live-undetermined", {
      pincode,
      diag: result.diag,
      raw: result.raw,
    });
    return NextResponse.json({
      ok: true,
      pincode,
      serviceable: null,
      etaDaysMin: null,
      etaDaysMax: null,
      source: "live-undetermined",
      ...(debug ? { diag: result.diag, raw: result.raw } : {}),
    });
  }

  // 3) Persist the live answer.
  await admin
    .from("pincode_serviceability_cache")
    .upsert(
      {
        pincode,
        serviceable: result.serviceable,
        eta_days_min: result.etaDaysMin,
        eta_days_max: result.etaDaysMax,
        payload: (result.raw as any) ?? null,
        last_checked_at: new Date().toISOString(),
        source: "shipsy",
      },
      { onConflict: "pincode" }
    );

  return NextResponse.json({
    ok: true,
    pincode,
    serviceable: result.serviceable,
    etaDaysMin: result.etaDaysMin,
    etaDaysMax: result.etaDaysMax,
    source: "live",
  });
}
