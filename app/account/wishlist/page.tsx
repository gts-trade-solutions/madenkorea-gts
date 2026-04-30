'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from "@/lib/supabaseClient";
import { CustomerLayout } from '@/components/CustomerLayout';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCart } from '@/lib/contexts/CartContext';
import { useWishlist } from '@/lib/contexts/WishlistContext';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Heart,
  ShoppingCart,
  Trash2,
  Star,
  Search,
} from 'lucide-react';

type ProductRow = {
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

type WishlistRow = {
  id: string;
  product_id: string;
  note?: string | null;
  priority: number;
  created_at: string;
  product: ProductRow;
  hero_image_url?: string | null;
};

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from('product-media').getPublicUrl(path);
  return data.publicUrl ?? null;
}

function isSaleActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function effectiveUnitPrice(p: ProductRow) {
  const saleOk =
    p.sale_price != null && isSaleActive(p.sale_starts_at, p.sale_ends_at);
  return saleOk && p.sale_price != null ? p.sale_price : p.price ?? 0;
}

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return '';
  const code = (currency ?? 'INR').toUpperCase();
  if (code === 'INR') return `₹${v.toLocaleString('en-IN')}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(v);
  } catch {
    return `${code} ${v.toLocaleString()}`;
  }
}

export default function WishlistPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const { removeFromWishlist } = useWishlist();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WishlistRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<
    'added_desc' | 'added_asc' | 'price_asc' | 'price_desc' | 'prio_desc' | 'prio_asc'
  >('added_desc');
  const [addingOneId, setAddingOneId] = useState<string | null>(null);
  const [addingSelected, setAddingSelected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login?redirect=/account/wishlist');
      return;
    }

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('wishlist_items')
        .select(`
          id, product_id, note, priority, created_at,
          product:products!wishlist_items_product_id_fkey (
            id, slug, name, price, currency,
            compare_at_price, sale_price, sale_starts_at, sale_ends_at,
            hero_image_path, brands ( name )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        toast.error('Failed to load wishlist');
        setRows([]);
        setLoading(false);
        return;
      }

      const mapped = (data ?? [])
        .filter((r: any) => r.product)
        .map((r: any) => ({
          ...r,
          hero_image_url: storagePublicUrl(r.product.hero_image_path),
        })) as WishlistRow[];

      setRows(mapped);
      setLoading(false);
    })();
  }, [isAuthenticated, router]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (checked) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  const selectAll = (checked: boolean) => {
    setSelected(checked ? new Set(filtered.map((r) => r.id)) : new Set());
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    let list = !s
      ? rows
      : rows.filter(
          (r) =>
            r.product.name.toLowerCase().includes(s) ||
            (r.product.brands?.name || '').toLowerCase().includes(s)
        );

    list = [...list].sort((a, b) => {
      if (sort === 'added_desc') return +new Date(b.created_at) - +new Date(a.created_at);
      if (sort === 'added_asc') return +new Date(a.created_at) - +new Date(b.created_at);
      if (sort === 'prio_desc') return b.priority - a.priority;
      if (sort === 'prio_asc') return a.priority - b.priority;

      const ap = effectiveUnitPrice(a.product);
      const bp = effectiveUnitPrice(b.product);

      if (sort === 'price_asc') return ap - bp;
      if (sort === 'price_desc') return bp - ap;

      return 0;
    });

    return list;
  }, [rows, q, sort]);
  const hasRows = rows.length > 0;
  const hasNoMatches = hasRows && filtered.length === 0;

  const onRemove = async (id: string) => {
    if (!window.confirm('Remove this item from wishlist?')) return;
    const item = rows.find((r) => r.id === id);
    const { error } = await supabase.from('wishlist_items').delete().eq('id', id);

    if (error) {
      toast.error('Could not remove from wishlist');
      return;
    }

    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelected((prev) => {
      const c = new Set(prev);
      c.delete(id);
      return c;
    });
    if (item) removeFromWishlist(item.product_id);
    toast.success('Removed');
  };

  const onUpdatePriority = async (id: string, priority: number) => {
    const { error } = await supabase
      .from('wishlist_items')
      .update({ priority })
      .eq('id', id);

    if (error) {
      toast.error('Could not update priority');
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, priority } : r)));
  };

  const onSaveNote = async (id: string, note: string) => {
    const { error } = await supabase
      .from('wishlist_items')
      .update({ note: note || null })
      .eq('id', id);

    if (error) {
      toast.error('Could not save note');
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, note } : r)));
    toast.success('Note saved');
  };

  const addToCartOne = async (productId: string) => {
    try {
      setAddingOneId(productId);
      await addItem(productId, 1);
      toast.success('Added to cart');
    } catch (error) {
      console.error(error);
      toast.error('Could not add to cart');
    } finally {
      setAddingOneId(null);
    }
  };

  const addSelectedToCart = async () => {
    if (selected.size === 0) return;

    try {
      setAddingSelected(true);

      for (const r of rows) {
        if (selected.has(r.id)) {
          await addItem(r.product.id, 1);
        }
      }

      toast.success('Selected items added to cart');
      router.push('/cart');
    } catch (error) {
      console.error(error);
      toast.error('Could not add selected items to cart');
    } finally {
      setAddingSelected(false);
    }
  };

  const removeSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Remove ${selected.size} selected item${selected.size === 1 ? '' : 's'} from wishlist?`)) return;

    const ids = Array.from(selected);
    const selectedProductIds = rows
      .filter((r) => selected.has(r.id))
      .map((r) => r.product_id);
    const { error } = await supabase.from('wishlist_items').delete().in('id', ids);

    if (error) {
      toast.error('Could not remove selected');
      return;
    }

    setRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    selectedProductIds.forEach((productId) => removeFromWishlist(productId));
    toast.success('Removed selected');
  };

  if (!isAuthenticated) return null;

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Heart className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">My Wishlist</h1>
          </div>
          <p className="text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'item' : 'items'} saved
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Manage</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="selectAll"
                checked={filtered.length > 0 && selected.size === filtered.length}
                onCheckedChange={(v: any) => selectAll(!!v)}
              />
              <label htmlFor="selectAll" className="text-sm">
                Select all
              </label>

              {selected.size > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selected.size} selected
                </Badge>
              )}
            </div>

            <div className="flex flex-1 items-center gap-2 md:max-w-md">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search wishlist"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
              >
                <option value="added_desc">Newest added</option>
                <option value="added_asc">Oldest added</option>
                <option value="price_asc">Price: Low to high</option>
                <option value="price_desc">Price: High to low</option>
                <option value="prio_desc">Priority: High to low</option>
                <option value="prio_asc">Priority: Low to high</option>
              </select>

              <Button
                variant="outline"
                onClick={addSelectedToCart}
                disabled={selected.size === 0 || addingSelected}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                {addingSelected ? 'Adding...' : 'Add selected to cart'}
              </Button>

              <Button
                variant="outline"
                onClick={removeSelected}
                disabled={selected.size === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove selected
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-muted-foreground">Loading wishlist...</div>
        ) : !hasRows ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Heart className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Your wishlist is empty</h2>
              <p className="text-muted-foreground mb-6">
                Save products you love and come back to them later.
              </p>
              <Button asChild>
                <Link href="/products">Browse Products</Link>
              </Button>
            </CardContent>
          </Card>
        ) : hasNoMatches ? (
          <Card>
            <CardContent className="py-16 text-center">
              <h2 className="text-xl font-semibold mb-2">No matches found</h2>
              <p className="text-muted-foreground mb-6">
                Try a different search term or reset filters.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setQ('');
                  setSort('added_desc');
                }}
              >
                Reset Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((row) => {
              const product = row.product;
              const unitPrice = effectiveUnitPrice(product);
              const compareAt = product.compare_at_price;

              return (
                <Card key={row.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={(v: any) => toggleSelect(row.id, !!v)}
                        />

                        <Link
                          href={`/products/${product.slug}`}
                          className="h-24 w-24 rounded-md overflow-hidden bg-muted shrink-0"
                        >
                          {row.hero_image_url ? (
                            <img
                              src={row.hero_image_url}
                              alt={product.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                              No image
                            </div>
                          )}
                        </Link>

                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/products/${product.slug}`}
                            className="font-semibold text-lg line-clamp-2 hover:underline"
                          >
                            {product.name}
                          </Link>

                          <div className="text-sm text-muted-foreground mt-1">
                            {product.brands?.name || 'No brand'}
                          </div>

                          <div className="flex items-center gap-3 mt-3 flex-wrap">
                            <div className="font-bold text-lg">
                              {formatINR(unitPrice, product.currency)}
                            </div>

                            {compareAt && compareAt > unitPrice ? (
                              <div className="text-sm text-muted-foreground line-through">
                                {formatINR(compareAt, product.currency)}
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              onClick={() => addToCartOne(product.id)}
                              disabled={addingOneId === product.id}
                            >
                              <ShoppingCart className="h-4 w-4 mr-2" />
                              {addingOneId === product.id ? 'Adding...' : 'Add to Cart'}
                            </Button>

                            <Button
                              variant="outline"
                              onClick={() => onRemove(row.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>

                      <Separator orientation="vertical" className="hidden lg:block h-auto" />

                      <div className="lg:w-72 space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Priority
                          </label>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => onUpdatePriority(row.id, p)}
                                className={`rounded-md border px-2 py-1 text-sm ${
                                  row.priority === p ? 'bg-primary text-primary-foreground' : ''
                                }`}
                              >
                                <Star className="h-4 w-4 inline mr-1" />
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Note
                          </label>
                          <Input
                            defaultValue={row.note || ''}
                            placeholder="Add a note"
                            onBlur={(e) => onSaveNote(row.id, e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
