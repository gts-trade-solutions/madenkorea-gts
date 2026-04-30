export type HomeProductVideo = {
  id: string;
  title: string;
  description: string | null;
  page_scope: string;
  position: number;

  video_path: string | null;
  video_url: string | null;
  thumbnail_path: string | null;
  thumbnail_url: string | null;

  product_id: string | null;
  product_slug: string | null;
  product_name: string | null;
  price: number | null;
  currency: string | null;

  created_at: string;
  updated_at: string;
};
