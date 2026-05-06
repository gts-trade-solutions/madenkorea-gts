// app/brands/[slug]/page.tsx
import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { CustomerLayout } from "@/components/CustomerLayout";
import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";

export const revalidate = 300; // ISR: refresh every 5 minutes

type BrandRow = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  // Optional columns if you later add media to brands:
  // logo_url?: string | null;
  // banner_url?: string | null;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  hero_image_path?: string | null; // e.g. "SKU/filename.jpg"
  created_at?: string | null;
  stock_qty?: number | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  is_bundle?: boolean | null;
  brands?: { name?: string | null } | null;
};

function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const supabase = supabaseServer();
  const { data } = supabase.storage.from("product-media").getPublicUrl(path);
  return data.publicUrl ?? null;
}

export async function generateStaticParams() {
  // Pre-render a small set of brand pages (ISR will handle the rest on-demand)
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("brands")
    .select("slug")
    .order("name", { ascending: true })
    .limit(50);

  if (error || !data) return [];
  return data.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = supabaseServer();
  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle<BrandRow>();

  if (!brand) {
    return { title: "Brand Not Found | MadenKorea" };
  }

  return {
    title: `${brand.name} | MadenKorea`,
    description: brand.description ?? `Explore ${brand.name} products.`,
    alternates: { canonical: `/brands/${params.slug}` },
    openGraph: {
      title: `${brand.name} | MadenKorea`,
      description: brand.description ?? undefined,
      url: `/brands/${params.slug}`,
      type: "website",
    },
  };
}

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { sort?: string; price?: string; in_stock?: string };
}) {
  const supabase = supabaseServer();

  // 1) Brand lookup
  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle<BrandRow>();

  if (brandErr || !brand) {
    notFound();
  }

  // 2) Fetch this brand's published products
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select(
      `
      id, slug, name,
      price, currency,
      compare_at_price, sale_price, sale_starts_at, sale_ends_at,
      short_description, volume_ml, net_weight_g, country_of_origin,
      hero_image_path, created_at, stock_qty, is_featured, is_trending, is_bundle,
      brands ( name )
    `
    )
    .eq("brand_id", brand.id)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .returns<ProductRow[]>();

  if (prodErr) {
    // Optionally log or surface to an error boundary
  }

  // 3) Map hero_image_path -> public URL (same shape as CategoryPage)
  const items = (products ?? []).map((p) => ({
    ...p,
    hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
  }));

  const selectedSort = searchParams?.sort || "newest";
  const selectedPrice = searchParams?.price || "all";
  const inStockOnly = searchParams?.in_stock === "1";

  const filteredItems = items.filter((p) => {
    const effectivePrice = p.sale_price ?? p.price ?? 0;
    const passPrice =
      selectedPrice === "all"
        ? true
        : selectedPrice === "0-5000"
        ? effectivePrice >= 0 && effectivePrice <= 5000
        : selectedPrice === "5000-10000"
        ? effectivePrice > 5000 && effectivePrice <= 10000
        : selectedPrice === "10000+"
        ? effectivePrice > 10000
        : true;
    const passStock = inStockOnly ? (p.stock_qty ?? 0) > 0 : true;
    return passPrice && passStock;
  });

  const sortedItems = filteredItems.slice().sort((a, b) => {
    const aPrice = a.sale_price ?? a.price ?? 0;
    const bPrice = b.sale_price ?? b.price ?? 0;
    if (selectedSort === "price_asc") return aPrice - bPrice;
    if (selectedSort === "price_desc") return bPrice - aPrice;
    if (selectedSort === "popular") {
      const scoreA = (a.is_trending ? 2 : 0) + (a.is_featured ? 1 : 0);
      const scoreB = (b.is_trending ? 2 : 0) + (b.is_featured ? 1 : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
    }
    return (
      new Date(b.created_at ?? 0).getTime() -
      new Date(a.created_at ?? 0).getTime()
    );
  });

  return (
    <CustomerLayout>
      {/* Optional brand banner if you later add brand.banner_url */}
      {/* {brand.banner_url && (
        <div className="relative w-full aspect-[21/7] bg-muted mb-8">
          <Image src={brand.banner_url} alt={brand.name} fill className="object-cover" />
        </div>
      )} */}

      <div className="container mx-auto py-6 sm:py-8">
        {/* Brand header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Optional brand logo if you add brand.logo_url */}
          {/* {brand.logo_url && (
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0">
              <Image src={brand.logo_url} alt={brand.name} fill className="object-contain" />
            </div>
          )} */}
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-1 sm:mb-2">
              {brand.name}
            </h1>
            {brand.description && (
              <p className="text-sm sm:text-base text-muted-foreground max-w-3xl">
                {brand.description}
              </p>
            )}
          </div>
        </div>

        <ProductFilters
          itemCount={sortedItems.length}
          selectedSort={selectedSort}
          selectedPrice={selectedPrice}
          inStockOnly={inStockOnly}
        />

        {/* Products grid */}
        {/* Products grid */}
        {sortedItems.length === 0 ? (
          <div className="text-center py-10 sm:py-12">
            <p className="text-sm sm:text-base text-muted-foreground">
              No products available from this brand yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
            {sortedItems.map((product) => (
              <ProductCard key={product.id} product={product as any} />
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}

