import { CustomerLayout } from "@/components/CustomerLayout";
import { PolicyHero } from "@/components/PolicyHero";
import { PolicyCta } from "@/components/PolicyLayout";
import { Button } from "@/components/ui/button";
import {
  Award,
  Building2,
  Globe,
  Heart,
  Quote,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getBusinessInfo } from "@/lib/businessInfo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About MadenKorea | MadenKorea",
  description:
    "Learn about MadenKorea—your trusted source for authentic Korean beauty and lifestyle products in India. Premium quality, global reach, customer-first service, and 100% authenticity.",
  alternates: {
    canonical: "https://madenkorea.com/about",
  },
  robots: { index: true, follow: true },
  keywords: [
    "MadenKorea",
    "About us",
    "Korean beauty",
    "K-beauty",
    "authentic products",
    "consumer innovations",
    "India shipping",
  ],
  openGraph: {
    type: "website",
    url: "https://madenkorea.com/about",
    siteName: "MadenKorea",
    title: "About MadenKorea",
    description:
      "Our story, values, and commitment to 100% authentic Korean products.",
    images: [
      {
        url: "/square-logo.png",
        width: 1200,
        height: 630,
        alt: "About MadenKorea",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About MadenKorea",
    description:
      "Our story, values, and commitment to 100% authentic Korean products.",
    images: ["/square-logo.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  other: {
    "format-detection": "telephone=no, address=no, email=no",
  },
};

const VALUES = [
  {
    Icon: Award,
    title: "Premium quality",
    body: "Carefully curated and sourced from trusted Korean brands. We don't stock anything we wouldn't put on our own face.",
  },
  {
    Icon: Globe,
    title: "Pan-India reach",
    body: "Reliable doorstep delivery from Chennai metro to the islands, with transparent ETAs at the pincode level.",
  },
  {
    Icon: Heart,
    title: "Customer-first",
    body: "Hassle-free returns, real human support, and personalised K-beauty recommendations when you ask.",
  },
  {
    Icon: ShieldCheck,
    title: "100% authentic",
    body: "Sourced direct from brands or authorised distributors in Korea. No grey market, no surprises.",
  },
];

export default async function AboutPage() {
  const business = await getBusinessInfo();
  const hasCompanyDetails =
    Boolean(business.legalEntityName) ||
    Boolean(business.registeredAddress) ||
    Boolean(business.gstin) ||
    Boolean(business.cdscoRegistration);

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow="About us"
        title="About MadenKorea"
        description="Your trusted destination for authentic Korean beauty and lifestyle products, bringing the best of Consumer Innovations directly to your doorstep."
      />

      <div className="container mx-auto px-4 py-12 sm:py-16">
        {/* ---- Mission pull-quote ---- */}
        <section className="max-w-3xl mx-auto text-center mb-16 sm:mb-20">
          <Quote className="h-10 w-10 text-primary/40 mx-auto mb-4" aria-hidden />
          <p className="text-2xl sm:text-3xl font-medium tracking-tight leading-relaxed">
            We exist to bring authentic Korean beauty
            &mdash; <span className="text-primary">unfiltered, unrepacked, untouched</span>
            &mdash; to every doorstep in India.
          </p>
        </section>

        {/* ---- Values grid ---- */}
        <section className="max-w-5xl mx-auto mb-16 sm:mb-20">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-2">
              What we stand for
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Four things, every order
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {VALUES.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border bg-background p-6 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-full bg-primary/10 ring-1 ring-primary/20 p-2.5">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight">
                    {title}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Story ---- */}
        <section className="max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-2">
              Our story
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              How we got here
            </h2>
          </div>
          <div
            className="
              prose prose-neutral max-w-none
              prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:text-base
              prose-strong:text-foreground
              prose-headings:tracking-tight prose-headings:text-foreground
            "
          >
            <p>
              MadenKorea was founded with a simple mission: to make authentic
              Korean beauty and lifestyle products accessible to everyone in
              India. What started as a passion for K-beauty has grown into a
              trusted marketplace connecting thousands of customers with
              their favourite Korean brands.
            </p>
            <p>
              We understand the challenge of finding genuine Korean products
              locally, which is why we&apos;ve built strong partnerships with
              verified vendors and brands in Korea. Our team personally tests
              and verifies each product to ensure it meets our quality bar.
            </p>
            <p>
              We&apos;re committed to providing not just products, but a
              complete K-beauty experience. From skincare routines to makeup
              trends, we keep you updated with the latest from Korea&apos;s
              beauty industry. Our blog and social channels share tips,
              tutorials, and insights to help you make the most of your
              purchases.
            </p>
            <p>
              Join thousands of satisfied customers who trust MadenKorea for
              their K-beauty essentials. Experience the difference of
              authentic Korean products today.
            </p>
          </div>
        </section>

        {/* ---- Why choose us list ---- */}
        <section className="max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-2">
              Why choose us
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              The promise we make
            </h2>
          </div>
          <ul className="space-y-4">
            {[
              {
                t: "Authenticity guaranteed",
                d: "Direct sourcing from Korea ensures 100% genuine products, every time.",
              },
              {
                t: "Curated selection",
                d: "Hand-picked products from the best K-beauty brands, not an algorithmic dump.",
              },
              {
                t: "Honest pricing",
                d: "Best prices without compromising on quality. No hidden surcharges at checkout.",
              },
              {
                t: "Fast, reliable shipping",
                d: "Quick delivery across India with real tracking and pincode-aware ETAs.",
              },
              {
                t: "Real human support",
                d: "Beauty experts ready to help with product recommendations &mdash; over email or WhatsApp.",
              },
            ].map(({ t, d }) => (
              <li key={t} className="flex gap-4">
                <div className="mt-1 flex-shrink-0 rounded-full bg-primary/10 p-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{t}</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {d}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Company information (statutory) ---- */}
        {hasCompanyDetails && (
          <section className="max-w-4xl mx-auto mt-16 pt-10 border-t">
            <div className="flex items-center gap-3 mb-6">
              <div className="rounded-full bg-primary/10 ring-1 ring-primary/20 p-2.5">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Company information
              </h2>
            </div>
            <dl className="grid gap-5 sm:grid-cols-2 text-sm">
              {business.legalEntityName && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Legal entity
                  </dt>
                  <dd className="font-medium">{business.legalEntityName}</dd>
                </div>
              )}
              {business.registeredAddress && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Registered office
                  </dt>
                  <dd className="text-muted-foreground whitespace-pre-line">
                    {business.registeredAddress}
                  </dd>
                </div>
              )}
              {business.gstin && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    GSTIN
                  </dt>
                  <dd className="font-mono">{business.gstin}</dd>
                </div>
              )}
              {business.cdscoRegistration && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    CDSCO registration
                  </dt>
                  <dd className="font-mono">{business.cdscoRegistration}</dd>
                </div>
              )}
            </dl>
            <p className="mt-6 text-sm text-muted-foreground">
              Customer support and Grievance Officer contact details are on
              our <Link href="/contact" className="underline">Contact page</Link>.
            </p>
          </section>
        )}

        {/* ---- CTA ---- */}
        <div className="max-w-4xl mx-auto">
          <PolicyCta supportEmail={business.supportEmail} />
        </div>
      </div>
    </CustomerLayout>
  );
}
