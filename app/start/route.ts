import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();

  // Not logged-in → send to Register-as-Influencer
  if (!auth?.user) {
    const u = new URL(req.url);
    u.pathname = "/auth/register";
    u.searchParams.set("mode", "influencer");
    return NextResponse.redirect(u);
  }

  // Logged-in → ensure there is a pending request (idempotent)
  const { error } = await supabase.rpc("request_influencer", {
    p_handle: null,
    p_social: {},
    p_note: null,
  });

  // Ignore errors like “already approved”, we'll let the portal gate decide
  // (but you can surface error if you prefer)
  const to = new URL("/influencer", req.url);
  return NextResponse.redirect(to);
}
