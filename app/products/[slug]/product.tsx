"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Heart,
  ShoppingCart,
  Star,
  Truck,
  Package,
  RotateCcw,
  Shield,
  Share2,
  ZoomIn,
  Plane,
  Leaf,
  HeartHandshake,
  ShieldCheck,
  CircleSlash,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  X,
  Trash2,
  Edit3,
  EyeOff,
  Eye,
  Copy,
  Link as LinkIcon,
  Mail,
  MessageCircle,
  Send,
  PlayCircle,
} from "lucide-react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCart } from "@/lib/contexts/CartContext";
import { useWishlist } from "@/lib/contexts/WishlistContext";
import { toast } from "sonner";
import { ProductCard } from "@/components/ProductCard";
import { ProductStorySection } from "@/components/products/ProductStorySection";
import type { StoryBlock } from "@/lib/types/productStory";
import { createClient } from "@supabase/supabase-js";

type Brand = { name?: string | null; slug?: string | null };
type Product = {
  id: string;
  slug: string;
  name: string;
  short_description?: string | null;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_published: boolean;
  brand_id?: string | null;
  category_id?: string | null;
  hero_image_path?: string | null;
  stock_qty?: number | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  new_until?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  video_path?: string | null;

  // highlight flags
  made_in_korea?: boolean | null;
  is_vegetarian?: boolean | null;
  cruelty_free?: boolean | null;
  toxin_free?: boolean | null;
  paraben_free?: boolean | null;

  // content fields
  ingredients_md?: string | null;
  key_features_md?: string | null;
  additional_details_md?: string | null;
  key_benefits?: string[] | null;

  brands?: Brand | null; // via join
};

type ProductImage = {
  storage_path: string;
  alt?: string | null;
  sort_order?: number | null;
};

/* ---------- Reviews types ---------- */
type Review = {
  id: string;
  product_id: string;
  user_id: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  helpful_count: number;
  is_verified_purchase: boolean;
  status: "published" | "pending" | "hidden";
  created_at: string;
  /* NEW: */
  display_name?: string | null;
  avatar_url?: string | null;
};

type ReviewWithPhotos = Review & { photos?: string[] | null };

