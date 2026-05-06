export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminClient } from "@/lib/supabaseAdmin";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

async function getAdminOr401() {
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();
  let user: any = null;
  const diag: { bearer?: string; cookie?: string } = {};

  // 1) Try Bearer token from the page (supabase.auth.getSession()).
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    // Validate via the service-role admin client. This avoids any
    // dependency on auth-helpers-nextjs cookie wiring and just verifies
    // the JWT against the Supabase project directly.
    try {
      const adminAuth = createAdminClient();
      const { data, error } = await adminAuth.auth.getUser(token);
      if (error) diag.bearer = `getUser:${error.message}`;
      else if (data?.user) user = data.user;
      else diag.bearer = "getUser:no-user";
    } catch (e: any) {
      diag.bearer = `throw:${e?.message ?? "unknown"}`;
    }
  } else {
    diag.bearer = "missing";
  }

  // 2) Fallback to cookie-based session via auth-helpers-nextjs.
  if (!user) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) diag.cookie = `getUser:${error.message}`;
      else if (data?.user) user = data.user;
      else diag.cookie = "no-user";
    } catch (e: any) {
      diag.cookie = `throw:${e?.message ?? "unknown"}`;
    }
  }

  if (!user) {
    return { error: json({ ok: false, error: "UNAUTH", diag }, 401) };
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "admin")
    return { error: json({ ok: false, error: "FORBIDDEN" }, 403) };

  return { error: null };
}

const TABLE_FOR_KIND: Record<string, string> = {
  product: "home_product_video_products",
  influencer: "home_influencer_video_products",
};

// Replace-all into the chosen video-products join table. Using the
// service-role admin client so we don't depend on the browser session
// being able to evaluate the table's RLS policies — the route's own
// admin auth check above is the gate.
export async function POST(req: Request) {
  const { error: authErr } = await getAdminOr401();
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const { kind, videoId, productIds } = body ?? {};

  const table = TABLE_FOR_KIND[kind];
  if (!table) return json({ ok: false, error: "INVALID_KIND" }, 400);
  if (typeof videoId !== "string" || !videoId)
    return json({ ok: false, error: "INVALID_VIDEO_ID" }, 400);
  if (!Array.isArray(productIds))
    return json({ ok: false, error: "INVALID_PRODUCT_IDS" }, 400);

  const admin = createAdminClient();

  // 1) drop existing rows for this video.
  const { error: delErr } = await admin
    .from(table)
    .delete()
    .eq("video_id", videoId);
  if (delErr) return json({ ok: false, error: delErr.message }, 500);

  // 2) insert the new ordered set, deduped by product_id (defensive).
  const seen = new Set<string>();
  const rows = productIds
    .filter((id: unknown): id is string => typeof id === "string" && !!id)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((product_id, position) => ({ video_id: videoId, product_id, position }));

  if (rows.length === 0) return json({ ok: true, count: 0 });

  const { error: insErr } = await admin.from(table).insert(rows);
  if (insErr) return json({ ok: false, error: insErr.message }, 500);

  return json({ ok: true, count: rows.length });
}
