// lib/supabaseRoute.ts
import "server-only";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * Route-handler Supabase client.
 *
 * Uses `@supabase/auth-helpers-nextjs` so the cookie format matches what
 * `middleware.ts` refreshes and what `/api/auth/attach` writes after a
 * successful sign-in. Mixing this with `@supabase/ssr`'s
 * `createServerClient` was reading cookies in a different layout, which
 * surfaced as silent 401s on every authenticated API call (most
 * visibly: `Unauthorized` toasts during checkout).
 */
export function supabaseRouteClient() {
  return createRouteHandlerClient({ cookies });
}
