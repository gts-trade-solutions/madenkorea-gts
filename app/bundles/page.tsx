"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ProductCard } from "@/components/ProductCard";
import { CustomerLayout } from "@/components/CustomerLayout";

// A bundle is just a product with `is_bundle = true`. Same schema, same
// pricing, same stock. This page is the "Bundles" landing surface — every
// published product flagged as a bundle, newest first.
type Product = {
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
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  is_bundle?: boolean | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  stock_qty?: number | null;
  brands?: { name?: string | null } | null;
};

export default function BundlesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("products")
        .select(`
          id, slug, name,
          price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at,
          hero_image_path, is_featured, is_trending, is_bundle,
          short_description, volume_ml, net_weight_g, country_of_origin, stock_qty,
          brands ( name )
        `)
        .eq("is_published", true)
        .eq("is_bundle", true)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Bundles fetch error:", error);
        setProducts([]);
      } else {
        setProducts((data ?? []) as Product[]);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-10">
        <h1 className="mb-2 text-3xl font-bold uppercase">Bundles</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Hand-picked sets that pair our favourite products at a sharper price.
        </p>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[0.8] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-muted-foreground">
            We&apos;re putting together our next bundle. Check back soon.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={{
                  ...product,
                  hero_image_path: product.hero_image_path ?? undefined,
                  brands: product.brands ?? undefined,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
