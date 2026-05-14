"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import { useAuth } from "@/lib/contexts/AuthContext";
import { ShoppingBag, Heart, User, LogOut, Eye } from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "@/components/ProductCard";
import { supabase } from "@/lib/supabaseClient";
import AccountMembershipCard from "@/components/AccountMembershipCard";

type DbProduct = {
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
  stock_qty?: number | null;
  is_bundle?: boolean | null;
  brands?: { name?: string | null } | null;
};

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("product-media").getPublicUrl(path);
  return data.publicUrl ?? null;
}

export default function AccountPage() {
  const router = useRouter();
  const t = useTranslations("account");
  const { user, isAuthenticated, logout } = useAuth();
  const [fullName, setFullName] = useState<string>("");
  const [recentlyViewed, setRecentlyViewed] = useState<DbProduct[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login?redirect=/account");
      return;
    }
    (async () => {
      // profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user?.id)
        .maybeSingle();
      setFullName(profile?.full_name || user?.email || t("fallbackUserName"));

      // recently viewed (ids from localStorage)
      const viewedIds: string[] = JSON.parse(
        localStorage.getItem("recentlyViewed") || "[]"
      );
      if (viewedIds.length) {
        const { data } = await supabase
          .from("products")
          .select(
            `
            id, slug, name, price, currency,
            compare_at_price, sale_price, sale_starts_at, sale_ends_at,
            hero_image_path, stock_qty, is_bundle, brands(name)
          `
          )
          .in("id", viewedIds.slice(0, 12))
          .eq("is_published", true);
        const items = (data ?? []).map((p) => ({
          ...p,
          hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
        })) as any[];
        // keep the same order as viewed
        const map = new Map(items.map((i) => [i.id, i]));
        setRecentlyViewed(
          viewedIds.map((id) => map.get(id)).filter(Boolean) as any[]
        );
      }
    })();
  }, [isAuthenticated, router, user?.id, user?.email]);

  if (!isAuthenticated) return null;

  const handleLogout = async () => {
    await logout();
    toast.success(t("loggedOutToast"));
    router.push("/");
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t("dashboardTitle")}</h1>
            <p className="text-muted-foreground">{t("welcomeBack", { name: fullName })}</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("logoutBtn")}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <ShoppingBag className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>{t("dashboardOrdersCardTitle")}</CardTitle>
              <CardDescription>{t("dashboardOrdersCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/account/orders")}
              >
                {t("viewOrdersBtn")}
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <Heart className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>{t("dashboardWishlistCardTitle")}</CardTitle>
              <CardDescription>{t("dashboardWishlistCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/account/wishlist")}
              >
                {t("viewWishlistBtn")}
              </Button>
            </CardContent>
          </Card>
<AccountMembershipCard />
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <User className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>{t("dashboardProfileCardTitle")}</CardTitle>
              <CardDescription>{t("dashboardProfileCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/account/settings")}
              >
                {t("editProfileBtn")}
              </Button>
            </CardContent>
          </Card>
        </div>

        {recentlyViewed.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-2 mb-6">
              <Eye className="h-6 w-6" />
              <h2 className="text-2xl font-bold">{t("recentlyViewedHeading")}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {recentlyViewed.map((product) => (
                <ProductCard key={product.id} product={product as any} />
              ))}
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
