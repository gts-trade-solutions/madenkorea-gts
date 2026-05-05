// app/_data/getBanners.ts
import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import type { Banner } from '@/types/banner';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
};

// Underlying fetcher. Wrapped below with unstable_cache so we can
// invalidate via the 'banners' tag from the admin save handler.
async function fetchBanners(scope: string): Promise<Banner[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data, error } = await supabase
    .from('home_banners_live')
    .select(
      'id, alt, image_path, video_url, link_url, position, page_scope, active, updated_at'
    )
    .eq('page_scope', scope)
    .order('position', { ascending: true });

  if (error) {
    console.error('getBanners error:', error);
    return [];
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
  async (scope: string = 'home') => fetchBanners(scope),
  ['banners-by-scope'],
  { tags: ['banners'] }
);
