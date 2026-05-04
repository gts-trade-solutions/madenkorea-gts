"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/contexts/CartContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useRazorpayCheckout } from "@/lib/hooks/useRazorpayCheckout";
import {
  computeShippingFee,
  shippingMessage,
  hasActiveMembership,
  getActiveMembership,
  type MembershipRow,
} from "@/lib/membership";
import { useShippingConfig } from "@/lib/hooks/useShippingConfig";
import { trackEvent } from "@/lib/analytics/track";

type DbProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  hero_image_path?: string | null;
  brands?: { name?: string | null } | null;
};

type ViewLine = {
  productId: string;
  name: string;
  brand?: string | null;
  qty: number;
  currency?: string | null;
  unitPrice: number;
  unitMrpToShow?: number | null;
  lineTotal: number;
};

type CalcTotals = {
  currency: string;
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
  sale_savings?: number;
  allocations?: Record<string, number>;
  applied: null | {
    type: "promo" | "referral";
    code?: string;
    product_id?: string | null;
    discount_percent?: number;
  };
};

function isSaleActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && isNaN(s.getTime())) return false;
  if (e && isNaN(e.getTime())) return false;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function effectiveUnitPrice(p: DbProduct) {
  const saleOk =
    p.sale_price != null && isSaleActive(p.sale_starts_at, p.sale_ends_at);
  return saleOk && p.sale_price != null ? p.sale_price : p.price ?? 0;
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

export default function CheckoutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const debug = params.get("debug") === "1";

  const { items } = useCart();
  const { isAuthenticated, ready } = useAuth();
  const { start } = useRazorpayCheckout();
  const shippingConfig = useShippingConfig();

  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [dbProducts, setDbProducts] = useState<Record<string, DbProduct>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [calc, setCalc] = useState<CalcTotals | null>(null);
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [membership, setMembership] = useState<MembershipRow | null>(null);

  const totalsSeq = useRef(0);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });
  const [addressLoaded, setAddressLoaded] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) router.replace("/auth/login?redirect=/checkout");
  }, [ready, isAuthenticated, router]);

  const checkoutStartedFiredRef = useRef(false);
  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    if (items.length === 0) return;
    if (checkoutStartedFiredRef.current) return;
    checkoutStartedFiredRef.current = true;
    trackEvent("checkout_started", { item_count: items.length });
  }, [ready, isAuthenticated, items.length]);

  useEffect(() => {
    if (items.length === 0 && ready && isAuthenticated) {
      try {
        if (typeof window !== "undefined") {
          const isRedirectingToSuccess =
            sessionStorage.getItem("payment_success_redirecting") === "1";
          if (isRedirectingToSuccess) return;
        }
      } catch {}
      router.push("/cart");
    }
  }, [items.length, ready, isAuthenticated, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadMembership() {
      try {
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
        console.error("Checkout membership load error:", error);
        if (!cancelled) setMembership(null);
      }
    }

    if (ready && isAuthenticated) loadMembership();

    return () => {
      cancelled = true;
    };
  }, [ready, isAuthenticated]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (items.length === 0) return;
      setLoadingProducts(true);

      const ids = Array.from(new Set(items.map((i) => i.product_id)));

      const { data, error } = await supabase
        .from("products")
        .select(
          `
          id, slug, name,
          price, currency,
          compare_at_price, sale_price, sale_starts_at, sale_ends_at,
          hero_image_path,
          brands ( name )
        `
        )
        .in("id", ids)
        .eq("is_published", true);

      if (cancelled) return;

      if (error) {
        console.error("Load products @ checkout:", error);
        toast.error("Could not load products for checkout");
        setDbProducts({});
      } else {
        const map: Record<string, DbProduct> = {};
        (data ?? []).forEach((p) => {
          map[p.id] = p as DbProduct;
        });
        setDbProducts(map);
      }

      setLoadingProducts(false);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [items]);

  const lines: ViewLine[] = useMemo(() => {
    return items.map((it) => {
      const p = dbProducts[it.product_id];

      if (!p) {
        return {
          productId: it.product_id,
          name: "Product",
          qty: it.quantity,
          unitPrice: 0,
          lineTotal: 0,
          currency: "INR",
        };
      }

      const unit = effectiveUnitPrice(p);
      const mrpToShow =
        p.compare_at_price != null && p.compare_at_price > unit
          ? p.compare_at_price
          : null;

      return {
        productId: p.id,
        name: p.name,
        brand: p.brands?.name ?? null,
        qty: it.quantity,
        currency: p.currency ?? "INR",
        unitPrice: unit,
        unitMrpToShow: mrpToShow,
        lineTotal: unit * it.quantity,
      };
    });
  }, [items, dbProducts]);

  const localSubtotal = useMemo(
    () => lines.reduce((acc, l) => acc + l.lineTotal, 0),
    [lines]
  );

  const shippingCost = computeShippingFee(localSubtotal, membership, shippingConfig);
  const membershipActive = hasActiveMembership(membership);

  const askTotals = async (reason: string) => {
    if (items.length === 0) return;
    const mySeq = ++totalsSeq.current;

    setLoadingTotals(true);
    setCalc(null);

    const payload = {
      lines: items.map((i) => ({ product_id: i.product_id, qty: i.quantity })),
      shippingFee: shippingCost,
      explain: debug,
    };

    console.log(`[TOTALS][${mySeq}] -> POST /api/checkout/calc-totals`, {
      reason,
      payload,
    });

    try {
      const res = await fetch("/api/checkout/calc-totals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => ({}));
      console.log(`[TOTALS][${mySeq}] <-`, res.status, j);

      if (mySeq === totalsSeq.current) {
        if (res.ok && typeof j?.total === "number") {
          setCalc(j as CalcTotals);
        } else {
          setCalc(null);
        }
      } else {
        console.log(`[TOTALS][${mySeq}] (stale) ignored`);
      }
    } catch (err) {
      console.warn(`[TOTALS][${mySeq}] error`, err);
      if (mySeq === totalsSeq.current) setCalc(null);
    } finally {
      if (mySeq === totalsSeq.current) setLoadingTotals(false);
    }
  };

  useEffect(() => {
    askTotals("mount/dep-change");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, shippingCost]);

  const recalcNow = () => askTotals("manual-debug-recalc");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "phone") {
      setFormData({ ...formData, phone: value.replace(/\D/g, "").slice(0, 10) });
      return;
    }
    if (name === "pincode") {
      setFormData({ ...formData, pincode: value.replace(/\D/g, "").slice(0, 6) });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };

  useEffect(() => {
    if (!ready || !isAuthenticated || addressLoaded) return;

    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;

      const { data: addr } = await supabase
        .from("addresses")
        .select("line1, line2, city, state, pincode, country")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle();

      setFormData((prev) => ({
        ...prev,
        name: prev.name || profile?.full_name || "",
        email: prev.email || user.email || "",
        phone: prev.phone || profile?.phone || "",
        address: prev.address || addr?.line1 || "",
        city: prev.city || addr?.city || "",
        state: prev.state || addr?.state || "",
        pincode: prev.pincode || addr?.pincode || "",
      }));
      setAddressLoaded(true);
    })();
  }, [ready, isAuthenticated, addressLoaded]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();

    const phone = formData.phone.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error("Please enter a valid 10-digit phone number.");
      return;
    }

    const pincode = formData.pincode.replace(/\D/g, "");
    if (!/^\d{6}$/.test(pincode)) {
      toast.error("Please enter a valid 6-digit pincode.");
      return;
    }

    // C-04: pre-payment serviceability check. Fail-open if the
    // courier check returns undetermined / errors so we don't block
    // checkout on transient failures.
    try {
      const sres = await fetch(
        `/api/dtdc/serviceability?pincode=${encodeURIComponent(pincode)}`,
        { cache: "no-store" }
      );
      const sj = (await sres.json().catch(() => null)) as {
        ok?: boolean;
        serviceable: boolean | null;
      } | null;
      if (sres.ok && sj?.ok && sj.serviceable === false) {
        toast.error(
          `We don't deliver to ${pincode} yet. Please use a different pincode or email info@madenkorea.com.`
        );
        return;
      }
    } catch {
      // network error → fail open, let payment proceed
    }

    if (!calc) {
      toast.error("Totals not ready yet.");
      return;
    }

    setIsProcessing(true);

    trackEvent("pay_clicked", {
      subtotal: calc.subtotal,
      shipping_fee: calc.shipping_fee,
      discount_total: calc.discount_total,
      total: calc.total,
      item_count: items.length,
      promo_code: calc.applied?.code ?? null,
    });

    const addressSnapshot = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      pincode: formData.pincode,
    };

    console.log(
      "[PAY][UI] subtotal:",
      calc.subtotal,
      "shipping:",
      calc.shipping_fee,
      "discount:",
      calc.discount_total,
      "TOTAL(UI):",
      calc.total
    );

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (user) {
        const payload = {
          line1: formData.address,
          line2: null,
          city: formData.city,
          state: formData.state,
          pincode,
          country: "India",
        };

        const { data: existingDefault } = await supabase
          .from("addresses")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_default", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingDefault?.id) {
          await supabase
            .from("addresses")
            .update(payload)
            .eq("id", existingDefault.id)
            .eq("user_id", user.id);
        } else {
          await supabase
            .from("addresses")
            .insert({ user_id: user.id, is_default: true, ...payload });
        }
      }

      await start(
        addressSnapshot,
        calc?.applied ?? null,
        calc?.total ?? null,
        calc?.shipping_fee ?? shippingCost,
        () => setConfirmingPayment(true)
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (!ready) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16 text-muted-foreground">
          Loading checkout…
        </div>
      </CustomerLayout>
    );
  }

  if (!isAuthenticated || items.length === 0) return null;

  const promoText = calc?.applied?.code
    ? calc.applied.discount_percent
      ? `${calc.applied.code} • ${calc.applied.discount_percent}%`
      : calc.applied.code
    : null;

  return (
    <CustomerLayout>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />

      {confirmingPayment && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <div>
              <p className="text-lg font-semibold">Confirming your payment…</p>
              <p className="text-sm text-muted-foreground">
                Please don&apos;t close or refresh this page.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto py-8">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Checkout</h1>
          {debug && (
            <button
              onClick={recalcNow}
              className="rounded border px-3 py-1 text-xs"
              type="button"
            >
              Recalculate
            </button>
          )}
        </div>

        <form onSubmit={handlePay}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Contact & Shipping</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      autoComplete="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone *</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        inputMode="numeric"
                        pattern="[6-9][0-9]{9}"
                        title="Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9"
                        maxLength={10}
                        value={formData.phone}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="address">Address *</Label>
                    <Input
                      id="address"
                      name="address"
                      autoComplete="street-address"
                      value={formData.address}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="city">City *</Label>
                      <Input
                        id="city"
                        name="city"
                        autoComplete="address-level2"
                        value={formData.city}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State *</Label>
                      <Input
                        id="state"
                        name="state"
                        autoComplete="address-level1"
                        value={formData.state}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="pincode">Pincode *</Label>
                      <Input
                        id="pincode"
                        name="pincode"
                        value={formData.pincode}
                        onChange={handleChange}
                        autoComplete="postal-code"
                        required
                        inputMode="numeric"
                        pattern="\d{6}"
                        title="Enter a valid 6-digit pincode"
                        maxLength={6}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payment Method</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  You’ll be redirected to the Razorpay secure checkout to
                  complete your payment.
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {loadingProducts && (
                      <p className="text-sm text-muted-foreground">
                        Loading items…
                      </p>
                    )}

                    {!loadingProducts &&
                      lines.map((l) => (
                        <div
                          key={l.productId}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{l.name}</div>
                            {l.brand && (
                              <div className="text-xs text-muted-foreground">
                                {l.brand}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              Qty: {l.qty}
                            </div>
                          </div>

                          <div className="text-right">
                            <div>
                              <span className="font-semibold">
                                {formatINR(l.unitPrice, l.currency)}
                              </span>
                              {l.unitMrpToShow != null && (
                                <span className="ml-2 text-muted-foreground line-through">
                                  {formatINR(l.unitMrpToShow, l.currency)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs">
                              × {l.qty} ={" "}
                              <span className="font-medium">
                                {formatINR(l.lineTotal, l.currency)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>

                  {calc?.applied && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      Promo applied{promoText ? `: ${promoText}` : ""}. Final
                      total already includes your discount.
                    </div>
                  )}

                  <Separator />

                  {loadingTotals || !calc ? (
                    <TotalsSkeleton />
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span className="font-semibold">
                          {formatINR(calc.subtotal, "INR")}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span>
                          Shipping{" "}
                          {calc.subtotal < shippingConfig.deliveryThreshold && !membershipActive && (
                            <span className="text-xs text-muted-foreground">
                              (Free over ₹{shippingConfig.deliveryThreshold.toLocaleString("en-IN")})
                            </span>
                          )}
                        </span>
                        <span className="font-semibold">
                          {calc.shipping_fee === 0
                            ? "FREE"
                            : formatINR(calc.shipping_fee, "INR")}
                        </span>
                      </div>

                      <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-muted-foreground">
                        {shippingMessage(calc.subtotal, membership, shippingConfig)}
                      </div>

                      {calc.sale_savings && calc.sale_savings > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>You save on sale</span>
                          <span className="font-semibold">
                            {formatINR(calc.sale_savings, "INR")}
                          </span>
                        </div>
                      )}

                      {calc.discount_total > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>Promo discount</span>
                          <span className="font-semibold">
                            - {formatINR(calc.discount_total, "INR")}
                          </span>
                        </div>
                      )}

                      <Separator />

                      <div className="flex justify-between text-lg font-bold">
                        <span>Total</span>
                        <span>{formatINR(calc.total, "INR")}</span>
                      </div>

                      <Button
                        type="submit"
                        className="w-full"
                        size="lg"
                        disabled={isProcessing || loadingProducts || loadingTotals}
                      >
                        {isProcessing ? "Processing…" : "Pay with Razorpay"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {debug && (
                <DebugPanel
                  items={items}
                  calc={calc}
                  shipping={shippingCost}
                  loadingTotals={loadingTotals}
                />
              )}
            </div>
          </div>
        </form>
      </div>
    </CustomerLayout>
  );
}

function TotalsSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
      <div className="h-4 w-32 animate-pulse rounded bg-neutral-100" />
      <div className="h-4 w-28 animate-pulse rounded bg-neutral-100" />
      <div className="mt-3 h-10 w-full animate-pulse rounded bg-neutral-200" />
    </div>
  );
}

function DebugPanel({
  items,
  calc,
  shipping,
  loadingTotals,
}: {
  items: Array<{ product_id: string; quantity: number }>;
  calc: CalcTotals | null;
  shipping: number;
  loadingTotals: boolean;
}) {
  return (
    <div className="mt-4 rounded-xl border bg-white p-3 text-[11px]">
      <div className="mb-1 font-semibold">Debug</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div>Items:</div>
        <div>
          {items.map((i) => `${i.product_id}×${i.quantity}`).join(", ") || "—"}
        </div>
        <div>Shipping (UI):</div>
        <div>{shipping}</div>
        <div>loadingTotals:</div>
        <div>{String(loadingTotals)}</div>
        <div>applied:</div>
        <div>{calc?.applied ? JSON.stringify(calc.applied) : "—"}</div>
        <div>subtotal:</div>
        <div>{calc?.subtotal ?? "—"}</div>
        <div>discount_total:</div>
        <div>{calc?.discount_total ?? "—"}</div>
        <div>shipping_fee (server):</div>
        <div>{calc?.shipping_fee ?? "—"}</div>
        <div>total:</div>
        <div>{calc?.total ?? "—"}</div>
      </div>

      {calc?.allocations && (
        <>
          <div className="mt-2 font-semibold">Allocations</div>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-neutral-50 p-2">
            {JSON.stringify(calc.allocations, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
