// app/_data/getBanners.ts
import { createClient } from '@supabase/supabase-js';
import type { Banner } from '@/types/banner'; // your interface

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
};

export async function getBanners(scope: string = 'home'): Promise<Banner[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data, error } = await supabase
    .from('home_banners_live')
    .select(
      'id, alt, image_path, video_url, link_url, position, page_scope, active'
    )
    .eq('page_scope', scope)
    .order('position', { ascending: true });

  if (error) {
    console.error('getBanners error:', error);
    return [];
  }

  const toPublicUrl = (path?: string | null) =>
    path
      ? supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl
      : undefined;

  return (data ?? []).map((row: BannerRow) => ({
    id: row.id,
    alt: row.alt,
    link_url: row.link_url ?? undefined,
    position: row.position ?? 0,
    page_scope: row.page_scope ?? 'home',
    active: !!row.active,
    image: toPublicUrl(row.image_path),
    video_url: row.video_url ?? undefined,
  }));
}
