// middleware.ts
import { NextResponse } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Only refresh Supabase session cookies on routes that rely on auth/session state.
  const needsSessionRefresh =
    pathname.startsWith("/account") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    (pathname.startsWith("/vendor") &&
      pathname !== "/vendor/login" &&
      pathname !== "/vendor/register") ||
    pathname.startsWith("/auth/callback");

  if (!needsSessionRefresh) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  await supabase.auth.getSession(); // refreshes/sets sb-* cookies
  return res;
}

export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/checkout/:path*",
    "/vendor/:path*",
    "/auth/callback/:path*",
  ],
};
