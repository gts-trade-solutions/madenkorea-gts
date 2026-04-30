"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { ProductCard } from "@/components/ProductCard";
import { CustomerLayout } from "@/components/CustomerLayout";

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
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  stock_qty?: number | null;
  brands?: { name?: string | null } | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export default function Shop199Page() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from("products")
        .select(`
          id, slug, name,
          price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at,
          hero_image_path, is_featured, is_trending,
          short_description, volume_ml, net_weight_g, country_of_origin, stock_qty,
          brands ( name )
        `)
        .eq("is_published", true)
        .lte("sale_price", 199)
        .not("sale_price", "is", null)
        .or(`sale_starts_at.is.null,sale_starts_at.lte.${nowIso}`)
        .or(`sale_ends_at.is.null,sale_ends_at.gte.${nowIso}`)
        .order("sale_price", { ascending: true });

      if (!cancelled) {
        if (error) {
          console.error("Shop@199 fetch error:", error);
          setProducts([]);
        } else {
          const active = ((data ?? []) as Product[]).filter((p) =>
            isSaleActive(p.sale_starts_at, p.sale_ends_at)
          );
          setProducts(active);
        }
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CustomerLayout>
    <div className="container mx-auto py-10">
      <h1 className="mb-2 text-3xl font-bold uppercase">Shop@199</h1>
      <p className="mb-8 text-sm text-muted-foreground">
       Grab the glow before the deals are gone
      </p>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[0.8] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-muted-foreground">No deals under ₹199 right now.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
