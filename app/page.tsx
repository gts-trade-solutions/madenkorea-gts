// app/page.tsx
import { CustomerLayout } from "@/components/CustomerLayout";
import { HeroBanner } from "@/components/home/HeroBanner";
import { getBanners } from "./_data/getBanners";
import { EditorialSection } from "@/components/home/EditorialSection";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { getBrandsForCarousel } from "./_data/getBrands";
import { InstagramVideoCarousel } from "@/components/home/InstagramVideoCarousel";
import { getInfluencerVideos } from "./_data/getInfluencerVideos";
import { createClient } from "@supabase/supabase-js";
import HomeVideoCarouselSection from "@/components/home/HomeVideoCarouselSection";
import CertificationSwiper from "@/components/Cetifications";
import type { Metadata } from "next";

const SITE_URL = "https://madenkorea.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MadenKorea - Consumer Innovations",
    template: "%s | MadenKorea",
  },
  description:
    "Discover trending Korean skincare, personal care, and lifestyle products. K-beauty brands, curated drops, and the latest consumer innovations from Korea.",
  keywords: [
    // Brand & high-level
    "MadenKorea",
    "K-beauty",
    "Korean beauty",
    "skincare",
    "skin care",
    "cosmetics",
    "makeup",
    "haircare",
    "personal care",
    "lifestyle products",
    "beauty products",
    "online beauty store",
    "buy skincare online",
    "buy beauty products online",

    // Generic product types (no Korea prefix)
    "sunscreen",
    "sun cream",
    "SPF 50",
    "SPF 30",
    "face serum",
    "serum",
    "vitamin C serum",
    "hyaluronic acid serum",
    "moisturizer",
    "face cream",
    "day cream",
    "night cream",
    "gel cream",
    "cleanser",
    "face wash",
    "foam cleanser",
    "gel cleanser",
    "oil cleanser",
    "toner",
    "essence",
    "ampoule",
    "eye cream",
    "eye serum",
    "sheet mask",
    "clay mask",
    "wash off mask",
    "lip balm",
    "lip mask",
    "lip tint",

    // Skin concerns / routines
    "acne care",
    "pore care",
    "anti-aging",
    "anti wrinkle",
    "brightening",
    "whitening",
    "dark spot care",
    "hydrating",
    "glowing skin",
    "glass skin",
    "sensitive skin",
    "dry skin",
    "oily skin",
    "combination skin",
    "skin barrier repair",
    "skin care routine",
    "10 step skincare routine",

    // Korea-specific + India targeting
    "Korean skincare",
    "Korean skin care",
    "Korean cosmetics",
    "Korean makeup",
    "Korean haircare",
    "Korean personal care",
    "Korean lifestyle products",
    "Korean beauty India",
    "Korean beauty products India",
    "buy Korean skincare online",
    "K-beauty online store",
    "authentic Korean brands",
    "Korean face serum",
    "Korean sunscreen",
    "Korean moisturizer",
    "Korean toner",
    "Korean sheet mask",
    "consumer innovations",
    "Korea shopping",
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "MadenKorea",
    title: "MadenKorea - Consumer Innovations",
    description:
      "Shop Korean beauty, personal care, and lifestyle products curated for you.",
    images: [
      {
        url: "/logo-md.png",
        width: 1200,
        height: 630,
        alt: "MadenKorea homepage",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MadenKorea - Korean Beauty & Consumer Innovations",
    description:
      "Shop authentic Korean beauty, personal care, and lifestyle products curated for you.",
    images: ["/logo-md.png"],
  },
  icons: {
    icon: "/favicon.ico",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  applicationName: "MadenKorea",
  category: "ecommerce",
  other: {
    "format-detection": "telephone=no, address=no, email=no",
  },
};

export const revalidate = 30; // ISR: refresh the home data every 5 minutes

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const supabase = supabaseServer();
  const { data } = supabase.storage.from("product-media").getPublicUrl(path);
  return data.publicUrl ?? null;
}

type CardProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  new_until?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  stock_qty?: number | null;
  hero_image_path?: string | null;
  hero_image_url?: string | null; // added for SEO / schema image
  brands?: { name?: string | null } | null;
};

