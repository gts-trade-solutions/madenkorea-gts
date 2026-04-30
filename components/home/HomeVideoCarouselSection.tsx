import { supabaseRSC } from '@/lib/supabase-rsc';
import { publicURL } from '@/lib/storage-public-url';
import { HomeProductVideo } from '@/types/home_product_videos';
import { ProductVideoCarousel } from '@/components/home/ProductVideoCarousel'; // <-- named import

export const revalidate = 60;

type Props = {
  pageScope?: string;
  limit?: number;
  bucket?: string; // storage bucket containing product-videos/*
};

export default async function HomeVideoCarouselSection({
  pageScope = 'home',
  limit = 8,
  bucket = 'product-media',
}: Props) {
  const sb = supabaseRSC();
  const { data, error } = await sb
    .from('home_product_videos_live')
    .select('*')
    .eq('page_scope', pageScope)
    .order('position', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[hpv] fetch error:', error.message);
    return null;
  }

  const rows = (data ?? []) as HomeProductVideo[];

  // Ensure video_url / thumbnail_url exist by falling back to storage paths
  const videos: HomeProductVideo[] = rows
    .map((v) => ({
      ...v,
      video_url: v.video_url ?? publicURL(bucket, v.video_path) ?? null,
      thumbnail_url: v.thumbnail_url ?? publicURL(bucket, v.thumbnail_path) ?? null,
    }))
    // don’t render rows without a resolvable video url
    .filter((v) => !!v.video_url);

  if (videos.length === 0) return null;

  return <ProductVideoCarousel videos={videos} />;
}
