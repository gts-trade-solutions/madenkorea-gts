export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

// Called by /admin/cms/product-video after any save / delete / toggle /
// reorder so newly-added (or hidden) home product videos appear on
// the public home page right away. Without this the home section's
// `export const revalidate = 60` caches the previous video set for up
// to a minute and the page's own ISR (30s) reuses the cached HTML.
//
// `revalidatePath('/')` busts both layers — Next re-runs the home
// route on the next request, which re-fetches the video section's
// query directly against Supabase.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

async function getAdminOr401() {
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();
  let user: any = null;

  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) user = data.user;
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return { error: json({ ok: false, error: "UNAUTH" }, 401) };

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((prof?.role !== "admin" && prof?.role !== "super_admin"))
    return { error: json({ ok: false, error: "FORBIDDEN" }, 403) };

  return { error: null };
}

export async function POST() {
  const { error } = await getAdminOr401();
  if (error) return error;

  revalidatePath("/");

  return json({ ok: true });
}
