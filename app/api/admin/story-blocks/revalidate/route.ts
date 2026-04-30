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
  if (!user) return { supabase, user: null, error: json({ ok: false, error: "UNAUTH" }, 401) };

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "admin")
    return { supabase, user: null, error: json({ ok: false, error: "FORBIDDEN" }, 403) };

  return { supabase, user, error: null };
}

/**
 * Invalidate Next.js caches after admin edits to product_story_blocks.
 * The public product page wraps both the block fetch and the page itself
 * in `unstable_cache` / `revalidate = 300`, so without this call deleted
 * blocks stay visible to customers for up to five minutes.
 */
export async function POST(req: Request) {
  const { supabase, error } = await getAdminOr401();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const productId = String(body.productId || "").trim();
  if (!productId) return json({ ok: false, error: "MISSING_PRODUCT_ID" }, 400);

  // Tag invalidates the unstable_cache used by getStoryBlocksForProduct.
  revalidateTag("story-blocks");

  // Resolve the slug so we can drop the rendered HTML for that product page.
  const { data: prod } = await supabase
    .from("products")
    .select("slug")
    .eq("id", productId)
    .maybeSingle();
  const slug = prod?.slug as string | undefined;
  if (slug) revalidatePath(`/products/${slug}`);

  return json({ ok: true, slug: slug ?? null });
}
