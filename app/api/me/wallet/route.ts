// app/api/me/wallet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Influencer payout-method wallet. Stored as `payout_meta` jsonb on
// `influencer_profiles`, written via `save_my_wallet_meta` RPC.
//
// The influencer fills in whatever channels are relevant — they can
// populate one, several, or all. Commission ledger stays INR-only;
// these fields just tell the admin HOW to wire the actual money out
// when they process a payout (which happens outside the app — admin
// uses their preferred provider per influencer).
type WalletData = {
  // Indian rails
  upi_id?: string | null;
  bank?: {
    name?: string | null;
    number?: string | null;
    ifsc?: string | null;
  } | null;
  // International bank — SWIFT/IBAN
  bank_intl?: {
    bank_name?: string | null;
    account_holder?: string | null;
    account_number?: string | null;
    swift_bic?: string | null;
    iban?: string | null;
    routing_number?: string | null;
    branch_address?: string | null;
  } | null;
  // Provider-based rails
  paypal_email?: string | null;
  wise_email?: string | null;
  // Influencer's preferred method hint for admin — informational only.
  // One of: 'upi' | 'bank' | 'bank_intl' | 'paypal' | 'wise'.
  preferred_method?: string | null;
};

/** Get user via sb-* cookies or Authorization: Bearer */
async function withUser(req: NextRequest) {
  const cookieStore = cookies();
  const sbCookies = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  let { data: { user } } = await sbCookies.auth.getUser();
  let sb = sbCookies;

  if (!user) {
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (token) {
      const sbBearer = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      const { data } = await sbBearer.auth.getUser(token);
      if (data.user) { user = data.user; sb = sbBearer as any; }
    }
  }

  return { user, sb };
}

// Pull a string field out of arbitrary jsonb safely. Returns null
// when missing or wrong type. Strings are trimmed but not validated
// further — admin uses the raw value to wire the money out.
const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/** Sanitize to the UI contract — extends the legacy shape with intl
 *  bank + PayPal + Wise. Legacy `upi_id` / `bank` rows continue to
 *  work unchanged. */
function sanitizeWallet(raw: any): WalletData {
  if (!raw || typeof raw !== "object") return {};

  const upi_id = str(raw.upi_id);

  const bankIn = raw.bank && typeof raw.bank === "object" ? raw.bank : null;
  const bank = bankIn
    ? {
        name: str(bankIn.name),
        number: str(bankIn.number),
        ifsc: str(bankIn.ifsc),
      }
    : null;

  const intlIn =
    raw.bank_intl && typeof raw.bank_intl === "object" ? raw.bank_intl : null;
  const bank_intl = intlIn
    ? {
        bank_name: str(intlIn.bank_name),
        account_holder: str(intlIn.account_holder),
        account_number: str(intlIn.account_number),
        swift_bic: str(intlIn.swift_bic),
        iban: str(intlIn.iban),
        routing_number: str(intlIn.routing_number),
        branch_address: str(intlIn.branch_address),
      }
    : null;

  const paypal_email = str(raw.paypal_email);
  const wise_email = str(raw.wise_email);

  // Coerce preferred_method to a known value or null.
  const allowedPref = ["upi", "bank", "bank_intl", "paypal", "wise"];
  const prefRaw = str(raw.preferred_method);
  const preferred_method =
    prefRaw && allowedPref.includes(prefRaw) ? prefRaw : null;

  return {
    upi_id,
    bank,
    bank_intl,
    paypal_email,
    wise_email,
    preferred_method,
  };
}

// Heuristic: is any of the four methods filled in to be usable?
function hasAnyMethod(w: WalletData): boolean {
  if (w.upi_id) return true;
  if (w.bank && w.bank.name && w.bank.number && w.bank.ifsc) return true;
  if (
    w.bank_intl &&
    w.bank_intl.bank_name &&
    w.bank_intl.account_holder &&
    w.bank_intl.account_number &&
    (w.bank_intl.swift_bic || w.bank_intl.iban)
  )
    return true;
  if (w.paypal_email) return true;
  if (w.wise_email) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const { user, sb } = await withUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await sb.rpc("get_my_wallet_meta");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    const wallet = sanitizeWallet(data || {});
    return NextResponse.json({ ok: true, wallet });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, sb } = await withUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // Multi-method save. Influencer can fill any combination of
  // channels — UPI, Indian bank, international bank, PayPal, Wise.
  // We just need at least ONE to be fully populated so the admin has
  // a way to wire them money. Removed the old "exactly one method"
  // rule: many international creators want both PayPal AND a bank
  // wire option saved so admin can pick at payout time.
  const incoming = sanitizeWallet(body);

  if (!hasAnyMethod(incoming)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Provide at least one payout method (UPI, bank, international bank, PayPal, or Wise).",
      },
      { status: 400 }
    );
  }

  // Indian bank requires all three fields (name, number, IFSC).
  // International bank requires holder + number + (SWIFT or IBAN).
  // Validated as "if you started filling this channel, finish it" so
  // partial entries don't silently fail later.
  if (incoming.bank) {
    const b = incoming.bank;
    const partial = (b.name || b.number || b.ifsc) && !(b.name && b.number && b.ifsc);
    if (partial) {
      return NextResponse.json(
        {
          ok: false,
          error: "Indian bank requires name, account number, and IFSC.",
        },
        { status: 400 }
      );
    }
  }
  if (incoming.bank_intl) {
    const b = incoming.bank_intl;
    const startedFilling =
      b.bank_name ||
      b.account_holder ||
      b.account_number ||
      b.swift_bic ||
      b.iban;
    const complete =
      b.bank_name &&
      b.account_holder &&
      b.account_number &&
      (b.swift_bic || b.iban);
    if (startedFilling && !complete) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "International bank requires bank name, account holder, account number, and a SWIFT/BIC or IBAN.",
        },
        { status: 400 }
      );
    }
  }

  try {
    const { error } = await sb.rpc("save_my_wallet_meta", {
      p_wallet: incoming as any,
    });
    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
