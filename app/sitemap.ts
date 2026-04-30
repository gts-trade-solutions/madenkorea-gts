// app/sitemap.ts
import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://madenkorea.com').replace(/\/$/, '');

// Rebuild at most once per hour
export const revalidate = 60 * 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Supabase server client (safe on server files)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // --- Fetch dynamic content (tweak to your tables/columns) ---
  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('slug, updated_at, created_at, is_published')
      .eq('is_published', true),
    supabase
      .from('categories')
      .select('slug, updated_at, created_at, is_visible')
      .or('is_visible.is.null,is_visible.eq.true'),
  ]);

  // --- Static core routes (add/remove as needed) ---
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    // add /contact, /returns, etc.
  ];

  // --- Category routes (adjust prefix if yours differs) ---
  const categoryRoutes: MetadataRoute.Sitemap =
    (categories ?? []).map((c) => ({
      url: `${SITE}/c/${c.slug}`,             // or `/category/${c.slug}`
      lastModified: new Date(c.updated_at ?? c.created_at ?? Date.now()),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  // --- Product routes ---
  const productRoutes: MetadataRoute.Sitemap =
    (products ?? []).map((p) => ({
      url: `${SITE}/products/${p.slug}`,
      lastModified: new Date(p.updated_at ?? p.created_at ?? Date.now()),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