async function fetchEditorial(
  kind: "featured" | "trending",
  limit = 8
): Promise<CardProduct[]> {
  const supabase = supabaseServer();

  let query = supabase
    .from("products")
    .select(
      `
      id, slug, name,
      price, currency,
      compare_at_price, sale_price, sale_starts_at, sale_ends_at,
      is_featured, is_trending, new_until,
      short_description, volume_ml, net_weight_g, country_of_origin,
      hero_image_path, stock_qty,
      brands ( name )
    `
    )
    .eq("is_published", true);

  if (kind === "featured") {
    query = query
      .eq("is_featured", true)
      .order("featured_rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query
      .eq("is_trending", true)
      .order("purchases_count", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false });
  }

  const { data, error } = await query.limit(limit);
  if (error) {
    console.error("fetchEditorial error", kind, error);
    return [];
  }

  return (data ?? []).map((p) => ({
    ...p,
    hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
  }));
}

export default async function Home() {
  const [banners, brands, influencerVideos, trendingProducts, featuredProducts] =
    await Promise.all([
      getBanners("home"),
      getBrandsForCarousel("site-assets"),
      getInfluencerVideos("home", 12),
      fetchEditorial("trending", 8),
      fetchEditorial("featured", 8),
    ]);

  // --- JSON-LD (Google schema) for home + featured products ---

  const homeJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}#website`,
        url: SITE_URL,
        name: "MadenKorea",
        description:
          "MadenKorea is a curated marketplace for Korean beauty, skincare, personal care, and lifestyle products.",
        inLanguage: "en-IN",
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}#organization`,
        name: "MadenKorea",
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/logo-md.png`,
        },
      },
    ],
  };

  const productGraph =
    featuredProducts.length > 0
      ? featuredProducts.map((p) => {
          const price = p.sale_price ?? p.price ?? null;
          const currency = p.currency ?? "INR";

          return {
            "@type": "Product",
            "@id": `${SITE_URL}/products/${p.slug}#product`,
            name: p.name,
            image: p.hero_image_url
              ? [p.hero_image_url.startsWith("http")
                  ? p.hero_image_url
                  : `${SITE_URL}${p.hero_image_url}`]
              : undefined,
            description: p.short_description ?? undefined,
            brand: p.brands?.name
              ? { "@type": "Brand", name: p.brands.name }
              : undefined,
            sku: p.id,
            url: `${SITE_URL}/products/${p.slug}`,
            offers:
              price !== null
                ? {
                    "@type": "Offer",
                    priceCurrency: currency,
                    price: price.toString(),
                    availability: "https://schema.org/InStock",
                    url: `${SITE_URL}/products/${p.slug}`,
                  }
                : undefined,
          };
        })
      : [];

  const productJsonLd =
    productGraph.length > 0
      ? {
          "@context": "https://schema.org",
          "@graph": productGraph,
        }
      : null;

  return (
    <>
      {/* SEO: main page & organization schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      {/* SEO: featured product schema for Google rich results */}
      {productJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}

      <CustomerLayout>
        <HeroBanner banners={banners} />

        <div className="container mx-auto py-12 space-y-16">
          {/* Trending from Supabase */}
          {trendingProducts.length > 0 && (
            <EditorialSection
              title="Trending Now"
              description="The hottest Korean beauty and consumer innovations everyone’s talking about."
              products={trendingProducts}
            />
          )}

          {/* Keep existing Best Sellers (mock) if needed */}
          {/* {bestsellerProducts.length > 0 && (
            <EditorialSection
              title="Best Sellers"
              description="Customer favorites and top-rated products"
              products={bestsellerProducts.slice(0, 8) as any}
            />
          )} */}
{/* <KPlusPromoBanner /> */}
          <HomeVideoCarouselSection pageScope="home" limit={8} />

          <BrandCarousel brands={brands} />

          {/* {newArrivalProducts.length > 0 && (
            <EditorialSection
              title="New Arrivals"
              description="Fresh from Korea: Latest beauty innovations"
              products={newArrivalProducts.slice(0, 8) as any}
            />
          )} */}

          {/* Featured from Supabase */}
          {featuredProducts.length > 0 && (
            <EditorialSection
              title="Featured Products"
              description="Handpicked Korean skincare and lifestyle bestsellers, curated by MadenKorea."
              products={featuredProducts}
            />
          )}

          {influencerVideos.length > 0 && (
            <InstagramVideoCarousel videos={influencerVideos} />
          )}
          <CertificationSwiper />
        </div>
      </CustomerLayout>
    </>
  );
}

