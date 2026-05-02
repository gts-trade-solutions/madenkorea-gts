"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Package,
  ShoppingCart,
  Users,
  TrendingUp,
  Settings,
  FileText,
  LogOut,
  Megaphone,
  Facebook,
  Instagram,
  Activity,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminDashboard() {
  const router = useRouter();
  const { user, ready, isAdmin, logout } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-muted-foreground">
        Loading admin…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need admin privileges to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push("/auth/login")}
              className="w-full"
            >
              Sign in as Admin
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Admin Portal</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.full_name ?? user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your store</p>
        </div>

        {/* METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0</div>
              <p className="text-xs text-muted-foreground mt-1">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">₹0</div>
              <p className="text-xs text-muted-foreground mt-1">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">6</div>
              <p className="text-xs text-muted-foreground mt-1">
                Active products
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Vendors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">3</div>
              <p className="text-xs text-muted-foreground mt-1">
                Approved vendors
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ACTION CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Products */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Package className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Products</CardTitle>
              <CardDescription>Manage product catalog</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Add, edit, and manage products. Control pricing, inventory, and
                editorial flags.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/products")}
              >
                Manage Products
              </Button>
            </CardContent>
          </Card>

          {/* Orders */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <ShoppingCart className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Orders</CardTitle>
              <CardDescription>Track and fulfill orders</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                View orders, update statuses, and manage fulfillment process.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/orders")}
              >
                View Orders
              </Button>
            </CardContent>
          </Card>

          {/* Vendors */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Users className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Vendors</CardTitle>
              <CardDescription>Manage vendor accounts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Approve vendors, manage commissions, and view performance.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/vendors")}
              >
                Manage Vendors
              </Button>
            </CardContent>
          </Card>

          {/* Influencers */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Megaphone className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Influencers</CardTitle>
              <CardDescription>
                Review requests & manage creators
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Accept or reject applications, and manage approved influencers.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/influencers")}
              >
                Manage Influencers
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Instagram className="h-8 w-8 mb-2 text-primary" />
              <Facebook className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Multi-Channel Marketing</CardTitle>
              <CardDescription>
                Schedule, post & manage IG content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Access the Instagram and Facebook panel for posts, AI captions, comments, and
                performance.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/marketing/multichannel")}
              >
                Open MultiChannel Panel
              </Button>
            </CardContent>
          </Card>

          {/* Instagram Marketing */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Instagram className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Instagram Marketing</CardTitle>
              <CardDescription>
                Schedule, post & manage IG content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Access the Instagram panel for posts, AI captions, comments, and
                performance.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/marketing/instagram")}
              >
                Open Instagram Panel
              </Button>
            </CardContent>
          </Card>

          {/* Facebook Marketing */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Facebook className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Facebook Marketing</CardTitle>
              <CardDescription>
                Manage page posts & comments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Use the Facebook panel to create posts, reply to comments and
                optimize content with AI.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/marketing/facebook")}
              >
                Open Facebook Panel
              </Button>
            </CardContent>
          </Card>

          {/* Social Connections / Tokens */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Settings className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Social Connections</CardTitle>
              <CardDescription>Connect Facebook & Instagram tokens</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Configure and update access tokens used for Facebook and
                Instagram marketing tools.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/instagram/settings")}
              >
                Open Social Settings
              </Button>
            </CardContent>
          </Card>

          {/* CMS */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <FileText className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>CMS</CardTitle>
              <CardDescription>Content management</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Manage homepage banners, categories, brands, and static pages.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/cms")}
              >
                Manage Content
              </Button>
            </CardContent>
          </Card>

          {/* Analytics */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <TrendingUp className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Analytics</CardTitle>
              <CardDescription>View reports and insights</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Track sales, revenue, and product performance over time.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/analytics")}
              >
                View Analytics
              </Button>
            </CardContent>
          </Card>

          {/* Conversion funnel */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Filter className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Conversion Funnel</CardTitle>
              <CardDescription>Where visitors drop off</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Stage-by-stage breakdown from page view → cart → payment.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/analytics/funnel")}
              >
                Open Funnel
              </Button>
            </CardContent>
          </Card>

          {/* User sessions */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Activity className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>User Sessions</CardTitle>
              <CardDescription>Drill into individual visits</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                See exactly what each visitor did and where they bailed out.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/analytics/sessions")}
              >
                Open Sessions
              </Button>
            </CardContent>
          </Card>

          {/* Store Settings */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Settings className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>Store Settings</CardTitle>
              <CardDescription>Configure your store</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Manage payment, shipping, taxes, and other store settings.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/admin/settings")}
              >
                Store Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
