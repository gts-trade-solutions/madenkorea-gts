"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

// Compact horizontal product card used inside the VideoPlayerModal's
// "Featured products" strip. Deliberately strips out the standard
// ProductCard's badges, brand line, details, and Add-to-Cart / Buy-Now
// buttons — the user is in a video-watching context and just wants a
// glanceable thumb + name + price. Whole row is one big clickable Link
// to the PDP, where the full purchase flow lives.

type CompactProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  hero_image_url?: string | null;
  hero_image_path?: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function saleWindowActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function CompactProductCard({ product }: { product: CompactProduct }) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    product.hero_image_url ?? null
  );
  useEffect(() => {
    if (!imageUrl && product.hero_image_path) {
      const { data } = supabase.storage
        .from("product-media")
        .getPublicUrl(product.hero_image_path);
      setImageUrl(data.publicUrl ?? null);
    }
  }, [imageUrl, product.hero_image_path]);

  const saleActive = useMemo(
    () =>
      product.sale_price != null &&
      saleWindowActive(product.sale_starts_at ?? null, product.sale_ends_at ?? null),
    [product.sale_price, product.sale_starts_at, product.sale_ends_at]
  );

  const effectivePrice =
    saleActive && product.sale_price != null ? product.sale_price : product.price ?? null;
  // Strikethrough comparator: prefer compare_at_price; otherwise the
  // original price when there's an active sale at sale_price.
  const strikePrice =
    saleActive && product.sale_price != null && product.price != null && product.price > product.sale_price
      ? product.price
      : product.compare_at_price && effectivePrice != null && product.compare_at_price > effectivePrice
        ? product.compare_at_price
        : null;

  return (
    <Link
      href={`/products/${product.slug}`}
      prefetch={false}
      className="flex items-center gap-3 rounded-lg border bg-background p-2 hover:bg-muted/50 transition-colors min-w-0"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.name}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm leading-tight line-clamp-2">{product.name}</p>
        <div className="mt-1 flex items-baseline gap-2">
          {effectivePrice != null && (
            <span className="text-sm font-semibold">{formatINR(effectivePrice)}</span>
          )}
          {strikePrice != null && (
            <span className="text-xs text-muted-foreground line-through">
              {formatINR(strikePrice)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
