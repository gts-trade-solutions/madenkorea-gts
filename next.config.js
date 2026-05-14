/** @type {import('next').NextConfig} */
// next.config.js
const createNextIntlPlugin = require("next-intl/plugin");
// Tells next-intl where to find getRequestConfig — our message loader.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let supabaseHost = "";
try {
  supabaseHost = new URL(supabaseUrl).hostname; // e.g. bjudxntmpfpbyloibloc.supabase.co
} catch {}

const nextConfig = {
  // Canonical URLs across the site (alternates.canonical, sitemap
  // entries, internal Links) use the no-trailing-slash form. Pinning
  // this to false makes the convention explicit and ensures Next emits
  // a 308 from `/about/` → `/about` automatically — keeping the two
  // variants from competing for ranking.
  trailingSlash: false,
  images: {
    // Pinned explicitly so the format set is visible in diffs. Next 14
    // already serves AVIF + WebP by default, but declaring it here means
    // anyone bumping Next or auditing config can see the intent without
    // chasing release notes.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  typescript: {
    // ❗️Allows production builds to successfully complete even if your project has type errors.
    ignoreBuildErrors: true,
  },
  eslint: {
    // (Optional) ignore ESLint errors during build too
    ignoreDuringBuilds: true,
  },
  // Permanent redirects from legacy URL shapes to canonical ones.
  // `permanent: true` emits HTTP 308 (the RFC-compliant permanent
  // equivalent of 307). Google treats 308 and 301 as identical for
  // link-equity consolidation, so this is the SEO-correct way to retire
  // the old `/product/<slug>` path. Query strings are preserved by
  // default for parameterised redirects.
  async redirects() {
    return [
      {
        source: "/product/:slug",
        destination: "/products/:slug",
        permanent: true,
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
