export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  isSupportedCountry,
  COUNTRY_PROFILES,
  type CountryCode,
} from "@/lib/countries";
import { isSupportedCurrency } from "@/lib/currency";
import { isSupportedLocale } from "@/lib/locales";

// Persist the visitor's country choice. Used by:
//   • the sign-up form (after auth.signUp, write the country picked
//     during registration)
//   • the <CountryGate> modal (for authenticated users without a
//     preferred_country on their profile)
//
// Side effects:
//   1. Updates `public.profiles.preferred_country` for the calling user.
//   2. Writes the `mik_country` cookie so the rest of the session
//      immediately reflects the choice (prices, K-Partnership offers,
//      shipping math, etc.).
//   3. Optionally cascades the country profile's default currency to
//      `mik_currency` and default locale to `mik_locale` IF those
//      cookies are currently absent / unsupported — never overwrites a
//      user's explicit currency/locale choice.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const raw = String(body?.country ?? body?.country_code ?? "")
    .trim()
    .toUpperCase();
  if (!isSupportedCountry(raw)) {
    return json({ ok: false, error: "UNSUPPORTED_COUNTRY" }, 400);
  }
  const country = raw as CountryCode;

  // Authenticate the caller via Supabase cookies (preferred) OR a
  // Bearer token (newly-registered users whose cookies haven't been
  // attached yet via /api/auth/attach). Either path resolves to a
  // user id; if neither works, 401.
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

  let userId: string | null = null;
  const {
    data: { user: cookieUser },
  } = await sbCookies.auth.getUser();
  if (cookieUser) userId = cookieUser.id;

  if (!userId) {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
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
      if (data.user) userId = data.user.id;
    }
  }

  if (!userId) return json({ ok: false, error: "UNAUTH" }, 401);

  // Service-role client for the profile write. RLS would allow the
  // user to update their own row, but using service-role here keeps
  // the path identical whether the caller authed via cookies or
  // bearer, and avoids a separate Supabase client per branch.
  const sbAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error: upErr } = await sbAdmin
    .from("profiles")
    .update({ preferred_country: country, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  // Build the response and set the cookies. `mik_country` always
  // updates to the new choice. Currency + locale cookies only update
  // if currently missing / unsupported — never stomp on an explicit
  // setting the user might have made via the country switcher.
  const profile = COUNTRY_PROFILES[country];
  const res = json({ ok: true, country });

  res.cookies.set("mik_country", country, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  const existingCurrency = cookieStore.get("mik_currency")?.value;
  if (!existingCurrency || !isSupportedCurrency(existingCurrency)) {
    res.cookies.set("mik_currency", profile.defaultCurrency, {
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  const existingLocale = cookieStore.get("mik_locale")?.value;
  if (!existingLocale || !isSupportedLocale(existingLocale)) {
    res.cookies.set("mik_locale", profile.defaultLocale, {
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  return res;
}
