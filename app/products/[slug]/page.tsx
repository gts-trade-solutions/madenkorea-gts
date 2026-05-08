// app/products/[slug]/page.tsx
export const revalidate = 300;

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import ProductPage from './product';
import type { StoryBlock } from '@/lib/types/productStory';
import { DELIVERY_THRESHOLD, DEFAULT_SHIPPING_FEE } from '@/lib/membership';
import { BreadcrumbJsonLd, type BreadcrumbCrumb } from '@/components/BreadcrumbJsonLd';

const STORY_SELECT_COLUMNS =
  'id, product_id, position, block_type, size, mode, headline, body, text_position, text_color, text_bg, text_size, text_weight, caption_mode, caption_backdrop, split_direction, image_path, image_alt, image_focal_x, image_focal_y, image_fit, image_zoom, image_bg, caption, stats_items, before_image_path, after_image_path, comparison_caption, created_at, updated_at';

const getStoryBlocksForProduct = unstable_cache(
  async (productId: string): Promise<StoryBlock[]> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from('product_story_blocks')
      .select(STORY_SELECT_COLUMNS)
      .eq('product_id', productId)
      .order('position', { ascending: true });
    if (error) {
      // If a v3/v4 column hasn't been added yet, retry without it so
      // we don't take the section offline during the migration window.
      const optionalCols = [
        'text_size',
        'text_weight',
        'caption_mode',
        'caption_backdrop',
        'image_focal_x',
        'image_focal_y',
        'image_fit',
        'image_zoom',
        'image_bg',
        'text_bg',
      ];
      const missing = optionalCols.find((c) => error.message.includes(c));
      if (missing) {
        const stripped = optionalCols.reduce(
          (acc, c) => acc.replace(`, ${c}`, ''),
          STORY_SELECT_COLUMNS
        );
        const fallback = await supabase
          .from('product_story_blocks')
          .select(stripped)
          .eq('product_id', productId)
          .order('position', { ascending: true });
        return ((fallback.data ?? []) as unknown) as StoryBlock[];
      }
      return [];
    }
    return ((data ?? []) as unknown) as StoryBlock[];
  },
  ['story-blocks-by-product'],
  { revalidate: 300, tags: ['story-blocks'] }
);

