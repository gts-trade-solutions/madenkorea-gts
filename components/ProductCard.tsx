"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Check, Heart, ShoppingCart, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/lib/contexts/CartContext";
import { useWishlist } from "@/lib/contexts/WishlistContext";
import { toast } from "sonner";

type ProductForCard = {
  id: string;
  slug: string;
  name: string;

  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;

  is_featured?: boolean | null;
  is_trending?: boolean | null;
  is_bundle?: boolean | null;
  new_until?: string | null;

  hero_image_url?: string | null;
  hero_image_path?: string | null;

  brand_name?: string | null;
  brand?: { name?: string | null } | null;
  brands?: { name?: string | null } | null;
  rating_avg?: number | null;
  rating_count?: number | null;

  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  stock_qty?: number | null;

  inventory?: { qty?: number; low_stock_threshold?: number } | null;
};

interface ProductCardProps {
  product: ProductForCard;
  // Suppress the entire badge stack (discount, stock, marketing badges).
  // Use on dense surfaces where badges add visual noise — e.g. the
  // VideoPlayerModal's "Featured products" strip, where the user is
  // already focused on a specific video and just wants product names.
  hideBadges?: boolean;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function currencyINR(value?: number | null, code?: string | null) {
  if (value == null) return "";
  const c = (code ?? "INR").toUpperCase();
  if (c === "INR") return `₹${value.toLocaleString("en-IN")}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
    }).format(value);
  } catch {
    return `${c} ${value.toLocaleString()}`;
  }
}

function saleWindowActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function tinyDate(d?: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(+dt)) return "";
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProductCard({ product, hideBadges = false }: ProductCardProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();

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

  const brandName = useMemo(
    () =>
      product.brand_name ?? product.brand?.name ?? product.brands?.name ?? null,
    [product.brand_name, product.brand, product.brands]
  );

  const saleActive = useMemo(() => {
    if (product.sale_price == null) return false;
    return saleWindowActive(
      product.sale_starts_at ?? null,
      product.sale_ends_at ?? null
    );
  }, [product.sale_price, product.sale_starts_at, product.sale_ends_at]);

  const effectivePrice = useMemo(
    () =>
      saleActive && product.sale_price != null
        ? product.sale_price
        : product.price ?? null,
    [saleActive, product.sale_price, product.price]
  );

  const discountPct = useMemo(() => {
    if (product.compare_at_price && effectivePrice != null) {
      const pct = Math.round(
        (1 - effectivePrice / product.compare_at_price) * 100
      );
      return pct > 0 ? pct : 0;
    }
    return 0;
  }, [effectivePrice, product.compare_at_price]);

  const saveAmount =
    discountPct > 0 && product.compare_at_price && effectivePrice != null
      ? product.compare_at_price - effectivePrice
      : 0;

  const isNew = useMemo(() => {
    if (!product.new_until) return false;
    const d = new Date(product.new_until);
    return !Number.isNaN(+d) && new Date() <= d;
  }, [product.new_until]);

  const stockQty = product.stock_qty ?? product.inventory?.qty ?? null;
  const isOut = stockQty != null ? stockQty <= 0 : false;
  const isLow =
    stockQty != null &&
    stockQty > 0 &&
    !!product.inventory?.low_stock_threshold &&
    stockQty <=
      (product.inventory?.low_stock_threshold ?? 0) &&
    !isOut;

  const detailsLine = useMemo(() => {
    const bits: string[] = [];
    if (product.volume_ml != null) bits.push(`${+product.volume_ml} ml`);
    if (product.net_weight_g != null) bits.push(`${+product.net_weight_g} g`);
    if (product.country_of_origin) bits.push(product.country_of_origin);
    return bits.join(" · ");
  }, [product.volume_ml, product.net_weight_g, product.country_of_origin]);

  const [justAdded, setJustAdded] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const inWishlist = isInWishlist(product.id);

  const onAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isOut || isAddingToCart) return;
    try {
      setIsAddingToCart(true);
      await addItem(product.id, 1);
      setJustAdded(true);
      toast.success("Added to cart", { description: product.name });
      setTimeout(() => setJustAdded(false), 1500);
    } catch (error) {
      console.error("Add to cart error:", error);
      toast.error("Could not add item to cart right now.");
    } finally {
      setIsAddingToCart(false);
    }
  };

  const onBuyNow = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isOut || isBuyingNow) return;
    try {
      setIsBuyingNow(true);
      await addItem(product.id, 1);
      router.push("/checkout");
    } catch (error) {
      console.error("Buy now error:", error);
      toast.error("Unable to proceed to checkout right now.");
    } finally {
      setIsBuyingNow(false);
    }
  };

  const onWishlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleWishlist(product.id);
    toast.success(inWishlist ? "Removed from wishlist" : "Added to wishlist");
  };

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex h-full flex-col"
      prefetch={false}
    >
      
        <div className="relative aspect-square overflow-hidden rounded-xl bg-muted mb-3">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={false}
            />
          ) : (
            <div className="h-full w-full animate-pulse bg-muted" />
          )}

          {/* Badge stack. On mobile we keep the informational badges
              (discount + stock state) at compact sizing AND show at
              most ONE marketing badge — picked by priority `New >
              Trending > Featured` so the most time-sensitive /
              behavioural signal wins. On sm:+ we show all marketing
              badges since there's room. */}
          {!hideBadges && (() => {
            // Bundle wins priority on mobile because it's a category, not just a
            // marketing flag — users browsing a grid need to know "this is a set,
            // not a single item" at a glance.
            const mobileMarketingBadge = product.is_bundle
              ? "Bundle"
              : isNew
              ? "New"
              : product.is_trending
                ? "Trending"
                : product.is_featured
                  ? "Featured"
                  : null;
            return (
              <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
                {discountPct > 0 && (
                  <Badge
                    variant="destructive"
                    className="px-1.5 py-0 text-[10px] sm:px-2.5 sm:py-0.5 sm:text-xs"
                  >
                    {discountPct}% OFF
                  </Badge>
                )}
                {isOut && (
                  <Badge
                    variant="secondary"
                    className="px-1.5 py-0 text-[10px] sm:px-2.5 sm:py-0.5 sm:text-xs"
                  >
                    Out of stock
                  </Badge>
                )}
                {!isOut && isLow && (
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 text-[10px] sm:px-2.5 sm:py-0.5 sm:text-xs"
                  >
                    Low stock
                  </Badge>
                )}

                {/* Mobile: at most one marketing badge, compact */}
                {mobileMarketingBadge && (
                  <Badge className="px-1.5 py-0 text-[10px] sm:hidden">
                    {mobileMarketingBadge}
                  </Badge>
                )}

                {/* Tablet+: full marketing badge stack */}
                {product.is_bundle && (
                  <Badge className="hidden sm:inline-flex">Bundle</Badge>
                )}
                {product.is_featured && (
                  <Badge className="hidden sm:inline-flex">Featured</Badge>
                )}
                {product.is_trending && (
                  <Badge className="hidden sm:inline-flex">Trending</Badge>
                )}
                {isNew && (
                  <Badge className="hidden sm:inline-flex">New</Badge>
                )}
              </div>
            );
          })()}

          <div className="absolute top-2 right-2 z-10">
            <button
              type="button"
              onClick={onWishlistToggle}
              aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
              className="inline-flex items-center justify-center rounded-full h-8 w-8 sm:h-10 sm:w-10 bg-background/70 backdrop-blur-sm shadow-sm hover:bg-background sm:bg-secondary sm:hover:bg-secondary/80 transition-colors"
            >
              <Heart
                className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
                  inWishlist ? "fill-current text-red-500" : ""
                }`}
              />
            </button>
          </div>

