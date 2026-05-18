// app/api/me/display-currency/route.ts
//
// Influencer-scoped GET/PATCH for the locked dashboard display
// currency. Stored as `influencer_profiles.display_currency` (default
// 'INR'). Source of truth for commissions stays INR — this only
// controls how amounts are rendered on /influencer/*. Influencer
// self-serves; admin can override from /admin/influencers later
// (separate endpoint, future).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
} from "@/lib/currency";

export const dynamic = "force-dynamic";

async function withUser(req: NextRequest) {
  const cookieStore = cookies();
  const sbCookies = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
  let {
    data: { user },
  } = await sbCookies.auth.getUser();
  let sb: any = sbCookies;
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
      if (data.user) {
        user = data.user;
        sb = sbBearer;
      }
    }
  }
  return { user, sb };
}

export async function GET(req: NextRequest) {
  const { user, sb } = await withUser(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const { data, error } = await sb
    .from("influencer_profiles")
    .select("display_currency")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    display_currency: data?.display_currency || "INR",
    supported: SUPPORTED_CURRENCIES,
  });
}

export async function PATCH(req: NextRequest) {
  const { user, sb } = await withUser(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const next = String(body.display_currency || "").toUpperCase();
  if (!isSupportedCurrency(next)) {
    return NextResponse.json(
      { ok: false, error: "INVALID_CURRENCY" },
      { status: 400 }
    );
  }
  const { error } = await sb
    .from("influencer_profiles")
    .update({ display_currency: next, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, display_currency: next });
}
