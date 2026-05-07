'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { invalidateShippingConfigCache } from '@/lib/hooks/useShippingConfig';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogOut, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();

  const [settings, setSettings] = useState({
    storeName: 'MadenKorea',
    storeDescription: 'Your trusted source for authentic Korean beauty and lifestyle products',
    storeEmail: 'info@madenkorea.com',
    storePhone: '+91 1234567890',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    freeShippingThreshold: 2000,
    defaultShippingFee: 149,
    codEnabled: true,
    taxInclusive: true,
    lowStockThreshold: 10,
    emailNotifications: true,
    smsNotifications: false,
    maintenanceMode: false,
  });

  const [savingShipping, setSavingShipping] = useState(false);

  // Business / legal / compliance fields. Live in store_settings; loaded
  // from /api/admin/settings/business-info and saved back the same way.
  const [business, setBusiness] = useState({
    legalEntityName: "",
    registeredAddress: "",
    publicPhone: "",
    supportEmail: "",
    businessHours: "",
    grievanceOfficerName: "",
    grievanceOfficerDesignation: "",
    grievanceOfficerEmail: "",
    gstin: "",
    cdscoRegistration: "",
    jurisdictionCity: "",
    marketplaceDisclosureEnabled: false,
  });
  const [savingBusiness, setSavingBusiness] = useState(false);

  useEffect(() => {
    if (!hasRole('admin')) {
      router.push('/admin');
      return;
    }
    const stored = localStorage.getItem('storeSettings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings((prev) => ({ ...prev, ...parsed }));
      } catch {}
    }

    // Pull the live shipping values from the backend so the form
    // reflects what's actually being applied at checkout.
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch('/api/admin/settings/shipping', {
          credentials: 'include',
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        setSettings((prev) => ({
          ...prev,
          freeShippingThreshold: Number(data.deliveryThreshold) || prev.freeShippingThreshold,
          defaultShippingFee: Number(data.defaultShippingFee) || prev.defaultShippingFee,
        }));
      } catch {}
    })();

    // Load business / legal / compliance info into the Business tab.
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch('/api/admin/settings/business-info', {
          credentials: 'include',
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        const info = data?.info ?? {};
        setBusiness((prev) => ({
          ...prev,
          legalEntityName: info.legalEntityName ?? '',
          registeredAddress: info.registeredAddress ?? '',
          publicPhone: info.publicPhone ?? '',
          supportEmail: info.supportEmail ?? '',
          businessHours: info.businessHours ?? '',
          grievanceOfficerName: info.grievanceOfficerName ?? '',
          grievanceOfficerDesignation: info.grievanceOfficerDesignation ?? '',
          grievanceOfficerEmail: info.grievanceOfficerEmail ?? '',
          gstin: info.gstin ?? '',
          cdscoRegistration: info.cdscoRegistration ?? '',
          jurisdictionCity: info.jurisdictionCity ?? '',
          marketplaceDisclosureEnabled: !!info.marketplaceDisclosureEnabled,
        }));
      } catch {}
    })();
  }, [hasRole, router]);

  const handleSaveBusiness = async () => {
    setSavingBusiness(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch('/api/admin/settings/business-info', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(business),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || 'Failed to save business info');
        return;
      }
      toast.success('Business info saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save business info');
    } finally {
      setSavingBusiness(false);
    }
  };

  if (!hasRole('admin')) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const handleSave = async () => {
    // Other tabs are still localStorage-only (placeholders). Shipping
    // is the one that's wired to a real backend.
    localStorage.setItem('storeSettings', JSON.stringify(settings));

    setSavingShipping(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch('/api/admin/settings/shipping', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          deliveryThreshold: settings.freeShippingThreshold,
          defaultShippingFee: settings.defaultShippingFee,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || 'Failed to save shipping settings');
        return;
      }
      // Drop the client-side cache so cart/checkout previews refetch.
      invalidateShippingConfigCache();
      toast.success('Settings saved successfully');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save shipping settings');
    } finally {
      setSavingShipping(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Store Settings</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={handleSave} disabled={savingShipping}>
              <Save className="mr-2 h-4 w-4" />
              {savingShipping ? 'Saving…' : 'Save Changes'}
            </Button>
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="shipping">Shipping</TabsTrigger>
            <TabsTrigger value="business">Business</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Store Information</CardTitle>
                  <CardDescription>Basic information about your store</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="storeName">Store Name</Label>
                    <Input
                      id="storeName"
                      value={settings.storeName}
                      onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="storeDescription">Store Description</Label>
                    <Textarea
                      id="storeDescription"
                      value={settings.storeDescription}
                      onChange={(e) => setSettings({ ...settings, storeDescription: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="storeEmail">Store Email</Label>
                      <Input
                        id="storeEmail"
                        type="email"
                        value={settings.storeEmail}
                        onChange={(e) => setSettings({ ...settings, storeEmail: e.target.value })}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="storePhone">Store Phone</Label>
                      <Input
                        id="storePhone"
                        value={settings.storePhone}
                        onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Regional Settings</CardTitle>
                  <CardDescription>Currency and timezone preferences</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Select value={settings.currency} onValueChange={(value) => setSettings({ ...settings, currency: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INR">INR (₹)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select value={settings.timezone} onValueChange={(value) => setSettings({ ...settings, timezone: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                          <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                          <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inventory Settings</CardTitle>
                  <CardDescription>Stock management preferences</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
                    <Input
                      id="lowStockThreshold"
                      type="number"
                      value={settings.lowStockThreshold}
                      onChange={(e) => setSettings({ ...settings, lowStockThreshold: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-sm text-muted-foreground">
                      Alert when product quantity falls below this threshold
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Maintenance Mode</CardTitle>
                  <CardDescription>Temporarily disable the storefront</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="maintenanceMode">Enable Maintenance Mode</Label>
                      <p className="text-sm text-muted-foreground">Store will be unavailable to customers</p>
                    </div>
                    <Switch
                      id="maintenanceMode"
                      checked={settings.maintenanceMode}
                      onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="shipping">
            <Card>
              <CardHeader>
                <CardTitle>Shipping Settings</CardTitle>
                <CardDescription>Configure shipping options and rates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="defaultShippingFee">Default Shipping Fee (₹)</Label>
                  <Input
                    id="defaultShippingFee"
                    type="number"
                    min={0}
                    value={settings.defaultShippingFee}
                    onChange={(e) => setSettings({ ...settings, defaultShippingFee: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Flat shipping fee charged when the cart is below the free-shipping threshold and the customer is not a K-Plus member.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="freeShippingThreshold">Free Shipping Threshold (₹)</Label>
                  <Input
                    id="freeShippingThreshold"
                    type="number"
                    min={0}
                    value={settings.freeShippingThreshold}
                    onChange={(e) => setSettings({ ...settings, freeShippingThreshold: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Offer free shipping for orders above this amount.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="codEnabled">Cash on Delivery (COD)</Label>
                    <p className="text-sm text-muted-foreground">Allow customers to pay on delivery</p>
                  </div>
                  <Switch
                    id="codEnabled"
                    checked={settings.codEnabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, codEnabled: checked })}
                  />
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label>Delivery Time Zones</Label>
                      <p className="text-sm text-muted-foreground">
                        Edit the per-zone ETA windows shown on product pages (Chennai Metro, Tamil Nadu, South India, North India, Northeast, Islands).
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => router.push('/admin/settings/shipping-zones')}>
                      Manage zones
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="business">
            <Card>
              <CardHeader>
                <CardTitle>Business &amp; legal info</CardTitle>
                <CardDescription>
                  Used across customer-facing pages (Privacy, Terms, Refund, Cancellation, footer)
                  and on invoices. Leave a field blank to hide it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="legalEntityName">Legal entity name</Label>
                    <Input
                      id="legalEntityName"
                      value={business.legalEntityName}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, legalEntityName: e.target.value }))
                      }
                      placeholder="e.g. Race Auto India Pvt Ltd"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="gstin">GSTIN</Label>
                    <Input
                      id="gstin"
                      value={business.gstin}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, gstin: e.target.value }))
                      }
                      placeholder="22AAAAA0000A1Z5"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="registeredAddress">Registered office address</Label>
                  <Textarea
                    id="registeredAddress"
                    rows={3}
                    value={business.registeredAddress}
                    onChange={(e) =>
                      setBusiness((b) => ({ ...b, registeredAddress: e.target.value }))
                    }
                    placeholder="Street, City, State, PIN"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="publicPhone">Public phone</Label>
                    <Input
                      id="publicPhone"
                      value={business.publicPhone}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, publicPhone: e.target.value }))
                      }
                      placeholder="+91 98xxxxxxxx"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="supportEmail">Support email</Label>
                    <Input
                      id="supportEmail"
                      type="email"
                      value={business.supportEmail}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, supportEmail: e.target.value }))
                      }
                      placeholder="info@madenkorea.com"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="businessHours">Business hours</Label>
                    <Input
                      id="businessHours"
                      value={business.businessHours}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, businessHours: e.target.value }))
                      }
                      placeholder="Mon-Fri 9AM - 6PM IST"
                    />
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div>
                    <h4 className="text-base font-semibold">Grievance Redressal Officer</h4>
                    <p className="text-sm text-muted-foreground">
                      Required by Consumer Protection (E-Commerce) Rules 2020. Shown in the
                      footer and on the Privacy page. Officer must acknowledge complaints
                      within 48 hours and resolve within one month.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="goName">Name</Label>
                      <Input
                        id="goName"
                        value={business.grievanceOfficerName}
                        onChange={(e) =>
                          setBusiness((b) => ({ ...b, grievanceOfficerName: e.target.value }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="goDesignation">Designation</Label>
                      <Input
                        id="goDesignation"
                        value={business.grievanceOfficerDesignation}
                        onChange={(e) =>
                          setBusiness((b) => ({
                            ...b,
                            grievanceOfficerDesignation: e.target.value,
                          }))
                        }
                        placeholder="Founder / Director"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="goEmail">Email</Label>
                      <Input
                        id="goEmail"
                        type="email"
                        value={business.grievanceOfficerEmail}
                        onChange={(e) =>
                          setBusiness((b) => ({
                            ...b,
                            grievanceOfficerEmail: e.target.value,
                          }))
                        }
                        placeholder="grievance@madenkorea.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="cdscoRegistration">CDSCO registration #</Label>
                    <Input
                      id="cdscoRegistration"
                      value={business.cdscoRegistration}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, cdscoRegistration: e.target.value }))
                      }
                      placeholder="For imported cosmetics"
                    />
                    <p className="text-xs text-muted-foreground">
                      Required under Cosmetics Rules 2020 for imported cosmetics. Optional
                      for now.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="jurisdictionCity">Jurisdiction city</Label>
                    <Input
                      id="jurisdictionCity"
                      value={business.jurisdictionCity}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, jurisdictionCity: e.target.value }))
                      }
                      placeholder="Chennai"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used in the Terms &amp; Conditions dispute-resolution clause.
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-base font-semibold">
                        Marketplace seller disclosure
                      </Label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        When on, vendor-supplied products show a &ldquo;Sold by&rdquo;
                        card on their detail page with the vendor&apos;s legal name,
                        address, and GSTIN. Required by Consumer Protection
                        (E-Commerce) Rules 2020 once you have approved vendors with
                        accurate records. Leave off until vendor data is correct.
                      </p>
                    </div>
                    <Switch
                      checked={business.marketplaceDisclosureEnabled}
                      onCheckedChange={(v) =>
                        setBusiness((b) => ({
                          ...b,
                          marketplaceDisclosureEnabled: v,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveBusiness} disabled={savingBusiness}>
                    <Save className="mr-2 h-4 w-4" />
                    {savingBusiness ? 'Saving…' : 'Save business info'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Payment Settings</CardTitle>
                <CardDescription>Configure payment gateway and tax settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="taxInclusive">Tax Inclusive Pricing</Label>
                    <p className="text-sm text-muted-foreground">Show prices with tax included</p>
                  </div>
                  <Switch
                    id="taxInclusive"
                    checked={settings.taxInclusive}
                    onCheckedChange={(checked) => setSettings({ ...settings, taxInclusive: checked })}
                  />
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Payment gateway integration (Razorpay/Stripe) will be available after backend setup
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
                <CardDescription>Configure notification preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="emailNotifications">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive order and system notifications via email</p>
                  </div>
                  <Switch
                    id="emailNotifications"
                    checked={settings.emailNotifications}
                    onCheckedChange={(checked) => setSettings({ ...settings, emailNotifications: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="smsNotifications">SMS Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive critical alerts via SMS</p>
                  </div>
                  <Switch
                    id="smsNotifications"
                    checked={settings.smsNotifications}
                    onCheckedChange={(checked) => setSettings({ ...settings, smsNotifications: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