          <div className="absolute bottom-2 right-2 hidden sm:block opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              size="icon"
              onClick={onAddToCart}
              disabled={!!isOut || isAddingToCart}
              aria-label="Add to cart"
            >
              {justAdded ? (
                <Check className="h-4 w-4" />
              ) : (
                <ShoppingCart className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Card body fills remaining grid-cell height. Title is forced
            to two lines so all cards in a row align regardless of name
            length. The price + CTA block uses `mt-auto` so it always
            sits flush with the bottom of the card — adjacent cards
            with longer or shorter copy still have their prices
            horizontally aligned. */}
        <div className="flex flex-1 flex-col space-y-1">
          {brandName && (
            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
              {brandName}
            </p>
          )}

          {/* Always reserve 2 lines worth of height so 1-line and
              2-line product names produce identical card heights.
              `leading-snug` locks line-height at 1.375 so the math is
              predictable across browsers. 2 lines × 1.375 = 2.75em. */}
          <h3 className="font-medium transition-colors group-hover:text-primary line-clamp-2 break-words leading-snug h-[2.75em]">
            {product.name}
          </h3>

          {detailsLine ? (
            <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1">
              {detailsLine}
            </p>
          ) : product.short_description ? (
            <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1">
              {product.short_description}
            </p>
          ) : null}

          {/* On mobile, content flows naturally — the price sits
              directly under the description with no dead space, since
              vertical scrolling doesn't benefit from cross-card price
              alignment. On sm:+ we anchor this block to the bottom
              with mt-auto so prices line up across the desktop grid. */}
          <div className="space-y-1 pt-2 sm:mt-auto">
          {typeof product.rating_avg === "number" && (
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium">
                {product.rating_avg.toFixed(1)}
              </span>
              {typeof product.rating_count === "number" && (
                <span className="text-xs sm:text-sm text-muted-foreground">
                  ({product.rating_count})
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-base sm:text-lg font-bold">
              {currencyINR(effectivePrice, product.currency)}
            </span>

            {product.compare_at_price != null &&
              effectivePrice != null &&
              product.compare_at_price > effectivePrice && (
                <span className="text-xs sm:text-sm text-muted-foreground line-through">
                  {currencyINR(product.compare_at_price, product.currency)}
                </span>
              )}

            {discountPct > 0 && saveAmount > 0 && (
              <span className="text-[11px] font-medium rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                Save {currencyINR(saveAmount, product.currency)} ({discountPct}%
                OFF)
              </span>
            )}

            {/* {saleActive && product.sale_ends_at && (
              <span className="ml-auto text-[11px] text-orange-600">
                Ends {tinyDate(product.sale_ends_at)}
              </span>
            )} */}
          </div>

          <div className="sm:hidden pt-2">
            <Button
              className="w-full"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                onBuyNow(e);
              }}
              disabled={!!isOut || isBuyingNow}
            >
              {isBuyingNow ? (
                "Processing..."
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-4 w-4" /> Buy now
                </>
              )}
            </Button>
          </div>
          </div>{/* end mt-auto bottom block */}
      </div>
    </Link>
  );
}

export default ProductCard;
