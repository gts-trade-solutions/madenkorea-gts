export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

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

// Called by the banner admin after any save/delete/toggle so the
// home page reflects the change immediately instead of waiting for
// the 30s ISR window. Tag invalidation drops the unstable_cache
// entry behind getBanners; revalidatePath('/') refreshes the rendered
// home route.
export async function POST() {
  const { error } = await getAdminOr401();
  if (error) return error;

  revalidateTag("banners");
  revalidatePath("/");

  return json({ ok: true });
}
