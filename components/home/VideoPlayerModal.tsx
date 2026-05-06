"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ExternalLink, Volume2, VolumeX, X } from "lucide-react";
import { CompactProductCard } from "@/components/CompactProductCard";
import type { AttachedProduct } from "@/types/attached_product";

// Normalized shape both carousels feed into the modal. Whatever extra fields
// each carousel cares about (caption vs description, instagram link, etc.)
// land in `meta` for the overlay renderer.
export type VideoModalItem = {
  id: string | number;
  video_url: string;
  thumbnail_url?: string | null;
  caption?: string | null;
  externalLink?: string | null;
  externalLinkLabel?: string | null;
  products?: AttachedProduct[];
};

type Props = {
  open: boolean;
  items: VideoModalItem[];
  startIndex: number;
  onClose: () => void;
};

export function VideoPlayerModal({ open, items, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef<number | null>(null);

  // Re-seat the index whenever the modal is opened. Closing leaves the
  // last-watched index untouched; that's fine since startIndex re-syncs on
  // the next open.
  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  const safeLen = Math.max(items.length, 1);
  const goPrev = useCallback(() => setIndex((i) => (i - 1 + safeLen) % safeLen), [safeLen]);
  const goNext = useCallback(() => setIndex((i) => (i + 1) % safeLen), [safeLen]);

  // Keyboard nav while modal is open. Esc is handled by Dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext]);

  // When the index changes, sync mute preference to the new <video> element.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = isMuted;
    // Browsers gate autoplay on muted state; if the user explicitly unmuted,
    // play() may still reject. Catch silently and rely on the unmute toggle.
    el.play().catch(() => {});
  }, [index, isMuted, open]);

  // Touch swipe nav: 60px threshold left/right.
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (Math.abs(dx) > 60) {
      if (dx > 0) goPrev();
      else goNext();
    }
    touchStartX.current = null;
  };

  if (!items.length) return null;

  const current = items[Math.min(index, items.length - 1)];
  const products = current.products ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        // Mobile: full-screen, edge-to-edge, no rounding (Reels/TikTok
        // pattern).
        //
        // Desktop (sm:+): modal width is *explicitly fixed* to the video's
        // natural width — `calc(75vh * 9 / 16)` (= video height × inverse
        // aspect). With `w-auto` the modal would size to its widest child,
        // which means a wide product strip pushes the modal wider than
        // the video, leaving black bars on the right. Hard-pinning the
        // width here keeps the modal exactly the video's width, and the
        // strip scrolls horizontally within it. `sm:max-w-[95vw]` is a
        // safety cap for unusual viewport ratios.
        //
        // The trailing `[&>button]:hidden` selector hides shadcn's default
        // close button (no backdrop, invisible on dark frames) — we
        // render our own with a visible chip below.
        className="
          w-screen max-w-none h-[100dvh] max-h-[100dvh] rounded-none border-0
          sm:w-[calc(75vh*9/16)] sm:max-w-[95vw] sm:h-auto sm:max-h-[95vh] sm:rounded-lg
          p-0 gap-0 bg-background flex flex-col overflow-hidden
          [&>button]:hidden
        "
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Video stage. Mobile: flex-fills available height (so the video
            takes ~all the screen above the product strip). Desktop:
            fixed height drives width via aspect-[9/16].
            Counter, close, and mute live as floating overlays on the
            video with dark backdrops so they stay visible on any frame. */}
        <div className="relative bg-black flex-1 min-h-0 sm:flex-initial sm:shrink-0">
          <video
            key={current.id}
            ref={videoRef}
            src={current.video_url}
            poster={current.thumbnail_url ?? undefined}
            className="block h-full w-full object-contain sm:h-[75vh] sm:w-auto sm:aspect-[9/16]"
            autoPlay
            loop
            playsInline
            muted={isMuted}
            controls={false}
            preload="metadata"
            disablePictureInPicture
            controlsList="nodownload noplaybackrate"
          />

          {/* Counter chip — top-left. */}
          <div className="absolute left-3 top-3 z-20 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white tabular-nums backdrop-blur-sm">
            {index + 1} / {items.length}
          </div>

          {/* Custom close — top-right. Replaces shadcn's hidden default. */}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-20 h-9 w-9 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm border-0"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Mute — top-right, stacked below close. */}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => setIsMuted((m) => !m)}
            aria-label={isMuted ? "Unmute" : "Mute"}
            className="absolute right-3 top-14 z-20 h-9 w-9 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm border-0"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>

          {/* Caption + external link, bottom-left overlay. */}
          {(current.caption || current.externalLink) && (
            <div className="absolute bottom-0 left-0 right-0 z-10 p-4 text-white">
              <div
                className="absolute inset-0 -z-10 pointer-events-none"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0) 100%)",
                }}
              />
              {current.caption && (
                <p className="text-sm text-white/90 line-clamp-2 mb-2">{current.caption}</p>
              )}
              {current.externalLink && (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(current.externalLink!, "_blank", "noopener,noreferrer");
                  }}
                >
                  <ExternalLink className="mr-1 h-4 w-4" />
                  {current.externalLinkLabel ?? "View post"}
                </Button>
              )}
            </div>
          )}

          {/* Prev / Next chevrons — overlay the video edges with dark
              backdrops since there's no longer side-bar space. */}
          {items.length > 1 && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={goPrev}
                aria-label="Previous video"
                className="absolute left-2 top-1/2 z-20 h-10 w-10 -translate-y-1/2 rounded-full bg-black/55 text-white hover:bg-black/75 backdrop-blur-sm border-0"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={goNext}
                aria-label="Next video"
                className="absolute right-2 top-1/2 z-20 h-10 w-10 -translate-y-1/2 rounded-full bg-black/55 text-white hover:bg-black/75 backdrop-blur-sm border-0"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>

        {/* Attached products. Compact horizontal cards so the strip stays
            short (~110px) and the modal fits inside 95vh on every device
            without internal scroll. Single product → one centered card.
            Multiple → horizontal scroll-snap row. */}
        {products.length > 0 && (
          // `min-w-0 overflow-hidden` is critical: in a flex-column whose
          // width is `auto`, the column sizes itself to the widest child's
          // intrinsic min-content width. Multiple product cards in the
          // inner scroller would push the modal wider than the video,
          // creating black bars to the right of the video. Setting
          // min-w-0 on this strip removes its intrinsic width from the
          // calculation, so the modal's width is set by the video alone;
          // align-items:stretch then sizes this strip to that width, and
          // the inner overflow-x-auto handles its own scroll.
          <div className="shrink-0 border-t bg-background px-3 py-2 sm:p-4 min-w-0 w-full overflow-hidden">
            <p className="mb-1.5 sm:mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Featured {products.length === 1 ? "product" : "products"}
            </p>

            {products.length === 1 ? (
              <div className="w-full">
                <CompactProductCard
                  product={{
                    ...products[0],
                    hero_image_path: products[0].hero_image_path ?? undefined,
                  }}
                />
              </div>
            ) : (
              <div
                className="
                  flex gap-2 overflow-x-auto scrollbar-hide
                  snap-x snap-mandatory pb-1
                  [scrollbar-width:none] [-ms-overflow-style:none]
                "
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {products.map((p) => (
                  <div
                    key={p.id}
                    // Mobile: full-screen modal, more horizontal room — show
                    // ~1.6 cards visible (peek of the next) so the user
                    // sees scroll affordance.
                    // Desktop: narrower modal (= video width), reduce basis
                    // accordingly.
                    className="shrink-0 snap-start basis-[58%] sm:basis-[220px]"
                  >
                    <CompactProductCard
                      product={{
                        ...p,
                        hero_image_path: p.hero_image_path ?? undefined,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
