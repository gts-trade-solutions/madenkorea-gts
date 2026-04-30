"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "@/lib/contexts/AuthContext";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

type Profile = {
  full_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  email?: string | null;
};
type Address = {
  id: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_default: boolean;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export default function AccountSettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    email: "",
    phone: "",
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [defaultingAddressId, setDefaultingAddressId] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrDialog, setAddrDialog] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [addrForm, setAddrForm] = useState({
    line1: "",
    line2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
    is_default: false,
  });

  // password UI state
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login?redirect=/account/settings");
      return;
    }
    (async () => {
      // profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, phone")
        .eq("id", user?.id)
        .maybeSingle();
      setProfile({
        full_name: prof?.full_name || "",
        avatar_url: prof?.avatar_url || null,
        phone: prof?.phone || "",
        email: user?.email || "",
      });
      setLoadingProfile(false);

      // addresses
      const { data: addrs } = await supabase
        .from("addresses")
        .select("id, line1, line2, city, state, pincode, country, is_default")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      setAddresses(addrs ?? []);
    })();
  }, [isAuthenticated, router, user?.id, user?.email]);

  if (!isAuthenticated) return null;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: profile.full_name, phone: profile.phone })
      .eq("id", user?.id);
    setSavingProfile(false);
    if (error) {
      toast.error("Could not update profile");
      return;
    }
    toast.success("Profile updated");
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.current) {
      toast.error("Please enter your current password");
      return;
    }
    if (pw.next.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (pw.next !== pw.confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setSavingPassword(true);
    const email = user?.email || profile.email || "";
    if (!email) {
      setSavingPassword(false);
      toast.error("Could not verify your account email");
      return;
    }
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: pw.current,
    });
    if (reauthError) {
      setSavingPassword(false);
      toast.error("Current password is incorrect");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message || "Could not change password");
      return;
    }
    toast.success("Password changed");
    setPw({ current: "", next: "", confirm: "" });
  };

  const openAdd = (a?: Address) => {
    if (a) {
      setEditing(a);
      setAddrForm({
        line1: a.line1,
        line2: a.line2 || "",
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        country: a.country || "India",
        is_default: !!a.is_default,
      });
    } else {
      setEditing(null);
      setAddrForm({
        line1: "",
        line2: "",
        city: "",
        state: "",
        pincode: "",
        country: "India",
        is_default: false,
      });
    }
    setAddrDialog(true);
  };

  const saveAddress = async () => {
    if (
      !addrForm.line1 ||
      !addrForm.city ||
      !addrForm.state ||
      !addrForm.pincode
    ) {
      toast.error("Please fill required fields");
      return;
    }
    setSavingAddress(true);
    let err;
    if (editing) {
      ({ error: err } = await supabase
        .from("addresses")
        .update({ ...addrForm, line2: addrForm.line2 || null })
        .eq("id", editing.id));
    } else {
      ({ error: err } = await supabase
        .from("addresses")
        .insert({
          ...addrForm,
          line2: addrForm.line2 || null,
          user_id: user?.id,
        }));
    }
    if (err) {
      setSavingAddress(false);
      toast.error("Could not save address");
      return;
    }

    // reload
    const { data: addrs } = await supabase
      .from("addresses")
      .select("id, line1, line2, city, state, pincode, country, is_default")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    setAddresses(addrs ?? []);
    setAddrDialog(false);
    setSavingAddress(false);
    toast.success("Address saved");
  };

  const deleteAddress = async (id: string) => {
    if (!window.confirm("Delete this address?")) return;
    setDeletingAddressId(id);
    const { error } = await supabase.from("addresses").delete().eq("id", id);
    setDeletingAddressId(null);
    if (error) {
      toast.error("Could not delete address");
      return;
    }
    setAddresses((prev) => prev.filter((a) => a.id !== id));
    toast.success("Address deleted");
  };

  const makeDefault = async (id: string) => {
    // clear all defaults then set one (simple client flow)
    setDefaultingAddressId(id);
    await supabase
      .rpc("rebase_default_address", { p_user_id: user?.id, p_address_id: id })
      .catch(async () => {
        // fallback if RPC missing
        await supabase
          .from("addresses")
          .update({ is_default: false })
          .eq("user_id", user?.id);
        await supabase
          .from("addresses")
          .update({ is_default: true })
          .eq("id", id);
      });
    const { data: addrs } = await supabase
      .from("addresses")
      .select("id, line1, line2, city, state, pincode, country, is_default")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    setDefaultingAddressId(null);
    setAddresses(addrs ?? []);
    toast.success("Default address updated");
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your profile, password, and addresses
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="addresses">Addresses</TabsTrigger>
          </TabsList>

          {/* PROFILE */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveProfile} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={profile.full_name || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, full_name: e.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email || ""}
                      disabled
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      value={profile.phone || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, phone: e.target.value }))
                      }
                      placeholder="Enter phone number"
                    />
                  </div>

                  <Separator />
                  <Button type="submit" disabled={savingProfile || loadingProfile}>
                    {savingProfile ? "Saving..." : "Save Changes"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PASSWORD */}
          <TabsContent value="password">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={changePassword} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="flex gap-2">
                      <Input
                        id="currentPassword"
                        type={show.current ? "text" : "password"}
                        value={pw.current}
                        onChange={(e) =>
                          setPw((p) => ({ ...p, current: e.target.value }))
                        }
                        required
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setShow((s) => ({ ...s, current: !s.current }))
                        }
                      >
                        {show.current ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="flex gap-2">
                      <Input
                        id="newPassword"
                        type={show.next ? "text" : "password"}
                        value={pw.next}
                        onChange={(e) =>
                          setPw((p) => ({ ...p, next: e.target.value }))
                        }
                        required
                        minLength={8}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setShow((s) => ({ ...s, next: !s.next }))
                        }
                      >
                        {show.next ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Must be at least 8 characters
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">
                      Confirm New Password
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="confirmPassword"
                        type={show.confirm ? "text" : "password"}
                        value={pw.confirm}
                        onChange={(e) =>
                          setPw((p) => ({ ...p, confirm: e.target.value }))
                        }
                        required
                        minLength={8}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setShow((s) => ({ ...s, confirm: !s.confirm }))
                        }
                      >
                        {show.confirm ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {pw.confirm.length > 0 && (
                      <p
                        className={`text-xs ${
                          pw.next === pw.confirm
                            ? "text-emerald-600"
                            : "text-destructive"
                        }`}
                      >
                        {pw.next === pw.confirm
                          ? "Passwords match"
                          : "Passwords do not match"}
                      </p>
                    )}
                  </div>

                  <Separator />
                  <Button type="submit" disabled={savingPassword}>
                    {savingPassword ? "Changing..." : "Change Password"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ADDRESSES */}
          <TabsContent value="addresses">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Saved Addresses</CardTitle>
                    <CardDescription>
                      Manage your shipping addresses
                    </CardDescription>
                  </div>
                  <Button onClick={() => openAdd()}>Add New Address</Button>
                </div>
              </CardHeader>
              <CardContent>
                {addresses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No saved addresses yet
                    <div className="mt-4">
                      <Button onClick={() => openAdd()}>Add Address</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {addresses.map((a) => (
                      <Card key={a.id}>
                        <CardContent className="p-4 flex justify-between items-start gap-4">
                          <div>
                            <p className="font-medium">
                              {a.line1}
                              {a.line2 ? `, ${a.line2}` : ""}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {a.city}, {a.state} - {a.pincode}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {a.country}
                              {a.is_default ? " • Default" : ""}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {!a.is_default && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => makeDefault(a.id)}
                                disabled={defaultingAddressId === a.id}
                              >
                                {defaultingAddressId === a.id ? "Setting..." : "Set Default"}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAdd(a)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteAddress(a.id)}
                              disabled={deletingAddressId === a.id}
                            >
                              {deletingAddressId === a.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Address dialog */}
      <Dialog open={addrDialog} onOpenChange={setAddrDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Address" : "Add Address"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Address line 1 *</Label>
              <Input
                value={addrForm.line1}
                onChange={(e) =>
                  setAddrForm((f) => ({ ...f, line1: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label>Address line 2</Label>
              <Input
                value={addrForm.line2}
                onChange={(e) =>
                  setAddrForm((f) => ({ ...f, line2: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>City *</Label>
                <Input
                  value={addrForm.city}
                  onChange={(e) =>
                    setAddrForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>State *</Label>
                <Input
                  value={addrForm.state}
                  onChange={(e) =>
                    setAddrForm((f) => ({ ...f, state: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Pincode *</Label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={addrForm.pincode}
                  onChange={(e) =>
                    setAddrForm((f) => ({
                      ...f,
                      pincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                    }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>Country</Label>
                <Input
                  value={addrForm.country}
                  onChange={(e) =>
                    setAddrForm((f) => ({ ...f, country: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="default"
                type="checkbox"
                checked={addrForm.is_default}
                onChange={(e) =>
                  setAddrForm((f) => ({ ...f, is_default: e.target.checked }))
                }
              />
              <Label htmlFor="default">Set as default</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddrDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveAddress} disabled={savingAddress}>
              {savingAddress ? "Saving..." : editing ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}
