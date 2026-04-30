'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle } from 'lucide-react';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';

type OrderRow = {
  id: string;
  user_id: string | null;
  order_number: string | null;
  status: string | null;
  currency: string | null;
  total: number | null;
  created_at: string | null;
};

function formatMoney(v?: number | null, currency?: string | null) {
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

export default function OrderSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, isAuthenticated } = useAuth();

  const queryOrderId = searchParams.get('order') || searchParams.get('order_id');

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resolvedOrderId, setResolvedOrderId] = useState<string | null>(queryOrderId);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('payment_success_redirecting');
      }
    } catch {}

    if (queryOrderId) {
      setResolvedOrderId(queryOrderId);
      return;
    }
    try {
      if (typeof window !== 'undefined') {
        const cached = sessionStorage.getItem('last_success_order_id');
        if (cached) setResolvedOrderId(cached);
      }
    } catch {}
  }, [queryOrderId]);

  useEffect(() => {
    if (!ready) return;

    if (!isAuthenticated) {
      const redirectTarget = resolvedOrderId
        ? `/order/success?order=${encodeURIComponent(resolvedOrderId)}`
        : '/order/success';
      router.replace(
        `/auth/login?redirect=${encodeURIComponent(
          redirectTarget
        )}`
      );
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      setInfo(null);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      const user = authData?.user;

      if (authError || !user) {
        setError(authError?.message || 'Unable to load session.');
        setLoading(false);
        return;
      }

      let data: OrderRow | null = null;
      if (resolvedOrderId) {
        const { data: byId, error: orderError } = await supabase
          .from('orders')
          .select('id, user_id, order_number, status, currency, total, created_at')
          .eq('id', resolvedOrderId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (orderError) {
          console.error('[order-success] by-id error:', orderError);
        }
        data = (byId as OrderRow | null) ?? null;
      }

      if (!data) {
        const { data: latest, error: latestError } = await supabase
          .from('orders')
          .select('id, user_id, order_number, status, currency, total, created_at')
          .eq('user_id', user.id)
          .in('status', ['paid', 'created', 'pending_payment'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestError) {
          console.error('[order-success] latest-order error:', latestError);
          setInfo('Your order was placed successfully. You can view full details in My Orders.');
          setLoading(false);
          return;
        }

        data = (latest as OrderRow | null) ?? null;
        if (data && !resolvedOrderId) {
          setInfo('Your order was placed successfully. Showing your latest order details.');
        } else if (!data) {
          setInfo('Your order was placed successfully. You can view full details in My Orders.');
        }
      }

      setOrder(data);
      setLoading(false);
    })();
  }, [ready, isAuthenticated, resolvedOrderId, router]);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-2xl mx-auto text-center">
          <CardHeader>
            <CheckCircle className="h-20 w-20 mx-auto text-green-500 mb-4" />
            <CardTitle className="text-3xl">Order Placed Successfully!</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {!ready || loading ? (
              <div>
                <p className="text-muted-foreground">Loading your order...</p>
              </div>
            ) : error ? (
              <div className="space-y-4">
                <p className="text-red-600 font-medium">{error}</p>

                <div className="flex gap-4 justify-center flex-wrap">
                  <Button asChild variant="outline" size="lg">
                    <Link href="/account/orders">Go to My Orders</Link>
                  </Button>
                  <Button asChild size="lg">
                    <Link href="/">Continue Shopping</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {order ? (
                  <div>
                    <p className="text-muted-foreground mb-2">Your order number is</p>
                    <p className="text-2xl font-bold">
                      {order?.order_number || order?.id}
                    </p>
                  </div>
                ) : null}

                {order ? (
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      Placed on{' '}
                      {order?.created_at
                        ? new Date(order.created_at).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                        : '--'}
                    </p>
                    <p>Status: {order?.status || '--'}</p>
                    <p>Total paid: {formatMoney(order?.total, order?.currency)}</p>
                  </div>
                ) : null}

                <p className="text-muted-foreground">
                  We&apos;ve sent a confirmation email with your order details. You can
                  track your order status and view your invoice from your account.
                </p>
                {info ? (
                  <p className="text-sm text-muted-foreground">{info}</p>
                ) : null}

                <div className="flex gap-4 justify-center flex-wrap">
                  {order?.id ? (
                    <Button asChild size="lg">
                      <Link href={`/account/orders/${order.id}`}>
                        View Order Details
                      </Link>
                    </Button>
                  ) : null}

                  <Button asChild variant="outline" size="lg">
                    <Link href="/account/orders">View Orders</Link>
                  </Button>

                  <Button asChild variant="outline" size="lg">
                    <Link href="/">Continue Shopping</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
