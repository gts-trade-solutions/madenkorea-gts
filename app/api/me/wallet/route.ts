// app/api/me/wallet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type WalletData = {
  upi_id?: string | null;
  bank?: { name?: string | null; number?: string | null; ifsc?: string | null } | null;
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

/** Sanitize to the UI contract */
function sanitizeWallet(raw: any): WalletData {
  if (!raw || typeof raw !== "object") return {};
  const upi_id = typeof raw.upi_id === "string" ? raw.upi_id : null;
  const bank = raw.bank && typeof raw.bank === "object" ? {
    name: typeof raw.bank.name === "string" ? raw.bank.name : null,
    number: typeof raw.bank.number === "string" ? raw.bank.number : null,
    ifsc: typeof raw.bank.ifsc === "string" ? raw.bank.ifsc : null,
  } : null;
  return { upi_id, bank };
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
  const upi_id = typeof body.upi_id === "string" ? body.upi_id.trim() : null;
  const bank = body.bank && typeof body.bank === "object" ? {
    name: typeof body.bank.name === "string" ? body.bank.name.trim() : "",
    number: typeof body.bank.number === "string" ? body.bank.number.trim() : "",
    ifsc: typeof body.bank.ifsc === "string" ? body.bank.ifsc.trim() : "",
  } : null;

  // Validate: exactly one method; and required fields for bank
  const hasUpi = !!upi_id;
  const hasBank = !!(bank && bank.name && bank.number && bank.ifsc);

  if (!hasUpi && !hasBank) {
    return NextResponse.json({ ok: false, error: "Provide UPI ID or full bank details" }, { status: 400 });
  }
  if (hasUpi && hasBank) {
    return NextResponse.json({ ok: false, error: "Choose either UPI or Bank, not both" }, { status: 400 });
  }

  const payload: WalletData = hasUpi
    ? { upi_id, bank: null }
    : { upi_id: null, bank };

  try {
    const { error } = await sb.rpc("save_my_wallet_meta", { p_wallet: payload as any });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
