import type { Metadata } from "next";
import Link from "next/link";
import { Truck, RotateCcw, Shield, Package, Lock, CreditCard, BadgeCheck } from "lucide-react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { getShippingConfig } from "@/lib/storeSettings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shipping, Returns & Trust | MadenKorea",
  description:
    "How MadenKorea ships, accepts returns, secures payments, and guarantees authentic Korean products.",
  alternates: { canonical: "https://madenkorea.com/policies/shipping-returns" },
  robots: { index: true, follow: true },
};

const SECTIONS = [
  { id: "free-shipping", label: "Free Shipping", Icon: Truck },
  { id: "easy-returns", label: "Easy Returns", Icon: RotateCcw },
  { id: "secure-payment", label: "Secure Payment", Icon: Shield },
  { id: "authentic-products", label: "Authentic Products", Icon: Package },
] as const;

export default async function ShippingReturnsPage() {
  const config = await getShippingConfig();
  const threshold = config.deliveryThreshold;
  const fee = config.defaultShippingFee;
  const thresholdLabel = `₹${threshold.toLocaleString("en-IN")}`;
  const feeLabel = `₹${fee.toLocaleString("en-IN")}`;

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-3">Shipping, Returns & Trust</h1>
          <p className="text-muted-foreground mb-8">
            Everything you need to know about how we ship, how returns work, how your payments stay
            safe, and why every product on MadenKorea is the real thing.
          </p>

          {/* Quick-jump nav. Anchors here match the hash links from the product page. */}
          <nav className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
            {SECTIONS.map(({ id, label, Icon }) => (
              <Link
                key={id}
                href={`#${id}`}
                className="flex items-center gap-2 rounded-lg border bg-background p-3 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {label}
              </Link>
            ))}
          </nav>

          <section id="free-shipping" className="scroll-mt-24 mb-10">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <Truck className="h-5 w-5" />
                  </div>
                  <h2 className="text-2xl font-semibold">Free Shipping</h2>
                </div>
                <p className="text-muted-foreground">
                  We deliver across India. Shipping is <strong>free on every order above {thresholdLabel}</strong>.
                  Orders below that ship at a flat <strong>{feeLabel}</strong> per order — the
                  fee shown at checkout is the only one you pay, with no hidden surcharges.
                </p>
                <p className="text-muted-foreground">
                  K Plus members get <strong>free shipping on every order, regardless of cart value</strong>.
                  See the <Link href="/k-plus" className="underline">K Plus benefits</Link> for the
                  full list.
                </p>
                <p className="text-muted-foreground">
                  Estimated delivery times depend on your pincode. Enter yours in the
                  &ldquo;Check Delivery&rdquo; box on any product page to see the exact window
                  &mdash; from <strong>1&ndash;3 days</strong> in Chennai metro up to{" "}
                  <strong>10&ndash;15 days</strong> for the islands.
                </p>
              </CardContent>
            </Card>
          </section>

          <section id="easy-returns" className="scroll-mt-24 mb-10">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                  <h2 className="text-2xl font-semibold">Easy Returns</h2>
                </div>
                <p className="text-muted-foreground">
                  You have <strong>7 days from delivery</strong> to raise a return if your item
                  arrives damaged, defective, or wrong. We&apos;ll arrange a pickup from your
                  registered address and refund you to the original payment method once the item
                  is back with us.
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                  <li>Items must be unused, in their original packaging, with all seals intact.</li>
                  <li>
                    Skincare and personal-care products that have been opened cannot be returned
                    for hygiene reasons unless they were damaged or defective on arrival.
                  </li>
                  <li>
                    To start a return, head to{" "}
                    <Link href="/account" className="underline">
                      My Account &rarr; Orders
                    </Link>{" "}
                    and pick the order, or email{" "}
                    <a href="mailto:info@madenkorea.com" className="underline">
                      info@madenkorea.com
                    </a>
                    .
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          <section id="secure-payment" className="scroll-mt-24 mb-10">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <Shield className="h-5 w-5" />
                  </div>
                  <h2 className="text-2xl font-semibold">Secure Payment</h2>
                </div>
                <p className="text-muted-foreground">
                  All payments on MadenKorea are processed by <strong>Razorpay</strong>, a
                  PCI-DSS Level 1 certified payment gateway. Your card, UPI, netbanking, and
                  wallet details are encrypted in transit and never touch our servers.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex items-start gap-2 rounded-md border p-3">
                    <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">256-bit TLS encryption</p>
                      <p className="text-xs text-muted-foreground">
                        Every payment request is encrypted end-to-end.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-md border p-3">
                    <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Cards, UPI, Netbanking, Wallets</p>
                      <p className="text-xs text-muted-foreground">
                        Pay with what works for you.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-md border p-3">
                    <BadgeCheck className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">No card details stored</p>
                      <p className="text-xs text-muted-foreground">
                        We never see or save your payment credentials.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="pt-2">
                  <a
                    href="https://razorpay.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <Shield className="h-4 w-4" />
                    <span className="inline-flex items-center gap-1.5">
                      Payments secured by
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/razorpay-logo.svg"
                        alt="Razorpay"
                        className="h-4 w-auto inline-block"
                      />
                    </span>
                  </a>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="authentic-products" className="scroll-mt-24 mb-10">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <Package className="h-5 w-5" />
                  </div>
                  <h2 className="text-2xl font-semibold">Authentic Products</h2>
                </div>
                <p className="text-muted-foreground">
                  Every product on MadenKorea is sourced directly from the brand or its authorised
                  distributor in Korea. We do not stock from grey-market resellers, and we do not
                  re-pack products before they reach you.
                </p>
                <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                  <li>Original Korean packaging and barcodes on every unit.</li>
                  <li>
                    Manufacturing and expiry dates are checked at intake; near-expiry stock is
                    never shipped.
                  </li>
                  <li>
                    If you ever suspect a product isn&apos;t authentic, email us at{" "}
                    <a href="mailto:info@madenkorea.com" className="underline">
                      info@madenkorea.com
                    </a>{" "}
                    and we&apos;ll investigate and replace or refund &mdash; no questions asked.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </section>

          <p className="text-sm text-muted-foreground">
            Questions? Reach us at{" "}
            <a href="mailto:info@madenkorea.com" className="underline">
              info@madenkorea.com
            </a>
            .
          </p>
        </div>
      </div>
    </CustomerLayout>
  );
}
