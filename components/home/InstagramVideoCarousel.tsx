"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InfluencerVideo } from "@/types/influencer_video";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, ExternalLink } from "lucide-react";

export function InstagramVideoCarousel({ videos }: { videos: InfluencerVideo[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [slidesPerView, setSlidesPerView] = useState(6);
  const [currentPage, setCurrentPage] = useState(0);

  // ✅ single active video (ONLY this one can play)
  const [activeId, setActiveId] = useState<string | number | null>(null);

  const items = useMemo(() => (videos ?? []).filter((v) => !!v.video_url), [videos]);
  if (!items.length) return null;

  // starting active video
  useEffect(() => {
    if (activeId == null && items.length > 0) setActiveId(items[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // duplicate once for seamless loop
  const loopItems = useMemo(
    () => [...items, ...items.map((v, i) => ({ ...v, id: `${v.id}-dup-${i}` }))],
    [items]
  );

  const readSlidesFromCSSVar = () => {
    const el = scrollRef.current;
    if (!el) return slidesPerView;
    const val = getComputedStyle(el).getPropertyValue("--slides").trim();
    const n = parseInt(val || "6", 10);
    return Number.isFinite(n) && n > 0 ? n : slidesPerView;
  };

  // width of one card + gap
  const getStep = () => {
    const el = scrollRef.current;
    if (!el) return 0;
    const firstCard = el.querySelector<HTMLElement>('[data-card="true"]');
    if (!firstCard) return 0;
    const gap = parseFloat(getComputedStyle(el).gap || "0") || 0;
    return Math.round(firstCard.getBoundingClientRect().width + gap);
  };

  const alignToSnap = () => {
    const el = scrollRef.current;
    if (!el) return;
    const s = getStep();
    if (!s) return;
    const idx = Math.round(el.scrollLeft / s);
    el.scrollLeft = idx * s;
  };

  const totalPages = Math.max(1, Math.ceil(items.length / Math.max(1, slidesPerView)));

  // ✅ compute page + set active id based on scroll position
  const computeFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const s = getStep();
    if (!s) return;

    const idxRaw = Math.round(el.scrollLeft / s); // includes clones
    const idx = ((idxRaw % items.length) + items.length) % items.length; // normalize to original set

    // set the active (only it can play)
    const newActive = items[idx]?.id ?? null;
    if (newActive != null) setActiveId(newActive);

    const spv = readSlidesFromCSSVar();
    const page = Math.floor(idx / Math.max(1, spv));
    setCurrentPage(Math.min(totalPages - 1, Math.max(0, page)));
  }, [items, totalPages]);

  // autoplay + seamless loop + responsive syncing
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const syncSpv = () => setSlidesPerView(readSlidesFromCSSVar());
    syncSpv();

    alignToSnap();
    computeFromScroll();

    let tickTimer: number | null = null;
    let afterScrollTimer: number | null = null;

    const tick = () => {
      if (isPaused) return;
      const s = getStep();
      if (!s) return;

      const curIdx = Math.round(el.scrollLeft / s);
      const targetLeft = (curIdx + 1) * s;
      el.scrollTo({ left: targetLeft, behavior: "smooth" });

      if (afterScrollTimer) window.clearTimeout(afterScrollTimer);
      afterScrollTimer = window.setTimeout(() => {
        const half = el.scrollWidth / 2;
        if (el.scrollLeft >= half - s / 2) {
          el.scrollLeft = el.scrollLeft - half;
        }
        alignToSnap();
        computeFromScroll();
      }, 450) as unknown as number;
    };

    tickTimer = window.setInterval(tick, 4000) as unknown as number;

    const onScroll = () => {
      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half - 2) el.scrollLeft = el.scrollLeft - half;
      computeFromScroll();
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const onResize = () => {
      syncSpv();
      requestAnimationFrame(() => {
        alignToSnap();
        computeFromScroll();
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (tickTimer) window.clearInterval(tickTimer);
      if (afterScrollTimer) window.clearTimeout(afterScrollTimer);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [isPaused, computeFromScroll]);

  const goToPage = (pageIndex: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const s = getStep();
    const spv = readSlidesFromCSSVar();
    if (!s || !spv) return;

    const half = el.scrollWidth / 2;
    const pageWidth = s * spv;
    const targetInFirst = pageIndex * pageWidth;
    const targetInSecond = targetInFirst + half;
    const cur = el.scrollLeft;
    const target =
      Math.abs(cur - targetInFirst) <= Math.abs(cur - targetInSecond)
        ? targetInFirst
        : targetInSecond;

    setIsPaused(true);
    el.scrollTo({ left: target, behavior: "smooth" });

    window.setTimeout(() => {
      alignToSnap();
      computeFromScroll();
      setIsPaused(false);
    }, 500);
  };

  return (
    <section className="relative">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Creator Videos</h2>
        <p className="text-muted-foreground">Short clips from influencers and reviewers</p>
      </div>

      <div
        className="relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div
          ref={scrollRef}
          className="
            flex overflow-x-auto scrollbar-hide
            snap-x snap-mandatory [scroll-snap-stop:always]
            [--slide-gap:1rem] gap-[var(--slide-gap)]
            [--slides:2] md:[--slides:3] lg:[--slides:4] xl:[--slides:5] 2xl:[--slides:6]
            [scrollbar-width:none] [-ms-overflow-style:none]
          "
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {loopItems.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              activeId={activeId}
              onRequestActive={(id) => setActiveId(id)}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {Array.from({ length: totalPages }).map((_, i) => {
              const active = i === currentPage;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to page ${i + 1}`}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "h-2 rounded-full transition-all",
                    active ? "w-8 bg-foreground/90" : "w-2 bg-foreground/30 hover:bg-foreground/50",
                  ].join(" ")}
                  onClick={() => goToPage(i)}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function VideoCard({
  video,
  activeId,
  onRequestActive,
}: {
  video: InfluencerVideo;
  activeId: string | number | null;
  onRequestActive: (id: string | number) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  // ✅ only mount video when near/inside viewport
  const [inView, setInView] = useState(false);

  const isActive = activeId != null && activeId === video.id;

  // Observe the card itself (better than observing <video>)
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setInView(entry.isIntersecting);
      },
      { threshold: 0.25, rootMargin: "200px" }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ✅ enforce "only active plays"
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const shouldPlay = isActive && inView;

    if (shouldPlay) {
      el.muted = isMuted;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isActive, inView, isMuted]);

  useEffect(() => {
    if (!inView) setVideoReady(false);
  }, [inView]);

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const onCardClick = () => {
    onRequestActive(video.id);

    const el = videoRef.current;
    if (!el || !inView) return;

    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  return (
    <div
      ref={cardRef}
      data-card="true"
      className="
        shrink-0 snap-start relative group cursor-pointer
        basis-[calc((100%-(var(--slide-gap)*(var(--slides)-1)))/var(--slides))]
        max-w-full
      "
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={onCardClick}
    >
      <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-muted shadow-lg">
        {/* ✅ Optimized thumbnail using next/image */}
        {!!video.thumbnail_url && (
          <Image
            src={video.thumbnail_url}
            alt={video.influencer_name ?? "Influencer video"}
            fill
            className={["object-cover transition-opacity duration-300", videoReady ? "opacity-0" : "opacity-100"].join(
              " "
            )}
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 16vw"
          />
        )}

        {/* ✅ lazy mount video */}
        {(inView || isActive) && (
          <video
            ref={videoRef}
            className="absolute inset-0 z-0 w-full h-full object-cover"
            loop
            muted={isMuted}
            playsInline
            preload="metadata"
            poster={video.thumbnail_url ?? undefined}
            onLoadedData={() => setVideoReady(true)}
            onCanPlay={() => setVideoReady(true)}
            controls={false}
            disablePictureInPicture
            controlsList="nodownload noplaybackrate"
          >
            <source src={video.video_url ?? ""} type="video/mp4" />
          </video>
        )}

        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.18) 44%, rgba(0,0,0,0) 76%)",
          }}
        />

        {/* bottom meta */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 text-white">
          {video.caption && <p className="text-xs text-white/80 mb-2 line-clamp-1">{video.caption}</p>}

          <div className="flex items-center justify-between">
            {video.instagram_link && (
              <Button
                size="sm"
                className="pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(video.instagram_link!, "_blank");
                }}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                View post
              </Button>
            )}
          </div>
        </div>

        {/* mute button (only show on hover; optionally only when active) */}
        {showControls && isActive && (
          <div className="absolute top-4 right-4 z-30 pointer-events-auto">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full shadow-lg backdrop-blur-sm bg-white/90 hover:bg-white h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
