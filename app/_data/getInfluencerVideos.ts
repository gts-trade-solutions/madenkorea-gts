import { createClient } from '@supabase/supabase-js';
import type { InfluencerVideo } from '@/types/influencer_video';

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function getInfluencerVideos(pageScope = 'home', limit = 12): Promise<InfluencerVideo[]> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from('home_influencer_videos_live')
    .select('*')
    .eq('page_scope', pageScope)
    .order('position', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[hiv_live] fetch error:', error.message);
    return [];
  }

  const rows = (data ?? []) as InfluencerVideo[];
  // video-only UI: keep only playable items
  return rows.filter((r) => !!r.video_url);
}
