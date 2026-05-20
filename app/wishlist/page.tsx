'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { supabase } from "@/lib/supabaseClient";
import { CustomerLayout } from '@/components/CustomerLayout';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCart } from '@/lib/contexts/CartContext';
import { useWishlist } from '@/lib/contexts/WishlistContext';
import { useCurrency } from '@/lib/contexts/CurrencyContext';

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
  LogIn,
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
  is_bundle?: boolean | null;
  brands?: { name?: string | null } | null;
};

// `id` is wishlist_items.id when authenticated. For anonymous users
// there's no DB row, so `id` falls back to `product_id` and `note` /
// `priority` are absent — the per-row Note + Priority controls are
// only rendered when authenticated.
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

export default function WishlistPage() {
  const router = useRouter();
  const t = useTranslations('account');
  const { isAuthenticated, ready: authReady } = useAuth();
  const { addItem } = useCart();
  const { wishlistItems, removeFromWishlist } = useWishlist();
  const { formatPrice } = useCurrency();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WishlistRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<
    'added_desc' | 'added_asc' | 'price_asc' | 'price_desc' | 'prio_desc' | 'prio_asc'
  >('added_desc');
  const [addingOneId, setAddingOneId] = useState<string | null>(null);
  const [addingSelected, setAddingSelected] = useState(false);

  // Load wishlist rows. Two code paths because the data shapes differ:
  //  - Auth: read from `wishlist_items` (RLS-scoped) so we get the
  //    note/priority metadata for the richer editor below.
  //  - Anon: read product IDs from the context (localStorage-backed),
  //    fetch the products in bulk, synthesise minimal WishlistRows.
  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;
    (async () => {
      setLoading(true);

      if (isAuthenticated) {
        const { data, error } = await supabase
          .from('wishlist_items')
          .select(`
            id, product_id, note, priority, created_at,
            product:products!wishlist_items_product_id_fkey (
              id, slug, name, price, currency,
              compare_at_price, sale_price, sale_starts_at, sale_ends_at,
              hero_image_path, is_bundle, brands ( name )
            )
          `)
          .order('created_at', { ascending: false });

        if (cancelled) return;

        if (error) {
          console.error(error);
          toast.error(t('wishlistErrLoad'));
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
        return;
      }

      // Anonymous path. The product IDs in the context are kept in sync
      // with localStorage by WishlistProvider; we just need their full
      // product rows from the public `products` table.
      const ids = wishlistItems;
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('products')
        .select(
          'id, slug, name, price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at, hero_image_path, is_bundle, brands ( name )'
        )
        .in('id', ids);

      if (cancelled) return;

      if (error) {
        console.error(error);
        toast.error(t('wishlistErrLoad'));
        setRows([]);
        setLoading(false);
        return;
      }

      const synthRows: WishlistRow[] = (data ?? []).map((p: any) => ({
        id: p.id, // no DB row — fall back to product id
        product_id: p.id,
        note: null,
        priority: 3,
        created_at: new Date().toISOString(),
        product: p as ProductRow,
        hero_image_url: storagePublicUrl(p.hero_image_path),
      }));

      setRows(synthRows);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthenticated, wishlistItems, t]);

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

  // Remove via context — handles both anon (localStorage only) and auth
  // (DB delete + localStorage). The auth path used to call Supabase
  // directly here to also drop the wishlist_items row; the context now
  // owns that logic so a single removeFromWishlist call works for both.
  const onRemove = async (id: string) => {
    if (!window.confirm(t('wishlistRemoveConfirm'))) return;
    const item = rows.find((r) => r.id === id);
    if (!item) return;
    removeFromWishlist(item.product_id);
    setRows((prev) => prev.filter((r) => r.product_id !== item.product_id));
    setSelected((prev) => {
      const c = new Set(prev);
      c.delete(id);
      return c;
    });
    toast.success(t('wishlistRemovedToast'));
  };

  // Per-row priority + note: auth-only (anon has no DB row to update).
  const onUpdatePriority = async (id: string, priority: number) => {
    if (!isAuthenticated) return;
    const { error } = await supabase
      .from('wishlist_items')
      .update({ priority })
      .eq('id', id);

    if (error) {
      toast.error(t('wishlistErrPriority'));
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, priority } : r)));
  };

  const onSaveNote = async (id: string, note: string) => {
    if (!isAuthenticated) return;
    const { error } = await supabase
      .from('wishlist_items')
      .update({ note: note || null })
      .eq('id', id);

    if (error) {
      toast.error(t('wishlistErrNote'));
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, note } : r)));
    toast.success(t('wishlistNoteSavedToast'));
  };

  const addToCartOne = async (productId: string) => {
    try {
      setAddingOneId(productId);
      await addItem(productId, 1);
      toast.success(t('wishlistAddedToCartToast'));
    } catch (error) {
      console.error(error);
      toast.error(t('wishlistErrAddCart'));
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

      toast.success(t('wishlistSelectedAddedToast'));
      router.push('/cart');
    } catch (error) {
      console.error(error);
      toast.error(t('wishlistErrAddSelected'));
    } finally {
      setAddingSelected(false);
    }
  };

  const removeSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(t('wishlistRemoveSelectedConfirm', { count: selected.size }))) return;

    const selectedRows = rows.filter((r) => selected.has(r.id));
    selectedRows.forEach((r) => removeFromWishlist(r.product_id));
    setRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    toast.success(t('wishlistRemovedSelectedToast'));
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Heart className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{t('wishlistTitle')}</h1>
          </div>
          <p className="text-muted-foreground">
            {t('wishlistSavedCount', { count: rows.length })}
          </p>
        </div>

        {/* Soft prompt for anonymous users — wishlist works locally,
            but won't follow them to other devices until they sign in. */}
        {authReady && !isAuthenticated && hasRows && (
          <div className="mb-6 flex flex-col gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              {t('wishlistAnonPrompt')}
            </p>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link href={`/auth/login?redirect=/wishlist`}>
                <LogIn className="h-4 w-4 mr-2" />
                {t('wishlistAnonSignInCta')}
              </Link>
            </Button>
          </div>
        )}

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('wishlistManage')}</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="selectAll"
                checked={filtered.length > 0 && selected.size === filtered.length}
                onCheckedChange={(v: any) => selectAll(!!v)}
              />
              <label htmlFor="selectAll" className="text-sm">
                {t('wishlistSelectAll')}
              </label>

              {selected.size > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {t('wishlistSelectedBadge', { count: selected.size })}
                </Badge>
              )}
            </div>

            <div className="flex flex-1 items-center gap-2 md:max-w-md">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('wishlistSearchPlaceholder')}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
              >
                <option value="added_desc">{t('wishlistSortNewest')}</option>
                <option value="added_asc">{t('wishlistSortOldest')}</option>
                <option value="price_asc">{t('wishlistSortPriceAsc')}</option>
                <option value="price_desc">{t('wishlistSortPriceDesc')}</option>
                {/* Priority sorts only meaningful when there's per-row
                    priority data — i.e. authenticated users. */}
                {isAuthenticated && (
                  <>
                    <option value="prio_desc">{t('wishlistSortPrioHigh')}</option>
                    <option value="prio_asc">{t('wishlistSortPrioLow')}</option>
                  </>
                )}
              </select>

              <Button
                variant="outline"
                onClick={addSelectedToCart}
                disabled={selected.size === 0 || addingSelected}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                {addingSelected ? t('wishlistAdding') : t('wishlistAddSelected')}
              </Button>

              <Button
                variant="outline"
                onClick={removeSelected}
                disabled={selected.size === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('wishlistRemoveSelected')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-muted-foreground">{t('wishlistLoading')}</div>
        ) : !hasRows ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Heart className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">{t('wishlistEmptyTitle')}</h2>
              <p className="text-muted-foreground mb-6">{t('wishlistEmptyBody')}</p>
              <Button asChild>
                <Link href="/products">{t('wishlistBrowseCta')}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : hasNoMatches ? (
          <Card>
            <CardContent className="py-16 text-center">
              <h2 className="text-xl font-semibold mb-2">{t('wishlistNoMatchesTitle')}</h2>
              <p className="text-muted-foreground mb-6">{t('wishlistNoMatchesBody')}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setQ('');
                  setSort('added_desc');
                }}
              >
                {t('wishlistResetFilters')}
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
                              {t('wishlistNoImage')}
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
                            {product.brands?.name || t('wishlistNoBrand')}
                          </div>

                          <div className="flex items-center gap-3 mt-3 flex-wrap">
                            <div className="font-bold text-lg">
                              {formatPrice(unitPrice)}
                            </div>

                            {compareAt && compareAt > unitPrice ? (
                              <div className="text-sm text-muted-foreground line-through">
                                {formatPrice(compareAt)}
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              onClick={() => addToCartOne(product.id)}
                              disabled={addingOneId === product.id}
                            >
                              <ShoppingCart className="h-4 w-4 mr-2" />
                              {addingOneId === product.id ? t('wishlistAdding') : t('wishlistAddOneBtn')}
                            </Button>

                            <Button
                              variant="outline"
                              onClick={() => onRemove(row.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('wishlistRemoveBtn')}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Note + priority editor — auth-only. Anon visitors
                          don't have a DB row to persist these against. */}
                      {isAuthenticated && (
                        <>
                          <Separator orientation="vertical" className="hidden lg:block h-auto" />
                          <div className="lg:w-72 space-y-4">
                            <div>
                              <label className="text-sm font-medium mb-2 block">
                                {t('wishlistPriorityLabel')}
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
                                {t('wishlistNoteLabel')}
                              </label>
                              <Input
                                defaultValue={row.note || ''}
                                placeholder={t('wishlistNotePlaceholder')}
                                onBlur={(e) => onSaveNote(row.id, e.target.value)}
                              />
                            </div>
                          </div>
                        </>
                      )}
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
