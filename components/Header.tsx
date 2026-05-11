"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart,
  Search,
  User,
  Menu,
  X,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { useCart } from "@/lib/contexts/CartContext";
import { useAuth } from "@/lib/contexts/AuthContext";

import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from "./ui/navigation-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { SearchAutocomplete } from "./SearchAutocomplete";
import { CurrencySwitcher } from "./CurrencySwitcher";

type DictRow = {
  slug: string;
  name: string;
  product_count: number;
  active?: boolean;
};

type FeaturedTickerItem = {
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  short_description?: string | null;
  // Sale window fields so the marquee can show the same effective
  // selling price the rest of the storefront does.
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

const HEADER_H_CLASS = "h-20";
const HEADER_DICT_CACHE_KEY = "mk_header_dicts_v1";
const HEADER_DICT_CACHE_TTL_MS = 5 * 60 * 1000;
type HeaderDictCache = {
  ts: number;
  categories: DictRow[];
  brands: DictRow[];
  featuredTicker: FeaturedTickerItem[];
};
let headerDictMemoryCache: HeaderDictCache | null = null;
let headerDictFetchPromise: Promise<HeaderDictCache> | null = null;

function formatINR(value?: number | null, currency?: string | null) {
  if (value == null) return "";
  const code = (currency ?? "INR").toUpperCase();
  if (code === "INR") return `₹${value.toLocaleString("en-IN")}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}

export function Header() {
  const { totalItems } = useCart();
  const { isAuthenticated } = useAuth();

  const [showSearch, setShowSearch] = useState(false);
  // Close the search popup on Esc — standard dismissal pattern, paired
  // with the visible X button inside the popup.
  useEffect(() => {
    if (!showSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSearch(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSearch]);

  const [categories, setCategories] = useState<DictRow[] | null>(null);
  const [brands, setBrands] = useState<DictRow[] | null>(null);
  const [featuredTicker, setFeaturedTicker] = useState<FeaturedTickerItem[]>([]);
  const [loadingDicts, setLoadingDicts] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const withCount = (rows: any[] | null): DictRow[] =>
      (rows ?? []).map((r) => ({
        slug: r.slug,
        name: r.name,
        active: r.active ?? true,
        product_count: Array.isArray(r.products)
          ? r.products[0]?.count ?? 0
          : 0,
      }));

    const applyCache = (cached: HeaderDictCache) => {
      setCategories(cached.categories ?? []);
      setBrands(cached.brands ?? []);
      setFeaturedTicker(cached.featuredTicker ?? []);
      setLoadingDicts(false);
    };

    const loadFromNetwork = async (): Promise<HeaderDictCache> => {
      const [
        { data: cats, error: cErr },
        { data: brs, error: bErr },
        { data: featured, error: fErr },
      ] = await Promise.all([
        supabase
          .from("categories")
          .select("slug,name,products(count)")
          .eq("products.is_published", true)
          .is("products.deleted_at", null)
          .order("name", { ascending: true }),
        supabase
          .from("brands")
          .select("slug,name,active,position,products(count)")
          .eq("active", true)
          .eq("products.is_published", true)
          .is("products.deleted_at", null)
          .order("position", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("products")
          .select(
            "slug,name,price,currency,short_description,sale_price,sale_starts_at,sale_ends_at"
          )
          .eq("is_published", true)
          .eq("is_featured", true)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const built: HeaderDictCache = {
        ts: Date.now(),
        categories: !cErr ? withCount(cats) : [],
        brands: !bErr ? withCount(brs) : [],
        featuredTicker: !fErr ? ((featured ?? []) as FeaturedTickerItem[]) : [],
      };
      return built;
    };

    (async () => {
      const now = Date.now();
      if (
        headerDictMemoryCache &&
        now - headerDictMemoryCache.ts < HEADER_DICT_CACHE_TTL_MS
      ) {
        if (cancelled) return;
        applyCache(headerDictMemoryCache);
        return;
      }

      try {
        const cachedRaw = sessionStorage.getItem(HEADER_DICT_CACHE_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as HeaderDictCache;
          if (now - (cached?.ts ?? 0) < HEADER_DICT_CACHE_TTL_MS) {
            if (cancelled) return;
            headerDictMemoryCache = cached;
            applyCache(cached);
            return;
          }
        }
      } catch {}

      setLoadingDicts(true);

      if (!headerDictFetchPromise) {
        headerDictFetchPromise = loadFromNetwork().finally(() => {
          headerDictFetchPromise = null;
        });
      }

      try {
        const fresh = await headerDictFetchPromise;
        if (cancelled) return;
        headerDictMemoryCache = fresh;
        applyCache(fresh);
        try {
          sessionStorage.setItem(HEADER_DICT_CACHE_KEY, JSON.stringify(fresh));
        } catch {}
      } catch {
        if (cancelled) return;
        setLoadingDicts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const byAvailThenName = (a: DictRow, b: DictRow) => {
    const aa = (a.product_count ?? 0) > 0 ? 0 : 1;
    const bb = (b.product_count ?? 0) > 0 ? 0 : 1;
    if (aa !== bb) return aa - bb;
    return a.name.localeCompare(b.name);
  };

  const sortedCats = useMemo(
    () => [...(categories ?? [])].sort(byAvailThenName),
    [categories]
  );

  const sortedBrands = useMemo(
    () => [...(brands ?? [])]
      .filter((b) => b.active !== false)
      .sort(byAvailThenName),
    [brands]
  );

  const topCats = useMemo(() => sortedCats.slice(0, 8), [sortedCats]);
  const topBrands = useMemo(() => sortedBrands.slice(0, 10), [sortedBrands]);

  // Hardcoded fallback when there are no featured products yet.
  const fallbackTickerText =
    "SHOP AUTHENTIC K-BEAUTY FAVORITES • DISCOVER OUR FEATURED PICKS • FREE DELIVERY OFFERS AVAILABLE";

  // Mirror the storefront's effective-price logic: if `sale_price` is set
  // and we're inside the optional sale window, show the sale price.
  // Otherwise show the list price.
  const effectivePriceFor = (item: FeaturedTickerItem): number | null => {
    if (item.sale_price != null) {
      const now = Date.now();
      const startsOk =
        !item.sale_starts_at || new Date(item.sale_starts_at).getTime() <= now;
      const endsOk =
        !item.sale_ends_at || new Date(item.sale_ends_at).getTime() >= now;
      if (startsOk && endsOk) return item.sale_price;
    }
    return item.price ?? null;
  };

  // Renders one full copy of the ticker contents. Duplicated below the
  // marquee with `aria-hidden` so the seamless-loop wrap doesn't
  // double-announce items to screen readers.
  const TickerSet = ({ ariaHidden = false }: { ariaHidden?: boolean }) => {
    if (featuredTicker.length === 0) {
      return (
        <span
          className="mx-8 inline-block"
          {...(ariaHidden ? { "aria-hidden": "true" as const } : {})}
        >
          {fallbackTickerText}
        </span>
      );
    }
    return (
      <span
        className="inline-block"
        {...(ariaHidden ? { "aria-hidden": "true" as const } : {})}
      >
        {featuredTicker.map((item, i) => {
          const price = effectivePriceFor(item);
          return (
            <span key={`${item.slug}-${i}`} className="inline-block">
              <Link
                href={`/products/${item.slug}`}
                className="mx-6 inline-block whitespace-nowrap hover:text-white hover:underline"
                // Keep aria-hidden duplicates out of the tab order so
                // keyboard users only encounter each product once.
                tabIndex={ariaHidden ? -1 : undefined}
              >
                {item.name}
                {price != null && (
                  <span className="ml-2 opacity-80">
                    {formatINR(price, item.currency)}
                  </span>
                )}
              </Link>
              {i < featuredTicker.length - 1 && (
                <span className="opacity-50" aria-hidden="true">
                  •
                </span>
              )}
            </span>
          );
        })}
      </span>
    );
  };

  const DisabledItem = ({ children }: { children: React.ReactNode }) => (
    <div
      role="link"
      aria-disabled="true"
      tabIndex={-1}
      className="rounded-lg px-3 py-2 text-sm text-muted-foreground opacity-60 cursor-not-allowed select-none"
    >
      <div className="flex items-center justify-between">
        {children}
      </div>
      <p className="mt-1 text-xs text-muted-foreground/90">Coming soon</p>
    </div>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="overflow-hidden bg-black text-white">
        <div className="container mx-auto">
          {/* `group` so the inner .ticker-marquee can pause on hover via
              the parent's :hover state — that way hovering the gaps
              between items also pauses (more forgiving than only pausing
              on item hover). */}
          <div className="ticker-strip group relative flex h-10 items-center overflow-hidden">
            <div className="ticker-marquee whitespace-nowrap text-center text-[11px] font-medium uppercase tracking-[0.24em] text-white/95">
              <TickerSet />
              <TickerSet ariaHidden />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .ticker-marquee {
          display: inline-block;
          min-width: 200%;
          /* Default = desktop. Mobile/tablet override below — the
             animation translates by -50%, which is a *percentage* of the
             marquee's own width. On a narrow viewport that's far fewer
             actual pixels, so a fixed duration makes the perceived speed
             much slower. Shortening the duration on smaller screens
             keeps the px/sec velocity roughly consistent. */
          animation: ticker-scroll 32s linear infinite;
        }

        @media (max-width: 1023px) {
          .ticker-marquee {
            animation-duration: 22s;
          }
        }

        @media (max-width: 639px) {
          .ticker-marquee {
            animation-duration: 14s;
          }
        }

        /* Pause the scroll when the user hovers anywhere on the strip,
           so they have time to read or click an individual product link.
           CSS can't smoothly transition animation-play-state, so this is
           a hard pause/resume — the user's stated goal ("stop when we
           hover") is met; the perceived "slow down" is whatever the
           viewer reads into the cursor lingering before stop. */
        .ticker-strip:hover .ticker-marquee {
          animation-play-state: paused;
        }

        @keyframes ticker-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>

      <div className="container mx-auto relative">
        <div className={`flex ${HEADER_H_CLASS} items-center justify-between gap-3`}>
          <div className="flex items-center gap-2 md:gap-6">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>

              <SheetContent
                side="left"
                className="w-[85vw] max-w-sm p-0"
                // Radix auto-focuses the first focusable child of a
                // Sheet on open. That landed on the search input and
                // popped the on-screen keyboard the moment the menu
                // opened — intrusive UX. Block the auto-focus here.
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <div className="flex items-center justify-between px-5 py-4">
                  <Link href="/" className="flex items-center">
                    <Image
                      src="/logo-gif.gif"
                      alt="MadenKorea"
                      width={67}
                      height={28}
                      className="rounded-md"
                      priority
                    />
                  </Link>
                </div>
                <Separator />

                <div className="px-5 py-3">
                  <Button
                    asChild
                    className="w-full rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-amber-400 text-sm font-semibold text-white shadow-lg shadow-pink-500/40"
                  >
                    <Link href="/influencer-request">K- PartnerUp</Link>
                  </Button>
                </div>

                <div className="px-5 pb-3 flex items-center gap-2 md:hidden">
                  <Button asChild variant="outline" className="flex-1">
                    <Link href={isAuthenticated ? "/account" : "/auth/login"}>
                      <User className="mr-2 h-4 w-4" /> Account
                    </Link>
                  </Button>
                </div>

                <Separator />

                <ScrollArea className="h-[calc(100dvh-6.5rem)] px-2 py-4">
                  <div className="px-3 pb-3">
                    <SearchAutocomplete />
                  </div>
                  <Separator className="mb-3" />

                  <nav className="px-3">
                    <div className="mb-4 space-y-3">
                      <Link href="/best-seller" className="block text-base uppercase">
                        BEST SELLER
                      </Link>
                      <Link href="/shop-199" className="block text-base uppercase">
                        SHOP@199
                      </Link>
                      <Link href="/contact" className="block text-base uppercase">
                        SUPPORT
                      </Link>
                      <Link href="/k-plus" className="block text-base uppercase">
                        K-PLUS
                      </Link>
                    </div>

                    <Accordion type="multiple" className="w-full">
                      <AccordionItem value="categories">
                        <AccordionTrigger className="text-base uppercase">
                          CATEGORIES
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="space-y-1">
                            {sortedCats.map((c) => {
                              const disabled = (c.product_count ?? 0) === 0;
                              return (
                                <li key={c.slug}>
                                  {disabled ? (
                                    <DisabledItem>
                                      <span>{c.name}</span>
                                      <ChevronRight className="h-4 w-4 opacity-60" />
                                    </DisabledItem>
                                  ) : (
                                    <Link
                                      href={`/c/${c.slug}`}
                                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent"
                                    >
                                      <span>{c.name}</span>
                                      <ChevronRight className="h-4 w-4 opacity-60" />
                                    </Link>
                                  )}
                                </li>
                              );
                            })}
                            {!sortedCats.length && (
                              <li className="px-3 py-2 text-sm text-muted-foreground">
                                {loadingDicts ? "Loading…" : "No categories"}
                              </li>
                            )}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="brands">
                        <AccordionTrigger className="text-base uppercase">
                          BRANDS
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="space-y-1">
                            {sortedBrands.map((b) => {
                              const disabled = (b.product_count ?? 0) === 0;
                              return (
                                <li key={b.slug}>
                                  {disabled ? (
                                    <DisabledItem>
                                      <span>{b.name}</span>
                                      <ChevronRight className="h-4 w-4 opacity-60" />
                                    </DisabledItem>
                                  ) : (
                                    <Link
                                      href={`/brand/${b.slug}`}
                                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent"
                                    >
                                      <span>{b.name}</span>
                                      <ChevronRight className="h-4 w-4 opacity-60" />
                                    </Link>
                                  )}
                                </li>
                              );
                            })}
                            {!sortedBrands.length && (
                              <li className="px-3 py-2 text-sm text-muted-foreground">
                                {loadingDicts ? "Loading…" : "No brands"}
                              </li>
                            )}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    <div className="mt-4 space-y-3">
                      <Link href="/bundles" className="block text-base uppercase">
                        BUNDLES
                      </Link>
                    </div>

                  </nav>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <Link href="/" className="flex items-center">
              <Image
                src="/logo-gif.gif"
                alt="MadenKorea"
                width={133}
                height={56}
                className="rounded-md"
                priority
              />
            </Link>

            <nav className="hidden md:block">
              <NavigationMenu>
                <NavigationMenuList>
                  <NavigationMenuItem>
                    <Link
                      href="/best-seller"
                      className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium uppercase transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      BEST SELLER
                    </Link>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <NavigationMenuTrigger className="text-sm uppercase">
                      CATEGORIES
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <div className="grid w-[640px] max-w-[80vw] grid-cols-2 gap-2 p-4 md:grid-cols-3">
                        {topCats.map((c) => {
                          const disabled = (c.product_count ?? 0) === 0;
                          const base = "rounded-lg p-3 text-sm";
                          return disabled ? (
                            <div
                              key={c.slug}
                              className={`${base} opacity-50 cursor-not-allowed select-none`}
                            >
                              <div className="font-medium">{c.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Coming soon
                              </div>
                            </div>
                          ) : (
                            <Link
                              key={c.slug}
                              href={`/c/${c.slug}`}
                              className={`${base} hover:bg-accent`}
                            >
                              <div className="font-medium">{c.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Shop {c.name}
                              </div>
                            </Link>
                          );
                        })}
                        {!sortedCats.length && (
                          <div className="col-span-full p-3 text-sm text-muted-foreground">
                            {loadingDicts ? "Loading categories…" : "No categories found"}
                          </div>
                        )}
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <NavigationMenuTrigger className="text-sm uppercase">
                      BRANDS
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <div className="grid w-[720px] max-w-[90vw] grid-cols-2 gap-2 p-4 md:grid-cols-3 lg:grid-cols-4">
                        {topBrands.map((b) => {
                          const disabled = (b.product_count ?? 0) === 0;
                          const base = "rounded-lg p-3 text-sm";
                          return disabled ? (
                            <div
                              key={b.slug}
                              className={`${base} opacity-50 cursor-not-allowed select-none`}
                            >
                              <div className="font-medium">{b.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Coming soon
                              </div>
                            </div>
                          ) : (
                            <Link
                              key={b.slug}
                              href={`/brand/${b.slug}`}
                              className={`${base} hover:bg-accent`}
                            >
                              <div className="font-medium">{b.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Explore {b.name}
                              </div>
                            </Link>
                          );
                        })}
                        {!sortedBrands.length && (
                          <div className="col-span-full p-3 text-sm text-muted-foreground">
                            {loadingDicts ? "Loading brands…" : "No brands found"}
                          </div>
                        )}
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <Link
                      href="/bundles"
                      className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium uppercase transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      BUNDLES
                    </Link>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <Link
                      href="/shop-199"
                      className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium uppercase transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      SHOP@199
                    </Link>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <Link
                      href="/contact"
                      className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium uppercase transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      SUPPORT
                    </Link>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <Link
  href="/k-plus"
  className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-sky-600 via-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-md shadow-indigo-500/25"
>
  <Sparkles className="mr-2 h-4 w-4" />
  K-PLUS
</Link>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>
            </nav>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="relative md:hidden"
              onClick={() => setShowSearch((s) => !s)}
              aria-label="Toggle search"
            >
              {showSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </Button>

            {/* Mobile currency switcher — compact (symbol only). The
                desktop equivalent shows symbol + code. */}
            <div className="md:hidden">
              <CurrencySwitcher />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="relative md:hidden"
              asChild
              aria-label="Cart"
            >
              <Link href="/cart">
                <ShoppingCart className="h-5 w-5" />
                {totalItems > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center p-0 text-xs"
                  >
                    {totalItems}
                  </Badge>
                )}
                <span className="sr-only">Cart</span>
              </Link>
            </Button>

            <Button
              asChild
              className="hidden sm:inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-amber-400 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-pink-500/40"
            >
              <Link href="/influencer-request">K- PartnerUp</Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              onClick={() => setShowSearch((s) => !s)}
              aria-label="Toggle search"
            >
              {showSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </Button>

            {/* Currency switcher — visible on desktop only. Mobile
                exposes the same control inside the slide-out menu. */}
            <div className="hidden md:inline-flex">
              <CurrencySwitcher />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              asChild
              aria-label="Account"
            >
              <Link href={isAuthenticated ? "/account" : "/auth/login"}>
                <User className="h-5 w-5" />
                <span className="sr-only">Account</span>
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="relative hidden md:inline-flex"
              asChild
              aria-label="Cart"
            >
              <Link href="/cart">
                <ShoppingCart className="h-5 w-5" />
                {totalItems > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center p-0 text-xs"
                  >
                    {totalItems}
                  </Badge>
                )}
                <span className="sr-only">Cart</span>
              </Link>
            </Button>
          </div>
        </div>

        {showSearch && (
          <div className="absolute left-0 right-0 top-full z-50 px-4 pb-3">
            <div className="mx-auto w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-3 shadow-2xl">
              {/* Inline close — the toggle in the top-right corner also
                  closes the popup, but it's far from where the user's
                  attention sits, so a visible X next to the input is
                  the obvious affordance. */}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  {/* User explicitly tapped the search icon — focus the
                      input so the keyboard appears immediately. */}
                  <SearchAutocomplete autoFocus />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSearch(false)}
                  aria-label="Close search"
                  className="shrink-0 h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
