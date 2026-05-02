export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";

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
  if (prof?.role !== "admin")
    return { error: json({ ok: false, error: "FORBIDDEN" }, 403) };
  return { error: null };
}

/**
 * Invalidate Next.js caches after admin edits to a product.
 *
 * The public product page wraps both the data fetch (in `unstable_cache`
 * tagged 'products') and the page itself (`revalidate = 300`), so without
 * this call price/copy/image changes linger on the storefront for up to
 * five minutes. We bust both layers here, plus the brand and category
 * pages so listing surfaces also pick up the new state.
 */
export async function POST(req: Request) {
  const { error } = await getAdminOr401();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const productId = String(body.productId || "").trim();
  if (!productId) return json({ ok: false, error: "MISSING_PRODUCT_ID" }, 400);

  // Resolve slug + parent slugs so we can revalidate the right paths.
  const admin = createAdminClient();
  const { data: prod } = await admin
    .from("products")
    .select("slug, brands(slug), categories:category_id(slug)")
    .eq("id", productId)
    .maybeSingle();

  // Bust the data-cache for every product (cheap, single shared key).
  revalidateTag("products");

  // Bust the rendered HTML for the affected paths.
  const slug = (prod as any)?.slug as string | undefined;
  if (slug) {
    revalidatePath(`/products/${slug}`);
    revalidatePath(`/product/${slug}`); // legacy alias
  }

  const brandSlug = (prod as any)?.brands?.slug as string | undefined;
  if (brandSlug) revalidatePath(`/brand/${brandSlug}`);

  const categorySlug = (prod as any)?.categories?.slug as string | undefined;
  if (categorySlug) revalidatePath(`/c/${categorySlug}`);

  // Home shows trending / featured grids, so flush it too.
  revalidatePath("/");

  return json({
    ok: true,
    slug: slug ?? null,
    brand: brandSlug ?? null,
    category: categorySlug ?? null,
  });
}
