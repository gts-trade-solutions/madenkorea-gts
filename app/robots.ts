// app/robots.ts
import type { MetadataRoute } from 'next';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://madenkorea.com').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  const isProd =
    process.env.NODE_ENV === 'production' &&
    (!process.env.VERCEL || process.env.VERCEL_ENV === 'production');

  // Block crawling on previews by default; open in prod
  const rules = isProd
    ? {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/account/',
          '/cart',
          '/checkout/',        // adjust to your routes
          '/search?',          // avoid crawling search results
          '/_next/', '/static/', '/internal/',
        ],
      }
    : {
        userAgent: '*',
        allow: [],
        disallow: ['/', '/'],
      };

  return {
    rules,
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
