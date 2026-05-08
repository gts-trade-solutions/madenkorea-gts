import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CustomerLayout } from '@/components/CustomerLayout';
import { ProductCard } from '@/components/ProductCard';
import { createClient } from '@supabase/supabase-js';

// Search-results pages don't add unique value to Google's index — but
// internal links on them (to actual product pages) are useful, so we
// keep follow:true.
export const metadata: Metadata = {
  title: 'Search',
  robots: { index: false, follow: true, nocache: true },
};

type CardProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  is_bundle?: boolean | null;
  new_until?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  stock_qty?: number | null;
  hero_image_path?: string | null;
  hero_image_url?: string | null;
  brands?: { name?: string | null } | null;
};

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const supabase = supabaseServer();
  const { data } = supabase.storage.from('product-media').getPublicUrl(path);
  return data.publicUrl ?? null;
}

async function searchProducts(query: string): Promise<CardProduct[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = supabaseServer();

  const { data: matches, error: searchError } = await supabase.rpc(
    'search_products_tsv',
    {
      q: trimmed,
      lim: 40,
      cfg: 'simple',
    }
  );

  if (searchError) {
    console.error('searchProducts rpc error', searchError);
    return [];
  }

  const matchedIds = Array.from(
    new Set((matches ?? []).map((p: any) => p.id).filter(Boolean))
  );
  if (!matchedIds.length) return [];

  const { data, error } = await supabase
    .from('products')
    .select(`
      id, slug, name,
      price, currency,
      compare_at_price, sale_price, sale_starts_at, sale_ends_at,
      is_featured, is_trending, is_bundle, new_until,
      short_description, volume_ml, net_weight_g, country_of_origin,
      hero_image_path, stock_qty,
      brands ( name )
    `)
    .eq('is_published', true)
    .in('id', matchedIds);

  if (error) {
    console.error('searchProducts detail error', error);
    return [];
  }

  const byId = new Map((data ?? []).map((p: any) => [p.id, p]));

  return matchedIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((p: any) => ({
      ...p,
      brands: Array.isArray(p.brands) ? p.brands[0] ?? null : p.brands ?? null,
      hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
    }));
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? '';
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    redirect('/');
  }

  const searchResults = await searchProducts(trimmedQuery);
  const hasNoResults = searchResults.length === 0;

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Search Results</h1>
          <p className="text-muted-foreground">
            {hasNoResults
              ? `0 results for "${trimmedQuery}"`
              : `${searchResults.length} results for "${trimmedQuery}"`}
          </p>
        </div>

        {hasNoResults ? (
          <div className="text-center py-16">
            <h2 className="text-2xl font-semibold mb-2">Product not found</h2>
            <p className="text-muted-foreground">
              No products found for "{trimmedQuery}". Try a different search term.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {searchResults.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
