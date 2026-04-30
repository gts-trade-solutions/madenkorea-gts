import "server-only";
import { DTDC_SHIPSY } from "./env";

/**
 * Result of a pincode serviceability check. `serviceable=null` means
 * we couldn't determine — caller should fail-open (let the user proceed)
 * rather than blocking checkout.
 */
export type PincodeServiceability = {
  serviceable: boolean | null;
  etaDaysMin: number | null;
  etaDaysMax: number | null;
  raw?: unknown;
  /**
   * When `serviceable` is null this explains why — useful for
   * diagnosing carrier or schema issues without leaking it to users.
   */
  diag?: {
    stage: "ok" | "bad_pincode" | "fetch_threw" | "non_2xx" | "no_json" | "schema_mismatch";
    httpStatus?: number;
    url?: string;
    message?: string;
  };
};

const SERVICEABILITY_PATH =
  process.env.DTDC_SHIPSY_SERVICEABILITY_PATH ||
  "/api/customer/integration/customer/v3/customer-pincode";

/**
 * Hit Shipsy's pincode-serviceability endpoint. The exact path varies
 * by account; override with `DTDC_SHIPSY_SERVICEABILITY_PATH` in env.
 *
 * On any failure (network, non-2xx, schema mismatch) we return
 * `{ serviceable: null }` so the route handler can fail-open.
 */
export async function checkPincodeWithShipsy(
  pincode: string
): Promise<PincodeServiceability> {
  const cleaned = pincode.trim().replace(/[^0-9]/g, "");
  if (cleaned.length !== 6) {
    return {
      serviceable: null,
      etaDaysMin: null,
      etaDaysMax: null,
      diag: { stage: "bad_pincode" },
    };
  }

  const url = `${DTDC_SHIPSY.baseUrl}${SERVICEABILITY_PATH}/${cleaned}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "api-key": DTDC_SHIPSY.apiKey,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
  } catch (e: any) {
    return {
      serviceable: null,
      etaDaysMin: null,
      etaDaysMax: null,
      diag: { stage: "fetch_threw", url, message: e?.message || String(e) },
    };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      serviceable: null,
      etaDaysMin: null,
      etaDaysMax: null,
      raw: body,
      diag: { stage: "non_2xx", url, httpStatus: res.status, message: body.slice(0, 500) },
    };
  }

  const json: any = await res.json().catch(() => null);
  if (!json) {
    return {
      serviceable: null,
      etaDaysMin: null,
      etaDaysMax: null,
      diag: { stage: "no_json", url, httpStatus: res.status },
    };
  }

  const shaped = normaliseShipsyResponse(json);
  if (shaped.serviceable === null) {
    return {
      ...shaped,
      raw: json,
      diag: { stage: "schema_mismatch", url, httpStatus: res.status },
    };
  }
  return { ...shaped, raw: json, diag: { stage: "ok", url, httpStatus: res.status } };
}

function normaliseShipsyResponse(json: any): {
  serviceable: boolean | null;
  etaDaysMin: number | null;
  etaDaysMax: number | null;
} {
  if (!json || typeof json !== "object") {
    return { serviceable: null, etaDaysMin: null, etaDaysMax: null };
  }

  const inner =
    json.data ?? json.customer_pincode ?? json.result ?? json.payload ?? json;

  // serviceable flag
  let serviceable: boolean | null = null;
  if (typeof inner.is_serviceable === "boolean") serviceable = inner.is_serviceable;
  else if (typeof inner.serviceable === "boolean") serviceable = inner.serviceable;
  else if (typeof inner.serviceable === "string") {
    const s = inner.serviceable.toLowerCase();
    if (s === "y" || s === "yes" || s === "true") serviceable = true;
    else if (s === "n" || s === "no" || s === "false") serviceable = false;
  } else if (typeof json.serviceable === "boolean") {
    serviceable = json.serviceable;
  }

  // ETA range
  let etaDaysMin: number | null = null;
  let etaDaysMax: number | null = null;
  const edd = inner.edd ?? inner.eta ?? inner.tat ?? null;
  if (typeof edd === "object" && edd) {
    if (typeof edd.min_days === "number") etaDaysMin = edd.min_days;
    if (typeof edd.max_days === "number") etaDaysMax = edd.max_days;
  } else if (typeof edd === "string") {
    const m = edd.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (m) {
      etaDaysMin = parseInt(m[1], 10);
      etaDaysMax = parseInt(m[2], 10);
    } else {
      const single = edd.match(/(\d+)/);
      if (single) {
        etaDaysMin = parseInt(single[1], 10);
        etaDaysMax = etaDaysMin;
      }
    }
  } else if (typeof inner.eta_days === "number") {
    etaDaysMin = inner.eta_days;
    etaDaysMax = inner.eta_days;
  }

  return { serviceable, etaDaysMin, etaDaysMax };
}
