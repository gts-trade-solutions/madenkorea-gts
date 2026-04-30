"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import type { Banner } from "@/types";

interface HeroBannerProps {
  banners: Banner[];
}

export function HeroBanner({ banners }: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  if (banners.length === 0) return null;

  return (
    <div className="relative w-full h-[23vh] md:h-[54vh] lg:h-[66vh] xl:h-[78vh] 2xl:h-[84vh] bg-muted overflow-hidden">
      {banners.map((banner, index) => {
        const isActive = index === currentIndex;
        const isVideo =
          // treat as video if you have a dedicated field OR a file-like URL
          // adjust this check to match your Banner type
          (banner as any).video_url ||
          (/\.mp4$|\.webm$|\.ogg$/i.test(banner.image || "") && !(banner as any).link_url);

        const videoSrc =
          (banner as any).video_url ||
          (/\.(mp4|webm|ogg)$/i.test(banner.image || "") ? banner.image : undefined);

        const poster = banner.image && !videoSrc ? undefined : banner.image || undefined;

        const media = isVideo ? (
          <video
            key={banner.id + (isActive ? "-active" : "-inactive")}
            className="absolute inset-0 w-full h-full object-cover"
            src={videoSrc as string}
            poster={poster}
            // "normal" quality playback; keep light on bandwidth
            preload={isActive ? "metadata" : "none"}
            playsInline
            muted
            loop
            autoPlay={isActive}
            controls={false}
            aria-label={banner.alt || "Promotional video"}
          />
        ) : (
          <Image
            src={banner.image || ""}
            alt={banner.alt}
            fill
            // Serve sharper assets for big screens while staying efficient
            sizes="(min-width: 1536px) 1536px, (min-width: 1280px) 1280px, (min-width: 1024px) 1024px, 100vw"
            quality={95}
            priority={index === 0}
            loading={index === 0 ? "eager" : "lazy"}
            className="object-cover select-none"
            draggable={false}
          />
        );

        // Videos render with `controls={false}` and no native UI, so we can
        // safely overlay a click target without fighting playback controls.
        const slide = (
          <div
            key={banner.id}
            className={`absolute inset-0 transition-opacity duration-500 ${
              isActive ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={!isActive}
          >
            <div className="relative w-full h-full">
              {media}
              {banner.link_url && (
                <Link
                  href={banner.link_url}
                  className="absolute inset-0 z-[1]"
                  prefetch={false}
                  aria-label={banner.alt}
                  tabIndex={isActive ? 0 : -1}
                />
              )}
            </div>
          </div>
        );

        return slide;
      })}

      {banners.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background/90"
            onClick={goToPrevious}
            aria-label="Previous banner"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background/90"
            onClick={goToNext}
            aria-label="Next banner"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {banners.map((_, index) => (
              <button
                key={index}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentIndex ? "bg-white w-8" : "bg-white/50"
                }`}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
