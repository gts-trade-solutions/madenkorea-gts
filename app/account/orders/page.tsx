"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useCart } from "@/lib/contexts/CartContext";
import { Package, ChevronRight, Download, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

type Order = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
  created_at: string;
};

type OrderItem = {
  order_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
};

export default function OrdersPage() {
  const router = useRouter();
  const t = useTranslations("account");
  const { isAuthenticated, ready } = useAuth();
  const { addItem } = useCart();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);


// Fetch orders once the auth layer is ready & user is signed in
useEffect(() => {
  if (!ready) return;

  if (!isAuthenticated) {
    router.push("/auth/login?redirect=/account/orders");
    return;
  }

  (async () => {
    setLoading(true);
    setLoadError(null);

    // ✅ Get the current signed-in user (Supabase Auth)
    const { data: userRes, error: uerr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (uerr || !user) {
      setOrders([]);
      setItems([]);
      setLoadError(uerr?.message || t("loadErrNotSignedIn"));
      setLoading(false);
      router.push("/auth/login?redirect=/account/orders");
      return;
    }

    // ✅ IMPORTANT: filter by the user id column in your orders table
    // If your column name is different (e.g. customer_id), change "user_id" below.
    const { data: ords, error: oerr } = await supabase
      .from("orders")
      .select(
        "id, order_number, status, currency, subtotal, shipping_fee, discount_total, total, created_at"
      )
      .eq("user_id", user.id) // ✅ ONLY THIS USER'S ORDERS
      .order("created_at", { ascending: false });

    if (oerr) {
      setOrders([]);
      setItems([]);
      setLoadError(oerr.message || t("loadErrFailOrders"));
      setLoading(false);
      return;
    }

    setOrders(ords ?? []);

    if ((ords ?? []).length > 0) {
      const ids = (ords ?? []).map((o) => o.id);

      const { data: its, error: ierr } = await supabase
        .from("order_items")
        .select("order_id, product_id, name, quantity, unit_price")
        .in("order_id", ids);

      if (ierr) {
        setItems([]);
        setLoadError(ierr.message || t("loadErrFailItems"));
      } else {
        setItems(its ?? []);
      }
    } else {
      setItems([]);
    }

    setLoading(false);
  })();
}, [ready, isAuthenticated, router]);

  // ⚠️ Hooks must not be conditional — keep this above any returns
  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const i of items) {
      const arr = map.get(i.order_id) || [];
      arr.push(i);
      map.set(i.order_id, arr);
    }
    return map;
  }, [items]);

  const getStatusVariant = (status: string) =>
    status === "delivered"
      ? "default"
      : status === "shipped"
      ? "secondary"
      : "outline";

  const handleInvoice = (orderId: string) => {
    router.push(`/account/orders/${orderId}/invoice`);
  };

  const handleReorder = async (orderId: string) => {
    const its = itemsByOrder.get(orderId) || [];
    const reOrderables = its.filter((it) => !!it.product_id);
    if (!reOrderables.length) {
      toast.info(t("reorderNoneToast"));
      return;
    }
    for (const it of reOrderables) {
      await addItem(it.product_id as string, Math.max(1, it.quantity || 1));
    }
    toast.success(t("reorderAddedToast"));
    router.push("/cart");
  };

  const canReorder = (status?: string) =>
    ["delivered", "shipped", "paid", "processing"].includes(
      String(status || "").toLowerCase()
    );

  // --- Guarded UI (no early returns that skip hooks) ---
  let body: JSX.Element;

  if (!ready) {
    body = (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          {t("ordersLoading")}
        </CardContent>
      </Card>
    );
  } else if (!isAuthenticated) {
    body = (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          {t("ordersRedirecting")}
        </CardContent>
      </Card>
    );
  } else if (loading) {
    body = (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          {t("ordersGenericLoading")}
        </CardContent>
      </Card>
    );
  } else if (orders.length === 0) {
    body = (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Package className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">{t("ordersEmptyTitle")}</h3>
          <p className="text-muted-foreground mb-6 text-center">
            {t("ordersEmptyBody")}
          </p>
          <Button asChild>
            <Link href="/">{t("ordersStartShopping")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  } else {
    body = (
      <div className="space-y-4">
        {orders.map((order) => {
          const its = itemsByOrder.get(order.id) || [];
          const itemCount = its.reduce((acc, i) => acc + (i.quantity || 1), 0);

          return (
            <Card key={order.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">
                      {t("orderNumberLabel", { n: order.order_number })}
                    </CardTitle>
                    <CardDescription>
                      {t("placedOnLabel", {
                        date: new Date(order.created_at).toLocaleDateString("en-IN", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }),
                      })}
                    </CardDescription>
                  </div>
                  <Badge variant={getStatusVariant(order.status)}>
                    {order.status.charAt(0).toUpperCase() +
                      order.status.slice(1)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {t("itemCount", { count: itemCount })}
                    </p>
                    <p className="text-lg font-bold">
                      ₹{order.total.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleInvoice(order.id)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t("invoiceBtn")}
                    </Button>
                    {canReorder(order.status) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReorder(order.id)}
                      >
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        {t("reorderBtn")}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/account/orders/${order.id}`)}
                    >
                      {t("viewDetailsBtn")}
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{t("ordersTitle")}</h1>
          <p className="text-muted-foreground">{t("ordersSubtitle")}</p>
          {loadError && (
            <p className="mt-2 text-sm text-red-600">{t("loadErrorPrefix")} {loadError}</p>
          )}
        </div>
        {body}
      </div>
    </CustomerLayout>
  );
}
