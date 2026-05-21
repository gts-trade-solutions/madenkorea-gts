// app/api/me/influencer/route.ts
//
// Returns the caller's influencer profile record (or {ok: true,
// influencer: null} if they don't have one). Used by:
//   • /influencer/links — needs the handle to build /r/<handle>?p=<slug>
//     share links. The page used to fetch this exact endpoint, but the
//     route didn't exist — handle never loaded, generator was broken.
//
// Scoped narrowly to the fields the dashboard surfaces actually need.
// Keep it that way; if a future page needs more, add a separate route
// instead of fattening this response.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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
    .select("handle, display_name, active, applicable_countries")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // Mirror `handle` at the top level too — the existing /influencer/links
  // page reads `mj?.handle` rather than `mj.influencer.handle`. Keeping
  // both shapes means the page works as-is without an additional patch.
  return NextResponse.json({
    ok: true,
    handle: data?.handle ?? null,
    influencer: data ?? null,
  });
}
