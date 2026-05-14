// app/_data/getBanners.ts
import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import type { Banner } from '@/types/banner';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const FALLBACK_COUNTRY = 'IN';

type BannerRow = {
  id: string;
  alt: string;
  image_path: string | null;
  video_url: string | null;
  link_url: string | null;
  position: number;
  page_scope: string;
  active: boolean;
  updated_at: string | null;
  country: string;
};

// Underlying fetcher. Strict country targeting with India fallback:
//   1. Query banners where country = <visitor country>
//   2. If empty AND visitor's country isn't already 'IN', requery
//      with country = 'IN'.
//
// This mirrors the user-stated rule: each banner is authored for a
// single country, and when there's nothing for the visitor's region
// the storefront shows the Indian (default-market) set instead of a
// blank carousel.
//
// Wrapped below with unstable_cache so cache invalidation via the
// 'banners' tag (the admin save handler revalidates) still works.
// The cache key naturally includes the (scope, country) tuple
// because unstable_cache hashes its arguments.
async function fetchBanners(scope: string, country: string): Promise<Banner[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function query(targetCountry: string) {
    return supabase
      .from('home_banners_live')
      .select(
        'id, alt, image_path, video_url, link_url, position, page_scope, active, updated_at, country'
      )
      .eq('page_scope', scope)
      .eq('country', targetCountry)
      .order('position', { ascending: true });
  }

  let { data, error } = await query(country);
  if (error) {
    console.error('getBanners error:', error);
    return [];
  }

  // Strict fallback: if the visitor's country has no banners and
  // they're not already on IN, retry with the default market. A
  // blank hero on a region that hasn't been customised yet is much
  // worse UX than seeing the India catalogue.
  if ((data ?? []).length === 0 && country !== FALLBACK_COUNTRY) {
    const fallback = await query(FALLBACK_COUNTRY);
    if (fallback.error) {
      console.error('getBanners fallback error:', fallback.error);
      return [];
    }
    data = fallback.data;
  }

  // Append ?v={updated_at} so the public image URL changes whenever the
  // row changes. Same storage path keeps the file, but the URL string
  // becomes a new cache key for browsers and CDNs — fixes "old banner
  // image still showing after I uploaded a new one" caused by long
  // Cache-Control TTLs on Supabase Storage public objects.
  const toPublicUrl = (path: string | null | undefined, version: string | null) => {
    if (!path) return undefined;
    const base = supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
    if (!base) return undefined;
    if (!version) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}v=${encodeURIComponent(version)}`;
  };

  return (data ?? []).map((row: BannerRow) => ({
    id: row.id,
    alt: row.alt,
    link_url: row.link_url ?? undefined,
    position: row.position ?? 0,
    page_scope: row.page_scope ?? 'home',
    active: !!row.active,
    image: toPublicUrl(row.image_path, row.updated_at),
    video_url: row.video_url ?? undefined,
  }));
}

export const getBanners = unstable_cache(
  async (scope: string = 'home', country: string = FALLBACK_COUNTRY) =>
    fetchBanners(scope, country),
  ['banners-by-scope-country'],
  { tags: ['banners'] }
);
