"use client";

import { useMemo, useState } from "react";
import type { HomeProductVideo } from "@/types/home_product_videos";
import { VideoReel } from "./VideoReel";
import { VideoPlayerModal, type VideoModalItem } from "./VideoPlayerModal";

interface Props {
  videos?: HomeProductVideo[];
}

export function ProductVideoCarousel({ videos = [] }: Props) {
  const items = useMemo(() => videos.filter((v) => !!v.video_url), [videos]);

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const modalItems: VideoModalItem[] = useMemo(
    () =>
      items.map((v) => ({
        id: v.id,
        video_url: v.video_url ?? "",
        thumbnail_url: v.thumbnail_url,
        caption: v.description ?? null,
        externalLink: null,
        externalLinkLabel: null,
        products: v.products ?? [],
      })),
    [items]
  );

  return (
    <>
      <VideoReel
        heading="한국 최고 상품을 드려요! - KOREA'S BEST FOR YOU"
        subheading="Watch and discover the best Consumer Innovations products in action"
        items={items}
        onCardClick={(idx) => setOpenIndex(idx)}
        paused={openIndex !== null}
        renderOverlay={(v) =>
          v.description ? (
            <div className="absolute inset-x-0 bottom-0 z-10 p-4 text-white pointer-events-none">
              <div
                className="absolute inset-0 -z-10"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0) 100%)",
                }}
              />
              <p className="text-xs text-white/85 line-clamp-1">{v.description}</p>
            </div>
          ) : null
        }
      />

      <VideoPlayerModal
        open={openIndex !== null}
        items={modalItems}
        startIndex={openIndex ?? 0}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
