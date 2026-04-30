import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyProductPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    } else if (typeof value === "string") {
      qs.append(key, value);
    }
  }
  const suffix = qs.toString();
  redirect(`/products/${params.slug}${suffix ? `?${suffix}` : ""}`);
}
