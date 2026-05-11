// middleware.ts
import { NextResponse } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { NextRequest } from "next/server";
import { currencyForCountry, isSupportedCurrency } from "@/lib/currency";

const CURRENCY_COOKIE = "mik_currency";
const COUNTRY_COOKIE = "mik_country";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Detect visitor country from host-provided geo headers. Order matters
 * — we trust the host that's actually serving the request first.
 * Falls back to null when no header is present (local dev).
 */
function detectCountry(req: NextRequest): string | null {
  // Netlify Next.js runtime populates `req.geo` similar to Vercel.
  const fromReq = (req as any).geo?.country;
  if (typeof fromReq === "string" && fromReq) return fromReq.toUpperCase();

  const candidates = [
    req.headers.get("x-nf-country"),       // Netlify
    req.headers.get("x-vercel-ip-country"),// Vercel
    req.headers.get("cf-ipcountry"),       // Cloudflare
  ];
  for (const c of candidates) {
    if (c && c !== "XX") return c.toUpperCase();
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // ──────────────────────────────────────────────────────────────
  // Currency cookie auto-seed
  // Runs on every request (cheap — just reads headers, sets a cookie
  // when needed). Once the cookie is set, subsequent visits short-
  // circuit. User overrides via CurrencySwitcher rewrite this cookie
  // and we leave their choice alone forever.
  // ──────────────────────────────────────────────────────────────
  const existingCurrency = req.cookies.get(CURRENCY_COOKIE)?.value;
  let response: NextResponse | null = null;

  if (!existingCurrency || !isSupportedCurrency(existingCurrency)) {
    const country = detectCountry(req);
    const seededCurrency = currencyForCountry(country);
    response = NextResponse.next();
    response.cookies.set(CURRENCY_COOKIE, seededCurrency, {
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
    });
    if (country) {
      response.cookies.set(COUNTRY_COOKIE, country, {
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        sameSite: "lax",
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Supabase session refresh — only on routes that rely on auth.
  // ──────────────────────────────────────────────────────────────
  const needsSessionRefresh =
    pathname.startsWith("/account") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    (pathname.startsWith("/vendor") &&
      pathname !== "/vendor/login" &&
      pathname !== "/vendor/register") ||
    pathname.startsWith("/auth/callback");

  if (!needsSessionRefresh) {
    return response ?? NextResponse.next();
  }

  const res = response ?? NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  await supabase.auth.getSession(); // refreshes/sets sb-* cookies
  return res;
}

export const config = {
  // Now runs on every path so the currency cookie can be seeded on
  // first visit anywhere. Static assets are excluded via the matcher
  // regex below.
  matcher: [
    // Match everything except: _next, static files, common assets.
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?|ttf|map)$).*)",
  ],
};
