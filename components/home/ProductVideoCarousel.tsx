/* eslint-disable react/no-unescaped-entities */
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeProductVideo } from "@/types/home_product_videos";

interface ProductVideoCarouselProps {
  videos?: HomeProductVideo[];
}

export function ProductVideoCarousel({ videos = [] }: ProductVideoCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [slidesPerView, setSlidesPerView] = useState(6);
  const [currentPage, setCurrentPage] = useState(0);

  // ✅ the single "active" video id (ONLY this one can play)
  const [activeId, setActiveId] = useState<string | number | null>(null);

  // keep only playable
  const items = useMemo(() => videos.filter((v) => !!v.video_url), [videos]);
  if (!Array.isArray(items) || items.length === 0) return null;

  // set starting video active (ONLY this should autoplay)
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
    const el = scrollContainerRef.current;
    if (!el) return slidesPerView;
    const val = getComputedStyle(el).getPropertyValue("--slides").trim();
    const n = parseInt(val || "6", 10);
    return Number.isFinite(n) && n > 0 ? n : slidesPerView;
  };

  const getStep = () => {
    const el = scrollContainerRef.current;
    if (!el) return 0;
    const firstCard = el.querySelector<HTMLElement>('[data-card="true"]');
    if (!firstCard) return 0;
    const gap = parseFloat(getComputedStyle(el).gap || "0") || 0;
    return Math.round(firstCard.getBoundingClientRect().width + gap);
  };

  const alignToSnap = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const s = getStep();
    if (!s) return;
    const idx = Math.round(el.scrollLeft / s);
    el.scrollLeft = idx * s;
  };

  const totalPages = Math.max(1, Math.ceil(items.length / Math.max(1, slidesPerView)));

  // ✅ find the "most centered" card and make it active (so only it plays)
  const setActiveFromScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const s = getStep();
    if (!s) return;

    // index of nearest card based on scrollLeft
    const idxRaw = Math.round(el.scrollLeft / s); // includes clones
    const normalized = ((idxRaw % items.length) + items.length) % items.length;

    const newActive = items[normalized]?.id ?? null;
    if (newActive != null) setActiveId(newActive);

    // update page dots
    const spv = readSlidesFromCSSVar();
    const page = Math.floor(normalized / Math.max(1, spv));
    setCurrentPage(Math.min(totalPages - 1, Math.max(0, page)));
  }, [items, totalPages]);

  // autoplay (advance by 1 card every 4s, then snap & handle loop)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const syncSpv = () => setSlidesPerView(readSlidesFromCSSVar());
    syncSpv();

    alignToSnap();
    setActiveFromScroll();

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
        setActiveFromScroll();
      }, 450) as unknown as number;
    };

    tickTimer = window.setInterval(tick, 4000) as unknown as number;

    const onScroll = () => {
      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half - 2) el.scrollLeft = el.scrollLeft - half;
      setActiveFromScroll();
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    const onResize = () => {
      syncSpv();
      requestAnimationFrame(() => {
        alignToSnap();
        setActiveFromScroll();
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (tickTimer) window.clearInterval(tickTimer);
      if (afterScrollTimer) window.clearTimeout(afterScrollTimer);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [isPaused, setActiveFromScroll]);

  const goToPage = (pageIndex: number) => {
    const el = scrollContainerRef.current;
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
      setActiveFromScroll(); // ✅ sets activeId too
      setIsPaused(false);
    }, 500);
  };

  return (
    <section className="relative">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">한국 최고 상품을 드려요! - KOREA'S BEST FOR YOU</h1>
        <p className="text-muted-foreground">
          Watch and discover the best Consumer Innovations products in action
        </p>
      </div>

      <div
        className="relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div
          ref={scrollContainerRef}
          className="
            flex overflow-x-auto scrollbar-hide
            snap-x snap-mandatory [scroll-snap-stop:always]
            [--slide-gap:1rem] gap-[var(--slide-gap)]
            [--slides:2] md:[--slides:3] lg:[--slides:4] xl:[--slides:5] 2xl:[--slides:6]
            [scrollbar-width:none] [-ms-overflow-style:none]
          "
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {loopItems.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
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
  video: HomeProductVideo;
  activeId: string | number | null;
  onRequestActive: (id: string | number) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  // ✅ inView controls whether we even mount the <video> tag (lazy)
  const [inView, setInView] = useState(false);

  const isActive = activeId != null && activeId === video.id;

  // Observe card visibility (not the video element), so we can lazy-mount video
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // start loading slightly before fully visible
        setInView(entry.isIntersecting);
      },
      { root: null, threshold: 0.25, rootMargin: "200px" }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ✅ enforce: only active + inView plays, all others paused
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const shouldPlay = isActive && inView;

    if (shouldPlay) {
      el.muted = isMuted;
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else {
      el.pause();
      // optional: rewind inactive videos to first frame
      // el.currentTime = 0;
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

  // clicking a card makes it active (and thus pauses all others)
  const onCardClick = () => {
    onRequestActive(video.id);

    // if already active, toggle play/pause
    const el = videoRef.current;
    if (!el) return;

    if (!inView) return;

    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
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
        {/* ✅ Poster (optimized) */}
        {!!video.thumbnail_url && (
          <Image
            src={video.thumbnail_url}
            alt={video.title ?? "Video thumbnail"}
            fill
            className={[
              "object-cover transition-opacity duration-300",
              videoReady ? "opacity-0" : "opacity-100",
            ].join(" ")}
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 16vw"
            priority={false}
          />
        )}

        {/* ✅ Lazy mount the <video> only when near viewport OR active */}
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
            // optional: reduce UI features
            controls={false}
            disablePictureInPicture
            controlsList="nodownload noplaybackrate"
          >
            <source src={video.video_url ?? ""} type="video/mp4" />
          </video>
        )}

        <div className="home-media-gradient-overlay absolute inset-0 z-10 pointer-events-none" />

        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 text-white">
          {video.description && (
            <p className="text-xs text-white/80 mb-2 line-clamp-1">{video.description}</p>
          )}
        </div>

        {/* ✅ show mute button only when hovered and active */}
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

        {/* ✅ subtle active indicator (optional) */}
        <div
            className={[
            "absolute inset-0 z-20 ring-2 ring-white/0 transition",
            isActive ? "ring-white/40" : "ring-transparent",
          ].join(" ")}
        />
      </div>
    </div>
  );
}