// Build a public URL for images in the "product-media" bucket
function publicFromProductMedia(path?: string | null) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${path}`;
}

const SITE =
  (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://madenkorea.com').replace(/\/$/, '');

const getPublishedProductBySlug = unstable_cache(
  async (slug: string) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data } = await supabase
      .from('products')
      .select(`
      id, slug, name, short_description, description,
      price, currency, sale_price, compare_at_price, sale_starts_at, sale_ends_at,
      hero_image_path, stock_qty, sku,
      volume_ml, net_weight_g, country_of_origin, made_in_korea,
      brands ( name, slug )
    `)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();

    return data ?? null;
  },
  ['published-product-by-slug'],
  // Tag with both a global "products" key and a per-slug key so the
  // admin save handler can invalidate just the affected product without
  // wiping every product cache.
  { revalidate: 300, tags: ['products'] }
);

// Gallery images for the JSON-LD `image[]` array. Cached separately so
// admin updates to gallery don't require full product re-fetch.
const getProductImagePaths = unstable_cache(
  async (productId: string): Promise<string[]> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from('product_images')
      .select('storage_path')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })
      .limit(8);
    return (data ?? []).map((r) => r.storage_path).filter(Boolean) as string[];
  },
  ['product-image-paths'],
  { revalidate: 300, tags: ['products'] }
);

// Pre-aggregated rating from the `product_review_stats` view. Returns
// null when the product has no published reviews — JSON-LD only includes
// `aggregateRating` when there is at least one review (Google requires
// reviewCount >= 1).
const getProductReviewStats = unstable_cache(
  async (productId: string): Promise<{ rating_avg: number | null; rating_count: number } | null> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from('product_review_stats')
      .select('rating_avg, rating_count')
      .eq('product_id', productId)
      .maybeSingle();
    return data ?? null;
  },
  ['product-review-stats'],
  { revalidate: 300, tags: ['products', 'reviews'] }
);

// ----------------- Metadata -----------------
export async function generateMetadata(
  { params }: { params: { slug?: string; handle?: string } }
): Promise<Metadata> {
  const slug = params?.slug || params?.handle;
  if (!slug) {
    return {
      title: 'Product not found | MadenKorea',
      description: 'This product is unavailable.',
      robots: { index: false, follow: false },
    };
  }

  const prod = await getPublishedProductBySlug(slug);

  if (!prod) {
    return {
      title: 'Product not found | MadenKorea',
      description: 'This product is unavailable.',
      robots: { index: false, follow: false },
    };
  }

  const canonical = `${SITE}/products/${prod.slug}`;
  const image =
    publicFromProductMedia(prod.hero_image_path) ?? `${SITE}/og/product-default.jpg`;

  const title = `${prod.name} — Buy Online at MadenKorea`;
  const description =
    prod.short_description ??
    (prod.description ? prod.description.slice(0, 160) : 'Shop Korean beauty and lifestyle products.');
  const currency = (prod.currency ?? 'INR').toUpperCase();

  return {
    title,
    description,
    alternates: { canonical },
    keywords: [
      'MadenKorea',
      'Korean beauty',
      'K-beauty',
      prod.brands?.name || 'Brand',
      prod.name,
    ],
    openGraph: {
      url: canonical,
      siteName: 'MadenKorea',
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: prod.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

// ----------------- Page -----------------
export default async function Page({
  params,
}: {
  params: { slug?: string; handle?: string };
}) {
  const slug = params?.slug || params?.handle;
  if (!slug) notFound();

  // Fetch again here so we can emit JSON-LD (keeps ProductPage untouched)
  const prod = await getPublishedProductBySlug(slug);

  if (!prod) notFound();

  // Server-side fetch of Discover blocks so the section is SEO-visible
  // and doesn't trigger a separate client roundtrip after hydration.
  // Run alongside the gallery + review-stats fetches in parallel.
  const [storyBlocks, galleryPaths, reviewStats] = await Promise.all([
    prod.id ? getStoryBlocksForProduct(prod.id) : Promise.resolve([] as StoryBlock[]),
    prod.id ? getProductImagePaths(prod.id) : Promise.resolve([] as string[]),
    prod.id ? getProductReviewStats(prod.id) : Promise.resolve(null),
  ]);

  // Combined image list: hero first (Google prefers landscape primary),
  // then gallery in admin sort order, deduped, fallback to default OG.
  const heroUrl = publicFromProductMedia(prod.hero_image_path);
  const galleryUrls = galleryPaths
    .map((p) => publicFromProductMedia(p))
    .filter((u): u is string => !!u);
  const allImages = Array.from(
    new Set([heroUrl, ...galleryUrls].filter((u): u is string => !!u))
  );
  const image = allImages.length ? allImages : [`${SITE}/og/product-default.jpg`];

  const description =
    prod.short_description ??
    (prod.description ? prod.description.slice(0, 160) : undefined);
  const currency = (prod.currency ?? 'INR').toUpperCase();
  const finalPrice = prod.sale_price ?? prod.price;
  const inStock = (prod.stock_qty ?? 0) > 0;

  // priceValidUntil — prefer the active sale_ends_at if it's in the
  // future. Otherwise default to 1 year out, which is what Google
  // recommends when a hard sale window isn't set (omitting the field
  // raises a warning in Rich Results Test).
  const oneYearOut = new Date();
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  const saleEnd = prod.sale_ends_at ? new Date(prod.sale_ends_at) : null;
  const priceValidUntil = (saleEnd && saleEnd > new Date() ? saleEnd : oneYearOut)
    .toISOString()
    .slice(0, 10);

  // Country of origin: prefer explicit column, else infer from the
  // made_in_korea boolean. Empty string omits the field.
  const countryCode = prod.made_in_korea
    ? 'KR'
    : prod.country_of_origin?.toUpperCase().startsWith('KOREA')
    ? 'KR'
    : prod.country_of_origin?.length === 2
    ? prod.country_of_origin.toUpperCase()
    : undefined;

  // Standard "rest of India" delivery window from the storefront copy.
  // Worst-case 15d for islands; tightest 1d in Chennai metro. Reflects
  // the delivery-checker on the product page.
  const deliveryTime = {
    '@type': 'ShippingDeliveryTime',
    handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
    transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 15, unitCode: 'DAY' },
  };
  const shippingDestination = {
    '@type': 'DefinedRegion',
    addressCountry: 'IN',
  };
  // Two-tier shipping declaration: ₹DEFAULT_SHIPPING_FEE under
  // DELIVERY_THRESHOLD, free at or above. K Plus members get free
  // shipping unconditionally — that's a member benefit, not a public
  // shipping rate, so it isn't reflected here.
  const shippingDetails = [
    {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: DEFAULT_SHIPPING_FEE, currency: 'INR' },
      eligibleTransactionVolume: {
        '@type': 'PriceSpecification',
        minPrice: 0,
        maxPrice: DELIVERY_THRESHOLD - 0.01,
        priceCurrency: 'INR',
      },
      shippingDestination,
      deliveryTime,
    },
    {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'INR' },
      eligibleTransactionVolume: {
        '@type': 'PriceSpecification',
        minPrice: DELIVERY_THRESHOLD,
        priceCurrency: 'INR',
      },
      shippingDestination,
      deliveryTime,
    },
  ];

  // 7-day return window for damaged / defective / wrong items, free
  // pickup. Mirrors /policies/replacements.
  const merchantReturnPolicy = {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'IN',
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: 7,
    returnMethod: 'https://schema.org/ReturnByMail',
    returnFees: 'https://schema.org/FreeReturn',
  };

  const aggregateRating =
    reviewStats && reviewStats.rating_count > 0 && reviewStats.rating_avg != null
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number(reviewStats.rating_avg).toFixed(1),
          reviewCount: reviewStats.rating_count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined;

  // Surface volume / net weight as additionalProperty so they appear in
  // rich results without faking schema fields they don't fit (`weight`
  // is for the product itself, not packaged net weight).
  const additionalProperty = [
    prod.volume_ml ? { '@type': 'PropertyValue', name: 'Volume', value: `${prod.volume_ml} ml` } : null,
    prod.net_weight_g ? { '@type': 'PropertyValue', name: 'Net weight', value: `${prod.net_weight_g} g` } : null,
  ].filter(Boolean);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: prod.name,
    description,
    image,
    sku: prod.sku || prod.id,
    productID: prod.id,
    brand: prod.brands?.name ? { '@type': 'Brand', name: prod.brands.name } : undefined,
    countryOfOrigin: countryCode ? { '@type': 'Country', name: countryCode } : undefined,
    additionalProperty: additionalProperty.length ? additionalProperty : undefined,
    aggregateRating,
    offers: {
      '@type': 'Offer',
      url: `${SITE}/products/${prod.slug}`,
      priceCurrency: currency,
      price: finalPrice,
      priceValidUntil,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'MadenKorea' },
      shippingDetails,
      hasMerchantReturnPolicy: merchantReturnPolicy,
    },
  };

  // Breadcrumb trail. We use the brand as the mid-level when present
  // (matches the customer-visible navigation) — categories aren't shown
  // in the PDP header today, so leading with brand is more consistent.
  const crumbs: BreadcrumbCrumb[] = [
    { name: 'Home', url: '/' },
    ...(prod.brands?.name && prod.brands?.slug
      ? [{ name: prod.brands.name as string, url: `/brand/${prod.brands.slug}` }]
      : []),
    { name: prod.name, url: `/products/${prod.slug}` },
  ];

  return (
    <>
      <ProductPage initialStoryBlocks={storyBlocks} />
      <script
        type="application/ld+json"
        // undefined fields are omitted by JSON.stringify
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <BreadcrumbJsonLd items={crumbs} />
    </>
  );
}
