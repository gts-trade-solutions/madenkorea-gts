// app/products/[slug]/page.tsx
export const revalidate = 300;

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import ProductPage from './product';
import type { StoryBlock } from '@/lib/types/productStory';

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
      price, currency, sale_price, compare_at_price, hero_image_path,
      brands ( name, slug )
    `)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();

    return data ?? null;
  },
  ['published-product-by-slug'],
  { revalidate: 300 }
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
  const storyBlocks = prod.id ? await getStoryBlocksForProduct(prod.id) : [];

  const image =
    publicFromProductMedia(prod.hero_image_path) ?? `${SITE}/og/product-default.jpg`;
  const description =
    prod.short_description ??
    (prod.description ? prod.description.slice(0, 160) : undefined);
  const currency = (prod.currency ?? 'INR').toUpperCase();

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: prod.name,
    description,
    image: [image],
    brand: prod.brands?.name ? { '@type': 'Brand', name: prod.brands.name } : undefined,
    offers: {
      '@type': 'Offer',
      url: `${SITE}/products/${prod.slug}`,
      priceCurrency: currency,
      price: prod.sale_price ?? prod.price,
      // availability, sku, ratings, etc. can be added if your schema has them
    },
  };

  return (
    <>
      <ProductPage initialStoryBlocks={storyBlocks} />
      <script
        type="application/ld+json"
        // undefined fields are omitted by JSON.stringify
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
    </>
  );
}