type ReviewStats = {
  product_id: string;
  rating_count: number;
  rating_avg: number | null;
  stars_5: number;
  stars_4: number;
  stars_3: number;
  stars_2: number;
  stars_1: number;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

function storagePublicUrl(
  path?: string | null,
  bucket: "product-media" | "review-media" = "product-media"
) {
  if (!path) return null;
  const trimmed = path.trim();

  const storagePublicMarker = "/storage/v1/object/public/";
  const markerIndex = trimmed.indexOf(storagePublicMarker);
  if (markerIndex >= 0) {
    const suffix = trimmed.slice(markerIndex + storagePublicMarker.length);
    const firstSlash = suffix.indexOf("/");
    const objectPath = firstSlash >= 0 ? suffix.slice(firstSlash + 1) : suffix;
    const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return data.publicUrl ?? null;
  }

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const normalizedPath = trimmed
    .replace(/^\/+/, "")
    .replace(new RegExp(`^${bucket}/`), "");
  const { data } = supabase.storage.from(bucket).getPublicUrl(normalizedPath);
  return data.publicUrl ?? null;
}

function reviewMediaUrl(path?: string | null) {
  if (!path) return null;
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  let normalized = trimmed.replace(/^\/+/, "");

  const storagePublicMarker = "/storage/v1/object/public/";
  const markerIndex = normalized.indexOf(storagePublicMarker);
  if (markerIndex >= 0) {
    const suffix = normalized.slice(markerIndex + storagePublicMarker.length);
    const firstSlash = suffix.indexOf("/");
    normalized = firstSlash >= 0 ? suffix.slice(firstSlash + 1) : suffix;
  }

  // Be tolerant of mixed stored values such as "review-media/uploads/..."
  // or legacy "product-media/uploads/..."; we only need the object key.
  normalized = normalized.replace(/^(review-media|product-media)\//, "");

  const { data } = supabase.storage.from("review-media").getPublicUrl(normalized);
  return data.publicUrl ?? null;
}

function formatINR(value?: number | null, currency?: string | null) {
  if (value == null) return "";
  const code = (currency ?? "INR").toUpperCase();
  if (code === "INR") return `₹${value.toLocaleString("en-IN")}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}

function isWithinWindow(now: Date, start?: string | null, end?: string | null) {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && isNaN(s.getTime())) return false;
  if (e && isNaN(e.getTime())) return false;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

/* ------------ FAQ (pipe) parser (kept from earlier) ------------ */
type FAQ = { q: string; a: string };
function parseInlineFaqs(raw?: string | null): FAQ[] {
  if (!raw) return [];
  const text = raw.replace(/\n+/g, " ").trim();
  return text
    .split("||")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const qMatch = chunk.match(/Q:\s*(.*?)\s*\|/i);
      const aMatch = chunk.match(/\|\s*A:\s*(.*)$/i);
      return qMatch && aMatch
        ? { q: qMatch[1].trim(), a: aMatch[1].trim() }
        : null;
    })
    .filter((x): x is FAQ => !!x);
}

function randomKey() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function maskEmail(email?: string | null) {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  const masked =
    user.length <= 2
      ? user[0] + "*"
      : user[0] + "*".repeat(user.length - 2) + user.slice(-1);
  return `${masked}@${domain}`;
}

async function currentUserDisplay() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const full = (user?.user_metadata as any)?.full_name as string | undefined;
  const avatar = (user?.user_metadata as any)?.avatar_url as string | undefined;
  const email = user?.email ?? null;
  return {
    display_name: full?.trim() || maskEmail(email) || "Verified Buyer",
    avatar_url: avatar || null,
  };
}


function ProductInfoAccordionSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-neutral-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-6 text-left uppercase tracking-[0.22em] text-[13px] text-neutral-900"
      >
        <span>{title}</span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-neutral-600" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-600" />
        )}
      </button>
      {isOpen && <div className="pb-8 text-[15px] leading-7 text-neutral-700">{children}</div>}
    </div>
  );
}

type ProductPageProps = {
  initialStoryBlocks?: StoryBlock[];
};

export default function ProductPage({ initialStoryBlocks }: ProductPageProps = {}) {
  const router = useRouter();
  const params = useParams();
  const slug = (params?.slug as string) || (params?.handle as string);
  const { addItem } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const [showShare, setShowShare] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [pincode, setPincode] = useState("");
  const [deliveryEstimate, setDeliveryEstimate] = useState("");
  const [isCheckingPincode, setIsCheckingPincode] = useState(false);
  const [showZoom, setShowZoom] = useState(false);

  const [editingReview, setEditingReview] = useState<ReviewWithPhotos | null>(
    null
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [myReview, setMyReview] = useState<ReviewWithPhotos | null>(null);
  // UI toggle for highlights
  const [showHighlights, setShowHighlights] = useState(true);

  // ---- Auth (for reviews) ----
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid || !mounted) {
        setIsAdmin(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();
      if (!mounted) return;
      setIsAdmin(profile?.role === "admin");
    });
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  const shareUrl = useMemo(
    () => (typeof window !== "undefined" ? window.location.href : ""),
    [slug]
  );
  const shareTitle = product?.name ?? "Check this out";
  const shareText =
    product?.short_description ??
    "Found this on K-beauty store — thought you might like it!";
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(`${shareTitle} — ${shareText}`);

  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    email: `mailto:?subject=${encodeURIComponent(
      shareTitle
    )}&body=${encodedText}%0A${encodedUrl}`,
  };

  async function handleShareClick() {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // user canceled or not supported -> fall through to dialog
      }
    }
    setShowShare(true);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn’t copy. Long-press the link to copy.");
    }
  }

  // Fetch product + images
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      const { data: prod, error: pErr } = await supabase
        .from("products")
        .select(
          `
          id, slug, name, short_description, description,
          price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at,
          is_published, brand_id, category_id, hero_image_path, stock_qty,
          volume_ml, net_weight_g, country_of_origin, new_until, is_featured, is_trending,
          made_in_korea, is_vegetarian, cruelty_free, toxin_free, paraben_free,
          ingredients_md, key_features_md, additional_details_md, key_benefits,
          video_path,
          brands ( name, slug )
        `
        )
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle<Product>();

      if (cancelled) return;

      if (pErr || !prod) {
        console.error("Product fetch error:", pErr);
        setLoading(false);
        setProduct(null);
        return;
      }

      const { data: imgs, error: iErr } = await supabase
        .from("product_images")
        .select("storage_path, alt, sort_order")
        .eq("product_id", prod.id)
        .order("sort_order", { ascending: true });

      if (iErr) console.error("Images fetch error:", iErr);
      if (cancelled) return;

      setProduct(prod);
      setImages(imgs ?? []);
      setSelectedImage(0);
      setLoading(false);

      try {
        const rv = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
        const updated = [
          prod.id,
          ...rv.filter((id: string) => id !== prod.id),
        ].slice(0, 10);
        localStorage.setItem("recentlyViewed", JSON.stringify(updated));
      } catch {}
    }

    if (slug) run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Compute pricing
  const now = useMemo(() => new Date(), []);
  const saleActive =
    product?.sale_price != null
      ? isWithinWindow(
          now,
          product?.sale_starts_at ?? null,
          product?.sale_ends_at ?? null
        )
      : false;

  const effectivePrice = useMemo(
    () =>
      saleActive && product?.sale_price != null
        ? product.sale_price
        : product?.price ?? null,
    [saleActive, product?.sale_price, product?.price]
  );

  const discount = useMemo(() => {
    if (
      product?.compare_at_price &&
      effectivePrice != null &&
      product.compare_at_price > 0
    ) {
      return Math.round(
        ((product.compare_at_price - effectivePrice) /
          product.compare_at_price) *
          100
      );
    }
    return 0;
  }, [product?.compare_at_price, effectivePrice]);

  const imageUrls = useMemo(() => {
    const gallery = images.length
      ? images.map((m) => storagePublicUrl(m.storage_path) || "")
      : product?.hero_image_path
      ? [storagePublicUrl(product.hero_image_path) || ""]
      : [];
    return gallery.filter(Boolean);
  }, [images, product?.hero_image_path]);

  const videoUrl = useMemo(
    () => storagePublicUrl(product?.video_path ?? null),
    [product?.video_path]
  );

  const galleryCount = imageUrls.length + (videoUrl ? 1 : 0);
  const isVideoSelected = selectedImage === imageUrls.length && !!videoUrl;

  const inWishlist = product ? isInWishlist(product.id) : false;
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const isOutOfStock = (product?.stock_qty ?? 0) <= 0;

  const handleAddToCart = async () => {
    if (!product || isAddingToCart || isOutOfStock) return;
    try {
      setIsAddingToCart(true);
      await addItem(product.id, quantity);
      toast.success("Added to cart", {
        description: `${quantity} × ${product.name} added to your cart.`,
      });
    } catch (error) {
      console.error("Add to cart error:", error);
      toast.error("Could not add item to cart right now.");
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!product || isBuyingNow || isOutOfStock) return;
    try {
      setIsBuyingNow(true);
      await addItem(product.id, quantity);
      router.push("/checkout");
    } catch (error) {
      console.error("Buy now error:", error);
      toast.error("Unable to proceed to checkout right now.");
    } finally {
      setIsBuyingNow(false);
    }
  };

  const handleWishlistToggle = () => {
    if (!product) return;
    toggleWishlist(product.id);
    toast.success(inWishlist ? "Removed from wishlist" : "Added to wishlist");
  };

  const checkDelivery = async () => {
    const cleaned = pincode.trim().replace(/[^0-9]/g, "");
    if (cleaned.length !== 6) {
      toast.error("Please enter a valid 6-digit pincode");
      return;
    }
    setIsCheckingPincode(true);
    try {
      const res = await fetch(
        `/api/dtdc/serviceability?pincode=${encodeURIComponent(cleaned)}`,
        { cache: "no-store" }
      );
      const j: {
        ok?: boolean;
        serviceable: boolean | null;
        etaDaysMin: number | null;
        etaDaysMax: number | null;
      } = await res.json().catch(() => ({} as any));

      if (!res.ok || !j?.ok) {
        setDeliveryEstimate("Delivery availability will be confirmed at checkout.");
        return;
      }

      if (j.serviceable === true) {
        const eta =
          j.etaDaysMin && j.etaDaysMax
            ? j.etaDaysMin === j.etaDaysMax
              ? `in ~${j.etaDaysMin} day${j.etaDaysMin === 1 ? "" : "s"}`
              : `in ${j.etaDaysMin}–${j.etaDaysMax} days`
            : "in 3–5 days";
        setDeliveryEstimate(`✓ Deliverable to ${cleaned} ${eta}.`);
      } else if (j.serviceable === false) {
        setDeliveryEstimate(
          `Sorry, we don't deliver to ${cleaned} yet. Email info@madenkorea.com if you'd like us to ship there.`
        );
      } else {
        setDeliveryEstimate(
          "We couldn't reach our courier just now. We'll confirm availability at checkout."
        );
      }
    } catch (e) {
      setDeliveryEstimate("Delivery availability will be confirmed at checkout.");
    } finally {
      setIsCheckingPincode(false);
    }
  };

  // Related products
  const [related, setRelated] = useState<Product[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!product) return;
      const base = supabase
        .from("products")
        .select(
          `
        id, slug, name,
        price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at,
        hero_image_path, stock_qty, is_published,
        brands ( name )
      `
        )
        .eq("is_published", true)
        .neq("id", product.id);

      const brandFilter = product.brand_id
        ? base.eq("brand_id", product.brand_id)
        : base;
      const { data } = await brandFilter
        .order("created_at", { ascending: false })
        .limit(8);

      if (cancelled) return;
      setRelated((data ?? []) as Product[]);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [product]);

  // Build highlight pills
  const highlightItems = useMemo(() => {
    if (!product) return [];
    const items: Array<{
      key: string;
      label: string;
      Icon: React.ComponentType<any>;
    }> = [];
    if (product.made_in_korea)
      items.push({ key: "mik", label: "Made In Korea", Icon: Plane });
    if (product.is_vegetarian)
      items.push({ key: "veg", label: "100% Vegetarian", Icon: Leaf });
    if (product.cruelty_free)
      items.push({
        key: "cruelty",
        label: "Cruelty Free",
        Icon: HeartHandshake,
      });
    if (product.toxin_free)
      items.push({ key: "toxin", label: "Toxin Free", Icon: ShieldCheck });
    if (product.paraben_free)
      items.push({ key: "paraben", label: "Paraben Free", Icon: CircleSlash });
    return items;
  }, [product]);

  // Helper: render markdown safely
  // Helper: render markdown safely
  const Markdown = ({ children }: { children: string }) => (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ul: ({ node, ...props }) => (
            <ul className="list-disc ml-4 space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal ml-4 space-y-1" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );

  /* ---------------- Reviews: fetch stats + list ---------------- */
  const pageSize = 10;
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewSort, setReviewSort] = useState<
    "helpful" | "recent" | "high" | "low"
  >("helpful");
  const [reviewPage, setReviewPage] = useState(1);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [helpfulVoted, setHelpfulVoted] = useState<Record<string, boolean>>({});
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  useEffect(() => {
    if (!product?.id) return;
    supabase
      .from("product_review_stats")
      .select("*")
      .eq("product_id", product.id)
      .maybeSingle<ReviewStats>()
      .then(({ data }) => setReviewStats(data ?? null));
  }, [product?.id]);

  async function fetchReviews(resetPage = false) {
    if (!product?.id) return;
    setLoadingReviews(true);
    const page = resetPage ? 1 : reviewPage;
    let q = supabase
      .from("product_reviews")
      .select("*")
      .eq("product_id", product.id)
      .eq("status", "published");

    // sorting
    if (reviewSort === "helpful")
      q = q
        .order("helpful_count", { ascending: false })
        .order("created_at", { ascending: false });
    if (reviewSort === "recent")
      q = q.order("created_at", { ascending: false });
    if (reviewSort === "high")
      q = q
        .order("rating", { ascending: false })
        .order("created_at", { ascending: false });
    if (reviewSort === "low")
      q = q
        .order("rating", { ascending: true })
        .order("created_at", { ascending: false });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data } = await q.range(from, to);
    const rows = (data ?? []) as Review[];
    setReviews(resetPage ? rows : [...reviews, ...rows]);
    setReviewPage(page);

    // Fetch which of these reviews the user voted helpful
    if (userId && rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const { data: votes } = await supabase
        .from("review_votes")
        .select("review_id, is_helpful")
        .in("review_id", ids);
      const map: Record<string, boolean> = {
        ...(resetPage ? {} : helpfulVoted),
      };
      (votes ?? []).forEach((v: any) => (map[v.review_id] = !!v.is_helpful));
      setHelpfulVoted(map);
    }
    if (userId) {
      const mine = rows.find((r) => r.user_id === userId) as
        | ReviewWithPhotos
        | undefined;
      setMyReview(mine ?? null);
    }
    setLoadingReviews(false);
  }

  useEffect(() => {
    fetchReviews(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, reviewSort]);

  /* ---------------- Reviews: actions ---------------- */
  const requireLogin = () => {
    toast.info("Please log in to continue");
    router.push(`/auth/login?next=/products/${slug}`);
  };

  const openWriteReview = () => {
    if (!userId) return requireLogin();
    setEditingReview(null);
    setShowReviewDialog(true);
  };

  async function submitReview(form: {
    rating: number;
    title: string;
    body: string;
    photos: string[];
  }) {
    if (!userId) return requireLogin();
    if (!product?.id) return;

    // NEW: get snapshot name/avatar
    const who = await currentUserDisplay();

    if (editingReview) {
      const { error } = await supabase
        .from("product_reviews")
        .update({
          rating: form.rating,
          title: form.title || null,
          body: form.body || null,
          photos: form.photos ?? [],
          /* keep/update snapshot on edit too (optional) */
          display_name: who.display_name,
          avatar_url: who.avatar_url,
        })
        .eq("id", editingReview.id);
      if (error) {
        toast.error("Could not update review");
        return;
      }
      toast.success("Review updated");
    } else {
      const res = await fetch("/api/reviews/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          rating: form.rating,
          title: form.title || null,
          body: form.body || null,
          photos: form.photos ?? [],
          display_name: who.display_name,
          avatar_url: who.avatar_url,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        if (payload?.error === "ALREADY_REVIEWED")
          toast.error("You already reviewed this product");
        else if (payload?.error === "PURCHASE_REQUIRED")
          toast.error("Only verified buyers can review this product");
        else toast.error("Could not submit review");
        return;
      }
      toast.success("Thanks for your review. It is pending moderation.");
    }

    setShowReviewDialog(false);
    setEditingReview(null);
    setReviewPage(1);
    await Promise.all([
      supabase
        .from("product_review_stats")
        .select("*")
        .eq("product_id", product.id)
        .maybeSingle<ReviewStats>()
        .then(({ data }) => setReviewStats(data ?? null)),
      fetchReviews(true),
    ]);
  }

  async function deleteReview(id: string) {
    if (!userId) return requireLogin();
    if (!window.confirm("Delete this review?")) return;
    const { error } = await supabase
      .from("product_reviews")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Could not delete review");
      return;
    }
    toast.success("Review deleted");
    setMyReview(null);
    setEditingReview(null);
    fetchReviews(true);
  }

  async function adminSetStatus(id: string, status: "published" | "hidden") {
    if (!isAdmin) return;
    const { error } = await supabase
      .from("product_reviews")
      .update({ status })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update");
      return;
    }
    toast.success(status === "hidden" ? "Hidden" : "Published");
    fetchReviews(true);
  }

  async function voteHelpful(reviewId: string, isHelpful = true) {
    if (!userId) return requireLogin();
    await supabase
      .from("review_votes")
      .upsert(
        { review_id: reviewId, user_id: userId, is_helpful: isHelpful },
        { onConflict: "review_id,user_id" }
      );
    // update helpful count locally
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId
          ? {
              ...r,
              helpful_count: isHelpful
                ? r.helpful_count + (helpfulVoted[reviewId] ? 0 : 1)
                : r.helpful_count,
            }
          : r
      )
    );
    setHelpfulVoted((m) => ({ ...m, [reviewId]: true }));
  }

  /* ------------ Dynamic tabs (now includes Reviews) ------------ */
  const hasDescription = Boolean(product?.description?.trim());
  const hasIngredients = Boolean(product?.ingredients_md?.trim());
  const hasBenefits =
    Boolean(product?.key_features_md?.trim()) ||
    Boolean(product?.key_benefits && product.key_benefits.length > 0);
  const hasAdditional = Boolean(product?.additional_details_md?.trim());
  const parsedFaqs = useMemo<FAQ[]>(() => {
    const candidates = [
      product?.additional_details_md,
      product?.key_features_md,
      product?.description,
    ];
    for (const c of candidates) {
      const parsed = parseInlineFaqs(c);
      if (parsed.length) return parsed;
    }
    return [];
  }, [
    product?.additional_details_md,
    product?.key_features_md,
    product?.description,
  ]);
  const hasFaq = parsedFaqs.length > 0;

  const tabs = useMemo(
    () =>
      [
        hasDescription && { key: "description", label: "Description" },
        hasIngredients && { key: "ingredients", label: "Ingredients" },
        hasBenefits && { key: "benefits", label: "Benefits" },
        hasFaq && { key: "faq", label: "FAQ" },
        hasAdditional && { key: "additional", label: "Informations" },
        // Reviews tab always present (let users write one even if none yet)
        {
          key: "reviews",
          label: `Reviews${
            reviewStats?.rating_count ? ` (${reviewStats.rating_count})` : ""
          }`,
        },
      ].filter(Boolean) as { key: string; label: string }[],
    [
      hasIngredients,
      hasBenefits,
      hasFaq,
      hasAdditional,
      hasDescription,
      reviewStats?.rating_count,
    ]
  );

  const firstTabValue = tabs[0]?.key ?? "reviews";
  const [openSection, setOpenSection] = useState<string>(firstTabValue);

  useEffect(() => {
    setOpenSection(firstTabValue);
  }, [firstTabValue]);

  function toggleSection(section: string) {
    setOpenSection((current) => (current === section ? "" : section));
  }

  // star helpers
  const StarRow = ({ value }: { value: number }) => (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i <= value
              ? "fill-yellow-400 text-yellow-500"
              : "text-muted-foreground"
          }`}
        />
      ))}
    </div>
  );

  const DistributionRow = ({
    stars,
    count,
    total,
  }: {
    stars: number;
    count: number;
    total: number;
  }) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="w-12">{stars} star</span>
        <div className="flex-1 h-2 bg-muted rounded">
          <div
            className="h-2 rounded bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-10 text-right text-muted-foreground">{pct}%</span>
      </div>
    );
  };

  // ---- Mobile tabs scrolling helpers ----
  const [tabValue, setTabValue] = useState<string>(firstTabValue);
  useEffect(() => setTabValue(firstTabValue), [firstTabValue]);

  const tabsStripRef = useRef<HTMLDivElement>(null);
  const tabBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function scrollTabs(dx: number) {
    const el = tabsStripRef.current;
    if (!el) return;
    el.scrollBy({ left: dx, behavior: "smooth" });
  }

  // When a tab is chosen, scroll it into view (center-ish)
  function onChangeTab(v: string) {
    setTabValue(v);
    const el = tabBtnRefs.current[v];
    const strip = tabsStripRef.current;
    if (el && strip) {
      el.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            <div className="aspect-square rounded-lg bg-muted animate-pulse" />
            <div className="space-y-4">
              <div className="h-6 w-40 bg-muted rounded animate-pulse" />
              <div className="h-10 w-3/4 bg-muted rounded animate-pulse" />
              <div className="h-8 w-1/3 bg-muted rounded animate-pulse" />
              <div className="h-24 w-full bg-muted rounded animate-pulse" />
            </div>
          </div>
        )}

        {!loading && !product && (
          <Card className="mx-auto max-w-xl">
            <CardContent className="py-12 text-center space-y-4">
              <h2 className="text-2xl font-semibold">Product not found</h2>
              <p className="text-muted-foreground">
                This product may be unavailable, moved, or unpublished.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="outline" onClick={() => router.back()}>
                  Go Back
                </Button>
                <Button asChild>
                  <a href="/products">Continue Shopping</a>
                </Button>
                <Button asChild variant="outline">
                  <a href="/">Back to Home</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && product && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
              {/* GALLERY */}
              <div>
                <div className="relative aspect-square mb-4 bg-muted rounded-lg overflow-hidden group">
                  {isVideoSelected && videoUrl ? (
                    <video
                      key={videoUrl} /* force refresh when switching */
                      src={videoUrl}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover" /* fills without side black bars */
                    />
                  ) : imageUrls[selectedImage] ? (
                    <Image
                      src={imageUrls[selectedImage]}
                      alt={images[selectedImage]?.alt || product.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted" />
                  )}

                  {discount > 0 && (
                    <Badge
                      className="absolute top-4 left-4"
                      variant="destructive"
                    >
                      {discount}% OFF
                    </Badge>
                  )}

                  {/* Hide zoom on video; keep it for images */}
                  {!isVideoSelected && (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setShowZoom(true)}
                    >
                      <ZoomIn className="h-5 w-5" />
                    </Button>
                  )}
                </div>

                {galleryCount > 1 && (
                  <div className="grid grid-cols-4 gap-2">
                    {/* image thumbs */}
                    {imageUrls.map((src, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImage(idx)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                          selectedImage === idx
                            ? "border-primary"
                            : "border-transparent"
                        }`}
                      >
                        <Image
                          src={src}
                          alt={`${product.name} ${idx + 1}`}
                          fill
                          className="object-cover"
                        />
                      </button>
                    ))}

                    {/* video thumb (last) */}
                    {videoUrl && (
                      <button
                        onClick={() => setSelectedImage(imageUrls.length)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                          isVideoSelected
                            ? "border-primary"
                            : "border-transparent"
                        }`}
                        aria-label="Product video"
                        title="Product video"
                      >
                        <video
                          src={videoUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/30 grid place-items-center">
                          <PlayCircle className="h-8 w-8 text-white drop-shadow" />
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* DETAILS */}
              <div className="space-y-6">
                {product.brands?.name && (
                  <p className="text-sm text-muted-foreground uppercase tracking-wide">
                    {product.brands.name}
                  </p>
                )}

                <h1 className="text-3xl font-bold">{product.name}</h1>

                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold">
                    {formatINR(effectivePrice, product.currency)}
                  </span>
                  {product.compare_at_price != null &&
                    effectivePrice != null &&
                    product.compare_at_price > effectivePrice && (
                      <span className="text-xl text-muted-foreground line-through">
                        {formatINR(product.compare_at_price, product.currency)}
                      </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {saleActive && product.sale_ends_at && (
                    <Badge variant="outline" className="text-orange-600">
                      Sale ends{" "}
                      {new Date(product.sale_ends_at).toLocaleDateString(
                        "en-IN",
                        {
                          month: "short",
                          day: "numeric",
                        }
                      )}
                    </Badge>
                  )}
                  {product.new_until && new Date(product.new_until) >= now && (
                    <Badge variant="default">New</Badge>
                  )}
                  {product.is_featured && (
                    <Badge variant="default">Featured</Badge>
                  )}
                  {product.is_trending && (
                    <Badge variant="default">Trending</Badge>
                  )}
                </div>

                {/* HIGHLIGHTS (toggle) */}
                {highlightItems.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowHighlights((v) => !v)}
                      className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      Product Highlights
                      {showHighlights ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    {showHighlights && (
                      <div className="flex flex-wrap gap-2">
                        {highlightItems.map(({ key, label, Icon }) => (
                          <div
                            key={key}
                            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm bg-background border-[#2f5f9f] bg-[#eaf4ff]"
                          >
                            <Icon className="h-4 w-4" />
                            <span>{label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Short description */}
                {product.short_description && (
                  <p className="text-sm text-muted-foreground">
                    {product.short_description}
                  </p>
                )}

                {/* Quantity + CTAs */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center border rounded-lg">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                    >
                      -
                    </Button>
                    <span className="px-4 py-2 min-w-[3rem] text-center">
                      {quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuantity(quantity + 1)}
                    >
                      +
                    </Button>
                  </div>

                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={handleAddToCart}
                      disabled={isAddingToCart || isOutOfStock}
                    >
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      {isOutOfStock
                        ? "Out of Stock"
                        : isAddingToCart
                        ? "Adding..."
                        : "Add to Cart"}
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full"
                      onClick={handleBuyNow}
                      disabled={isBuyingNow || isOutOfStock}
                    >
                      {isOutOfStock
                        ? "Out of Stock"
                        : isBuyingNow
                        ? "Processing..."
                        : "Buy Now"}
                    </Button>
                  </div>
                  {/* 
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleWishlistToggle}
                  >
                    <Heart
                      className={`h-5 w-5 ${
                        inWishlist ? "fill-red-500 text-red-500" : ""
                      }`}
                    />
                  </Button> */}
                </div>

                {/* Share + shipping highlights */}
                <div className="flex items-center gap-4 pt-6 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleShareClick}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </div>

                <Card className="mt-6">
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <Label htmlFor="pincode">Check Delivery</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          id="pincode"
                          placeholder="Enter Pincode"
                          autoComplete="postal-code"
                          value={pincode}
                          onChange={(e) =>
                            setPincode(
                              e.target.value.replace(/\D/g, "").slice(0, 6)
                            )
                          }
                          maxLength={6}
                        />
                        <Button
                          onClick={checkDelivery}
                          disabled={isCheckingPincode}
                        >
                          {isCheckingPincode ? "Checking..." : "Check"}
                        </Button>
                      </div>
                      {deliveryEstimate && (
                        <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                          <Truck className="h-4 w-4" />
                          {deliveryEstimate}
                        </p>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <Truck className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium">Free Shipping</p>
                          <p className="text-muted-foreground">
                            On orders above ₹2,000
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <RotateCcw className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium">Easy Returns</p>
                          <p className="text-muted-foreground">
                            7 days return policy
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium">Secure Payment</p>
                          <p className="text-muted-foreground">
                            100% secure transactions
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Package className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="font-medium">Authentic Products</p>
                          <p className="text-muted-foreground">
                            100% original Korean products
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ---------- DYNAMIC TABS (auto-hide when empty) ---------- */}

            {tabs.length > 0 && (
              <div className="mt-12 border-t border-neutral-200">
                {hasDescription && (
                  <ProductInfoAccordionSection
                    title="Description"
                    isOpen={openSection === "description"}
                    onToggle={() => toggleSection("description")}
                  >
                    {product?.description && (
                      <Markdown>{product.description}</Markdown>
                    )}
                  </ProductInfoAccordionSection>
                )}

                {hasIngredients && (
                  <ProductInfoAccordionSection
                    title="Ingredients"
                    isOpen={openSection === "ingredients"}
                    onToggle={() => toggleSection("ingredients")}
                  >
                    <Markdown>{product!.ingredients_md!}</Markdown>
                  </ProductInfoAccordionSection>
                )}

                {hasBenefits && (
                  <ProductInfoAccordionSection
                    title="How to Use"
                    isOpen={openSection === "benefits"}
                    onToggle={() => toggleSection("benefits")}
                  >
                    <div className="space-y-4">
                      {product?.key_features_md?.trim() && (
                        <Markdown>{product.key_features_md!}</Markdown>
                      )}
                      {!product?.key_features_md?.trim() &&
                        product?.key_benefits &&
                        product.key_benefits.length > 0 && (
                          <ul className="list-disc pl-5 text-[15px] leading-8">
                            {product.key_benefits.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        )}
                    </div>
                  </ProductInfoAccordionSection>
                )}

                {hasAdditional && (
                  <ProductInfoAccordionSection
                    title="Additional Details"
                    isOpen={openSection === "additional"}
                    onToggle={() => toggleSection("additional")}
                  >
                    <Markdown>{product!.additional_details_md!}</Markdown>
                  </ProductInfoAccordionSection>
                )}
              </div>
            )}

            {product?.id ? (
              <ProductStorySection
                productId={product.id}
                initialBlocks={initialStoryBlocks}
              />
            ) : null}

            {tabs.length > 0 && (
              <div className="border-t border-neutral-200">
                <ProductInfoAccordionSection
                  title={`Reviews${
                    reviewStats?.rating_count
                      ? ` (${reviewStats.rating_count})`
                      : ""
                  }`}
                  isOpen={openSection === "reviews"}
                  onToggle={() => toggleSection("reviews")}
                >
                  <div className="space-y-6 pt-2">
                    {/* Summary header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl font-bold">
                          {reviewStats?.rating_avg
                            ? Number(reviewStats.rating_avg).toFixed(1)
                            : "0.0"}
                        </div>
                        <div>
                          <StarRow
                            value={Math.round(reviewStats?.rating_avg || 0)}
                          />
                          <div className="text-sm text-muted-foreground">
                            {reviewStats?.rating_count || 0} review
                            {(reviewStats?.rating_count || 0) === 1 ? "" : "s"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-sm text-muted-foreground">
                          Sort
                        </label>
                        <select
                          value={reviewSort}
                          onChange={(e) => setReviewSort(e.target.value as any)}
                          className="border rounded-md px-2 py-1 text-sm bg-background"
                        >
                          <option value="helpful">Most helpful</option>
                          <option value="recent">Most recent</option>
                          <option value="high">Highest rating</option>
                          <option value="low">Lowest rating</option>
                        </select>
                        {myReview ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingReview(myReview);
                              setShowReviewDialog(true);
                            }}
                          >
                            Edit your review
                          </Button>
                        ) : (
                          <Button onClick={openWriteReview}>
                            Write a review
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Distribution */}
                    {!!reviewStats && (
                      <div className="grid gap-2 max-w-xl">
                        <DistributionRow
                          stars={5}
                          count={reviewStats.stars_5}
                          total={reviewStats.rating_count}
                        />
                        <DistributionRow
                          stars={4}
                          count={reviewStats.stars_4}
                          total={reviewStats.rating_count}
                        />
                        <DistributionRow
                          stars={3}
                          count={reviewStats.stars_3}
                          total={reviewStats.rating_count}
                        />
                        <DistributionRow
                          stars={2}
                          count={reviewStats.stars_2}
                          total={reviewStats.rating_count}
                        />
                        <DistributionRow
                          stars={1}
                          count={reviewStats.stars_1}
                          total={reviewStats.rating_count}
                        />
                      </div>
                    )}

                    <Separator />

                    {/* Review list */}
                    <div className="space-y-4">
                      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                        {reviewStats?.rating_count || 0} total review
                        {(reviewStats?.rating_count || 0) === 1 ? "" : "s"}
                        {" • "}
                        Average rating{" "}
                        {reviewStats?.rating_avg
                          ? Number(reviewStats.rating_avg).toFixed(1)
                          : "0.0"}
                        /5
                      </div>
                      {loadingReviews && reviews.length === 0 && (
                        <div className="space-y-3">
                          {Array.from({ length: 3 }).map((_, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl border p-4 space-y-3"
                            >
                              <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                              <div className="h-3 w-full rounded bg-muted animate-pulse" />
                              <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
                            </div>
                          ))}
                        </div>
                      )}
                      {reviews.map((r) => (
                        <div key={r.id} className="rounded-xl border p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              {r.avatar_url ? (
                                <div className="relative h-8 w-8 rounded-full overflow-hidden border">
                                  <Image
                                    src={r.avatar_url}
                                    alt={r.display_name ?? "Reviewer"}
                                    fill
                                    className="object-cover"
                                  />
                                </div>
                              ) : null}

                              <div>
                                <StarRow value={r.rating} />
                                <div className="text-sm text-foreground/90">
                                  {r.display_name ||
                                    (r.is_verified_purchase
                                      ? "Verified Buyer"
                                      : "Anonymous")}
                                </div>
                              </div>
                            </div>

                            <div className="text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleDateString()}
                            </div>
                          </div>

                          {r.title && (
                            <div className="mt-1 font-medium">{r.title}</div>
                          )}
                          {r.body && (
                            <p className="mt-1 text-sm text-foreground/80 whitespace-pre-line">
                              {r.body}
                            </p>
                          )}
                          {r.photos && r.photos.length > 0 && (
                            <div className="mt-3 flex gap-2 overflow-x-auto">
                              {r.photos.map((p: string, i: number) => {
                                const url = reviewMediaUrl(p);
                                return url ? (
                                  <div
                                    key={i}
                                    className="relative w-24 h-24 rounded overflow-hidden border flex-shrink-0"
                                  >
                                    <Image
                                      src={url}
                                      alt={`review photo ${i + 1}`}
                                      fill
                                      className="object-cover"
                                    />
                                  </div>
                                ) : null;
                              })}
                            </div>
                          )}

                          <div className="mt-3 flex items-center gap-3">
                            {userId === r.user_id && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingReview(r as ReviewWithPhotos);
                                    setShowReviewDialog(true);
                                  }}
                                >
                                  <Edit3 className="h-4 w-4 mr-2" /> Edit
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteReview(r.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </Button>
                              </>
                            )}

                            {isAdmin && (
                              <>
                                {r.status === "published" ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      adminSetStatus(r.id, "hidden")
                                    }
                                  >
                                    <EyeOff className="h-4 w-4 mr-2" /> Hide
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      adminSetStatus(r.id, "published")
                                    }
                                  >
                                    <Eye className="h-4 w-4 mr-2" /> Publish
                                  </Button>
                                )}
                              </>
                            )}
                          </div>

                          <div className="mt-3 flex items-center gap-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => voteHelpful(r.id, true)}
                              className={
                                helpfulVoted[r.id]
                                  ? "border-green-500 text-green-700"
                                  : ""
                              }
                            >
                              <ThumbsUp className="h-4 w-4 mr-2" />
                              Helpful · {r.helpful_count}
                            </Button>
                            {r.is_verified_purchase && (
                              <Badge variant="secondary" className="text-xs">
                                Verified purchase
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                      {reviews.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No reviews yet. Be the first to write one!
                        </p>
                      )}
                    </div>

                    {reviewStats &&
                      reviews.length < reviewStats.rating_count && (
                        <div className="text-center">
                          <Button
                            onClick={() => {
                              setReviewPage((p) => p + 1);
                              fetchReviews(false);
                            }}
                            disabled={loadingReviews}
                          >
                            {loadingReviews ? "Loading..." : "Load more"}
                          </Button>
                        </div>
                      )}
                  </div>
                </ProductInfoAccordionSection>
              </div>
            )}

            {/* RELATED (unchanged) */}
            {related.length > 0 && (
              <div className="mt-12">
                <h2 className="text-2xl font-bold mb-6">Related Products</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {related.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={
                        {
                          ...p,
                          hero_image_path: p.hero_image_path ?? undefined,
                          hero_image_url:
                            storagePublicUrl(p.hero_image_path) ?? undefined,
                          brands: p.brands ?? undefined,
                        } as any
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ZOOM DIALOG (unchanged) */}
      <Dialog open={showZoom} onOpenChange={setShowZoom}>
        <DialogContent className="max-w-4xl w-full p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Product Image</DialogTitle>
          </DialogHeader>
          <div className="relative aspect-square w-full">
            {imageUrls[selectedImage] ? (
              <Image
                src={imageUrls[selectedImage]}
                alt={product?.name || "Product image"}
                fill
                className="object-contain"
              />
            ) : (
              <div className="w-full h-full bg-muted" />
            )}
          </div>
          {imageUrls.length > 1 && (
            <div className="p-4 grid grid-cols-6 gap-2">
              {imageUrls.map((src, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  className={`relative aspect-square rounded border-2 overflow-hidden ${
                    selectedImage === idx
                      ? "border-primary"
                      : "border-transparent"
                  }`}
                >
                  <Image
                    src={src}
                    alt={`Thumb ${idx + 1}`}
                    fill
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showShare} onOpenChange={setShowShare}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share this product</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Button asChild variant="outline">
                <a
                  href={shareLinks.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={shareLinks.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4 mr-2" /> Telegram
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={shareLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4 mr-2" /> X / Twitter
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={shareLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4 mr-2" /> Facebook
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={shareLinks.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4 mr-2" /> LinkedIn
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={shareLinks.email}>
                  <Mail className="h-4 w-4 mr-2" /> Email
                </a>
              </Button>
            </div>

            <Separator />

            <div className="flex gap-2 items-center">
              <Input readOnly value={shareUrl} className="text-xs" />
              <Button variant="secondary" onClick={copyLink}>
                <Copy className="h-4 w-4 mr-2" /> Copy
              </Button>
            </div>

            <div className="flex items-center text-xs text-muted-foreground">
              <LinkIcon className="h-3 w-3 mr-1" />
              Sharing the current page URL
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* WRITE REVIEW DIALOG */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Write a Review</DialogTitle>
          </DialogHeader>
          <ReviewForm
            onCancel={() => setShowReviewDialog(false)}
            onSubmit={(data) => submitReview(data)}
          />
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}

/* --------- Small review form component --------- */
function ReviewForm(props: {
  onSubmit: (v: {
    rating: number;
    title: string;
    body: string;
    photos: string[];
  }) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]); // storage paths
  const [previews, setPreviews] = useState<string[]>([]); // public URLs for UI

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const paths: string[] = [];
    const urls: string[] = [];
    for (const f of Array.from(files).slice(0, 6 - photos.length)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 4 * 1024 * 1024) {
        toast.error("Each image must be ≤ 4 MB");
        continue;
      }
      const ext = f.name.split(".").pop() || "jpg";
      const key = `uploads/${randomKey()}.${ext}`;
      const { error } = await supabase.storage
        .from("review-media")
        .upload(key, f, { upsert: false, contentType: f.type });
      if (!error) {
        paths.push(key);
        const url = reviewMediaUrl(key);
        if (url) urls.push(url);
      } else {
        toast.error("Failed to upload image");
      }
    }
    setPhotos((p) => [...p, ...paths]);
    setPreviews((p) => [...p, ...urls]);
    setUploading(false);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!rating) return;
        if (submitting) return;
        try {
          setSubmitting(true);
          await props.onSubmit({ rating, title, body, photos });
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div>
        <Label className="mb-1 block">Your rating</Label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i)}
              className="p-1"
              aria-label={`${i} star`}
              title={`${i} star`}
            >
              <Star
                className={`h-6 w-6 ${
                  i <= rating
                    ? "fill-yellow-400 text-yellow-500"
                    : "text-muted-foreground"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="review-title" className="mb-1 block">
          Title (optional)
        </Label>
        <Input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a short summary"
        />
      </div>

      <div>
        <Label htmlFor="review-body" className="mb-1 block">
          Your review
        </Label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full border rounded-md p-2 text-sm min-h-[120px] bg-background"
          placeholder="Describe your experience with the product"
          required
        />
      </div>

      <div>
        <Label className="mb-1 block">Photos (optional, up to 6)</Label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
        {previews.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {previews.map((u, i) => (
              <div
                key={i}
                className="relative w-20 h-20 rounded overflow-hidden border flex-shrink-0"
              >
                <Image
                  src={u}
                  alt={`preview ${i + 1}`}
                  fill
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhotos((p) => p.filter((_, idx) => idx !== i));
                    setPreviews((p) => p.filter((_, idx) => idx !== i));
                  }}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {uploading && (
          <p className="text-xs text-muted-foreground mt-1">Uploading…</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" type="button" onClick={props.onCancel} disabled={uploading || submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={uploading || submitting}>
          {submitting ? "Submitting..." : "Submit"}
        </Button>
      </div>
    </form>
  );
}
