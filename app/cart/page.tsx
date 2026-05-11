"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, ShoppingBag, Tag, Check, X, Loader2 } from "lucide-react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/contexts/CartContext";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { InternationalOrderModal } from "@/components/InternationalOrderModal";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  computeShippingFee,
  shippingMessage,
  hasActiveMembership,
  getActiveMembership,
  type MembershipRow,
} from "@/lib/membership";
import { useShippingConfig } from "@/lib/hooks/useShippingConfig";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import Image from "next/image";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  is_published?: boolean | null;
  price: number | null;
  currency: string | null;
  compare_at_price: number | null;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  hero_image_path: string | null;
  brands?: { name?: string | null } | null;
  hero_image_url?: string | null;
};

type CartLine = { product_id: string; qty: number };

type TotalsResponse = null | {
  ok: true;
  currency: string;
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
  commission_total: number;
  applied: null | {
    type: "promo";
    code: string;
    scope: "global" | "product";
    influencer_id: string;
  };
  lines: Array<{
    product_id: string;
    qty: number;
    unit_price: number;
    line_subtotal: number;
    promo_applied: boolean;
    effective_user_discount_pct: number;
    effective_commission_pct: number;
    line_discount: number;
    line_commission: number;
  }>;
};

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("product-media").getPublicUrl(path);
  return data.publicUrl ?? null;
}

function isSaleActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function effectiveUnitPrice(p: ProductRow) {
  const saleOk =
    p.sale_price != null && isSaleActive(p.sale_starts_at, p.sale_ends_at);
  return saleOk && p.sale_price != null ? p.sale_price : (p.price ?? 0);
}

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return "";
  const code = (currency ?? "INR").toUpperCase();
  if (code === "INR") return `₹${v.toLocaleString("en-IN")}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(v);
  } catch {
    return `${code} ${v.toLocaleString()}`;
  }
}

export default function CartPage() {
  const router = useRouter();
  const { ready: cartReady, loading, items, setQty, removeItem } = useCart();
  const { isAuthenticated } = useAuth();
  const shippingConfig = useShippingConfig();
  const { formatPrice, isINR } = useCurrency();

  const [membership, setMembership] = useState<MembershipRow | null>(null);
  // International order request modal — opened by the Checkout button
  // when the visitor isn't on INR. Indian visitors never see this.
  const [showIntlModal, setShowIntlModal] = useState(false);

  const [guestProducts, setGuestProducts] = useState<
    Record<string, ProductRow>
  >({});

  const [promoCode, setPromoCode] = useState("");
  const [applyingPromo, startApplyingPromo] = useTransition();

  const [totals, setTotals] = useState<TotalsResponse>(null);
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [qtyUpdating, setQtyUpdating] = useState<Record<string, boolean>>({});
  const [removing, setRemoving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadMembership() {
      try {
        if (!isAuthenticated) {
          setMembership(null);
          return;
        }

        const { data } = await supabase.auth.getUser();
        const userId = data.user?.id;

        if (!userId) {
          if (!cancelled) setMembership(null);
          return;
        }

        const membershipRow = await getActiveMembership(userId);

        if (!cancelled) {
          setMembership(membershipRow ?? null);
        }
      } catch (error) {
        console.error("Cart membership load error:", error);
        if (!cancelled) setMembership(null);
      }
    }

    loadMembership();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!cartReady) return;
    const ids = Array.from(new Set(items.map((i) => i.product_id)));
    if (ids.length === 0) {
      setGuestProducts({});
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          `
          id, slug, name, price, currency,
          is_published,
          compare_at_price, sale_price, sale_starts_at, sale_ends_at,
          hero_image_path, brands(name)
        `,
        )
        .in("id", ids);

      if (error) {
        console.error(error);
        setGuestProducts({});
        return;
      }

      const map: Record<string, ProductRow> = {};
      (data ?? []).forEach((p: any) => {
        map[p.id] = {
          ...p,
          hero_image_url: storagePublicUrl(p.hero_image_path),
        };
      });

      setGuestProducts(map);
    })();
  }, [cartReady, items]);

  const rows = useMemo(() => {
    return items
      .map((it) => {
        const p: ProductRow | undefined = (it as any).product
          ? {
              ...(it as any).product,
              hero_image_url: storagePublicUrl(
                (it as any).product.hero_image_path,
              ),
            }
          : guestProducts[it.product_id];

        if (!p) {
          return {
            id: it.id,
            productId: it.product_id,
            quantity: it.quantity,
            product: {
              id: it.product_id,
              slug: "",
              name: "No longer available",
              price: null,
              currency: "INR",
              compare_at_price: null,
              sale_price: null,
              sale_starts_at: null,
              sale_ends_at: null,
              hero_image_path: null,
            } as ProductRow,
            unitPrice: 0,
            lineTotal: 0,
            mrp: null,
            unavailable: true,
          };
        }

        const unavailable = p.is_published === false;
        const unit = unavailable ? 0 : effectiveUnitPrice(p);
        const line = unit * it.quantity;
        const mrp =
          p.compare_at_price && p.compare_at_price > unit
            ? p.compare_at_price
            : null;

        return {
          id: it.id,
          productId: it.product_id,
          quantity: it.quantity,
          product: p,
          unitPrice: unit,
          lineTotal: line,
          mrp,
          unavailable,
        };
      })
      .filter(Boolean) as {
      id: string;
      productId: string;
      quantity: number;
      product: ProductRow;
      unitPrice: number;
      lineTotal: number;
      mrp: number | null;
      unavailable: boolean;
    }[];
  }, [items, guestProducts]);

  const unavailableCount = rows.filter((r) => r.unavailable).length;
  const availableRows = rows.filter((r) => !r.unavailable);

  const baseSubtotal = rows.reduce((acc, r) => acc + r.lineTotal, 0);

  const shippingFee = computeShippingFee(baseSubtotal, membership, shippingConfig);

  const qtySig = useMemo(
    () =>
      rows
        .map((r) => `${r.productId}:${r.quantity}`)
        .sort()
        .join("|"),
    [rows],
  );

async function recalcTotals() {
  if (rows.length === 0 || availableRows.length === 0) {
    setTotals(null);
    return;
  }

  setLoadingTotals(true);

  try {
    const res = await fetch("/api/checkout/calc-totals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        lines: availableRows.map((r) => ({
          product_id: r.productId,
          qty: r.quantity,
        })),
        shippingFee,
      }),
    });

    const data = (await res.json()) as TotalsResponse & { error?: string };

    if (!res.ok || !data || (data as any).ok === false) {
      throw new Error((data as any)?.error || "Failed to calculate totals");
    }

    setTotals(data);
  } catch (e: any) {
    console.error(e);
    toast.error("Failed to calculate totals");
    setTotals(null);
  } finally {
    setLoadingTotals(false);
  }
}

  useEffect(() => {
    void recalcTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtySig, shippingFee, availableRows.length]);

async function clearPromo() {
  const res = await fetch("/api/promo/clear", {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    toast.error("Could not remove promo");
    return;
  }

  toast.info("Promo removed");
  await recalcTotals();
}

  const updateQty = async (rowId: string, nextQty: number) => {
    if (qtyUpdating[rowId]) return;
    setQtyUpdating((prev) => ({ ...prev, [rowId]: true }));
    try {
      await setQty(rowId, nextQty);
    } finally {
      setQtyUpdating((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const removeLine = async (rowId: string) => {
    if (removing[rowId]) return;
    if (!window.confirm("Remove this item from cart?")) return;
    setRemoving((prev) => ({ ...prev, [rowId]: true }));
    try {
      await removeItem(rowId);
      toast.success("Item removed");
    } finally {
      setRemoving((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  function onApplyPromo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    startApplyingPromo(async () => {
      try {
        const res = await fetch("/api/promo/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        });
        const j = await res.json();
        if (!res.ok || !j?.ok) throw new Error(j?.error || "Invalid code");
        toast.success(`Promo applied: ${j?.promo?.code || code}`);
        setPromoCode("");
        await recalcTotals();
      } catch (err: any) {
        toast.error(err?.message || "Could not apply promo");
      }
    });
  }

  if (!cartReady || loading) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16 text-muted-foreground">
          Loading cart…
        </div>
      </CustomerLayout>
    );
  }

  if (rows.length === 0) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto text-center">
            <CardHeader>
              <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <CardTitle>Your cart is empty</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Looks like you haven&apos;t added anything to your cart yet.
              </p>
              <Button asChild>
                <Link href="/">Continue Shopping</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  const displayCurrency = totals?.currency || "INR";
  const displaySubtotal = totals?.subtotal ?? baseSubtotal;
  const displayShipping = totals?.shipping_fee ?? shippingFee;
  const displayDiscount = totals?.discount_total ?? 0;
  const displayTotal =
    totals?.total ?? Math.max(0, baseSubtotal + shippingFee - displayDiscount);

  const promoActive = totals?.applied?.type === "promo";
  const membershipActive = hasActiveMembership(membership);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">
          Shopping Cart ({rows.reduce((n, r) => n + r.quantity, 0)} items)
        </h1>
        {unavailableCount > 0 && (
          <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
            {unavailableCount} item{unavailableCount === 1 ? "" : "s"} in your cart {unavailableCount === 1 ? "is" : "are"} no longer available and excluded from totals.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {rows.map((row) => {
              const p = row.product;

              return (
                <Card key={row.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 flex items-start gap-3 sm:gap-4">
                        <Link
                          href={p.slug ? `/products/${p.slug}` : "#"}
                          className="block h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border bg-muted"
                        >
                          {p.hero_image_url ? (
                            <Image
                              src={p.hero_image_url}
                              alt={p.name ?? "Product image"}
                              width={80}
                              height={80}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              No image
                            </div>
                          )}
                        </Link>

                        <div className="min-w-0">
                          <Link
                            href={p.slug ? `/products/${p.slug}` : "#"}
                            className="hover:text-primary"
                          >
                            <h3 className="font-semibold mb-1 line-clamp-2">
                              {p.name}
                            </h3>
                          </Link>
                          {row.unavailable && (
                            <p className="text-xs text-orange-700">This item is no longer available. Please remove it to continue.</p>
                          )}
                          {p.brands?.name && (
                            <p className="text-sm text-muted-foreground mb-1">
                              {p.brands.name}
                            </p>
                          )}
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold">
                              {row.unavailable ? "—" : formatPrice(row.unitPrice)}
                            </span>
                            {row.mrp && (
                              <span className="text-sm text-muted-foreground line-through">
                                {formatPrice(row.mrp)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div className="flex items-center border rounded-lg">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateQty(row.id, Math.max(0, row.quantity - 1))}
                            disabled={row.unavailable || qtyUpdating[row.id] || removing[row.id]}
                          >
                            -
                          </Button>
                          <span className="px-3 py-1 min-w-[2.5rem] text-center">
                            {row.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateQty(row.id, row.quantity + 1)}
                            disabled={row.unavailable || qtyUpdating[row.id] || removing[row.id]}
                          >
                            +
                          </Button>
                        </div>

                        <p className="font-semibold whitespace-nowrap">
                          {formatPrice(row.lineTotal)}
                        </p>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(row.id)}
                          title="Remove"
                          disabled={removing[row.id] || qtyUpdating[row.id]}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="lg:col-span-1">
            <Card className="lg:sticky lg:top-20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>Order Summary</span>
                  {loadingTotals && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent
                className={`space-y-4 transition-opacity ${
                  loadingTotals ? "opacity-70" : "opacity-100"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Have a promo code?
                    </span>
                  </div>

                  {!promoActive ? (
                    <form onSubmit={onApplyPromo} className="flex gap-2">
                      <Input
                        placeholder="Enter promo code"
                        value={promoCode}
                        onChange={(e) =>
                          setPromoCode(e.target.value.toUpperCase())
                        }
                        disabled={applyingPromo}
                        className="uppercase"
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={applyingPromo || !promoCode.trim()}
                      >
                        {applyingPromo ? "Applying…" : "Apply"}
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            Promo applied: {totals?.applied?.code}
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300">
                            {totals?.applied?.scope === "global"
                              ? "Global (cart-wide)"
                              : "Product-specific"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={clearPromo}
                        className="h-8 w-8"
                        title="Remove promo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold">
                    {formatPrice(displaySubtotal)}
                  </span>
                </div>

                {displayDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span className="font-semibold">
                      -{formatPrice(displayDiscount)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-semibold">
                    {!isINR
                      ? "Quoted on request"
                      : displayShipping === 0
                      ? "FREE"
                      : formatPrice(displayShipping)}
                  </span>
                </div>

                {/* Shipping copy is India-specific (free above threshold,
                    K Plus benefit). For international visitors, shipping
                    is quoted manually when they submit the order request. */}
                {isINR && membershipActive ? (
                  <p className="text-sm text-muted-foreground">
                    {shippingMessage(displaySubtotal, membership, shippingConfig)}
                  </p>
                ) : isINR && displaySubtotal < shippingConfig.deliveryThreshold ? (
                  <p className="text-sm text-muted-foreground">
                    Add{" "}
                    {formatPrice(
                      shippingConfig.deliveryThreshold - displaySubtotal,
                    )}{" "}
                    more for FREE shipping
                  </p>
                ) : isINR ? (
                  <p className="text-sm text-muted-foreground">
                    {shippingMessage(displaySubtotal, membership, shippingConfig)}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    International shipping is quoted when our team responds to
                    your order request.
                  </p>
                )}

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatPrice(displayTotal)}</span>
                </div>
                {loadingTotals && (
                  <p className="text-xs text-muted-foreground">Updating totals...</p>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <Button
                  className="w-full"
                  size="lg"
                  disabled={unavailableCount > 0 || availableRows.length === 0}
                  onClick={() => {
                    if (unavailableCount > 0 || availableRows.length === 0) {
                      return;
                    }
                    // Non-INR: open the international order request
                    // modal. Razorpay isn't wired for non-INR billing,
                    // and DTDC doesn't ship outside India, so we route
                    // these visitors through the manual fulfilment
                    // pipeline.
                    if (!isINR) {
                      setShowIntlModal(true);
                      return;
                    }
                    if (!isAuthenticated) {
                      toast.message("Sign in to continue", {
                        description: "Your cart will be preserved.",
                        action: {
                          label: "Sign in",
                          onClick: () => router.push("/auth/login?redirect=/checkout"),
                        },
                      });
                      return;
                    }
                    router.push("/checkout");
                  }}
                >
                  {isINR ? "Proceed to Checkout" : "Request International Order"}
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">Continue Shopping</Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>

      {/* International order request modal — only opened for non-INR
          visitors via the Checkout button above. The modal holds its
          own form state; we just pass the cart snapshot in. */}
      <InternationalOrderModal
        open={showIntlModal}
        onOpenChange={setShowIntlModal}
        cart={availableRows.map((r) => ({
          product_id: r.productId,
          name: r.product.name ?? "Product",
          // ProductRow doesn't carry sku in this page's local type —
          // it's only fetched for ops display elsewhere. Omit until
          // we extend the cart row shape.
          sku: null,
          quantity: r.quantity,
          unit_price_inr: r.unitPrice,
          hero_image_url: r.product.hero_image_url ?? null,
        }))}
        subtotalInr={baseSubtotal}
      />
    </CustomerLayout>
  );
}
