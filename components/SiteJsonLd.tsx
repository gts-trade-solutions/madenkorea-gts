// Sitewide structured data — Organization + WebSite. Emitted once per
// page via `app/layout.tsx`. Two distinct schemas are bundled into a
// single `@graph` array so we render only one `<script>` tag.
//
//  - Organization: tells Google who runs the domain. Drives the
//    Knowledge-panel + sitelinks + favicon SERP treatment, and connects
//    the domain to its social profiles via `sameAs`.
//  - WebSite + SearchAction: makes Google eligible to render the
//    sitelinks search box for branded queries.
//
// Social URLs are hardcoded here to mirror what the footer renders. If
// the footer URLs change, update both. (Could be lifted into a shared
// constant later — for now the duplication is small and explicit.)

const SITE = "https://madenkorea.com";

const organization = {
  "@type": "Organization",
  "@id": `${SITE}#organization`,
  name: "MadenKorea",
  alternateName: "Maden Korea",
  url: SITE,
  logo: `${SITE}/logo-md.png`,
  // Social profiles — keep in sync with components/Footer.tsx.
  sameAs: [
    "https://www.facebook.com/profile.php?id=61582921345960",
    "https://www.instagram.com/madenkorea_/",
    "https://www.youtube.com/channel/UChrgxiWdyhQpt-RICbWjfbg",
    "https://www.threads.com/@madenkorea_",
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "info@madenkorea.com",
      telephone: "+91-9384857587",
      availableLanguage: ["English", "Hindi"],
      areaServed: "IN",
    },
  ],
};

const website = {
  "@type": "WebSite",
  "@id": `${SITE}#website`,
  name: "MadenKorea",
  url: SITE,
  publisher: { "@id": `${SITE}#organization` },
  inLanguage: "en-IN",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE}/search?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

const graph = {
  "@context": "https://schema.org",
  "@graph": [organization, website],
};

export function SiteJsonLd() {
  return (
    <script
      type="application/ld+json"
      // Server-rendered, no user input — safe to inline as JSON. Use
      // dangerouslySetInnerHTML so React doesn't escape the curly
      // braces and break the JSON parser.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
