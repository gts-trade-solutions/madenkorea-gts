"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search,
  ShieldCheck,
  ShieldOff,
  Lock,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { COUNTRY_PROFILES, type CountryCode } from "@/lib/countries";
import { CountryFlag } from "@/components/CountryFlag";

// Admin Users page.
// Lists every account (paginated, search by email/name/phone) and lets
// an admin promote a customer to `admin` or revoke admin from another
// admin. Super admins show up with a locked badge and no toggle.
//
// All safety rails (self-demote, last-admin guard, super-admin immune)
// live in /api/admin/users/[user_id]. The UI mirrors them so the wrong
// buttons never even render — but the server is the source of truth.

const PAGE_LIMIT = 50;

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  preferred_country: string | null;
  role: "customer" | "admin" | "super_admin";
  last_sign_in_at: string | null;
  created_at: string | null;
};

type UsersResponse = {
  ok: boolean;
  total: number;
  page: number;
  limit: number;
  users: UserRow[];
  current_user_id: string;
  error?: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function roleBadge(role: UserRow["role"]) {
  if (role === "super_admin") {
    return (
      <Badge className="bg-purple-100 text-purple-800 border border-purple-300">
        <Lock className="h-3 w-3 mr-1" /> SUPER ADMIN
      </Badge>
    );
  }
  if (role === "admin") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300">
        <ShieldCheck className="h-3 w-3 mr-1" /> Admin
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Customer
    </Badge>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { hasRole, ready } = useAuth();

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    row: UserRow;
    nextRole: "customer" | "admin";
  } | null>(null);

  const fetchPage = async (qParam: string, p: number) => {
    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const params = new URLSearchParams();
      if (qParam.trim()) params.set("q", qParam.trim());
      params.set("page", String(p));
      params.set("limit", String(PAGE_LIMIT));
      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        credentials: "include",
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      });
      const body: UsersResponse = await res.json();
      if (!res.ok || body.ok === false) {
        toast.error(body.error || `HTTP ${res.status}`);
        return;
      }
      setData(body);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (!hasRole("admin")) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
      return;
    }
    fetchPage(q, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasRole, router, page]);

  // Debounced search — wait 300ms after the user stops typing, then
  // reset to page 1 and refetch.
  useEffect(() => {
    if (!ready || !hasRole("admin")) return;
    const handle = setTimeout(() => {
      setPage(1);
      fetchPage(q, 1);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  if (!ready) {
    return (
      <>
        <AdminBackBar to="/admin" title="Users" />
        <div className="container mx-auto py-6 max-w-6xl">
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </div>
      </>
    );
  }
  if (!hasRole("admin")) return null;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const currentUserId = data?.current_user_id ?? null;

  const performRoleChange = async (
    row: UserRow,
    nextRole: "customer" | "admin"
  ) => {
    setBusyRow(row.id);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(`/api/admin/users/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role: nextRole }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        const code = body?.code || body?.error;
        if (code === "CANNOT_MODIFY_SUPER_ADMIN") {
          toast.error("Super admin cannot be modified from this page.");
        } else if (code === "CANNOT_DEMOTE_SELF") {
          toast.error("You cannot demote your own account.");
        } else if (code === "LAST_ADMIN_GUARD") {
          toast.error(
            "There must always be at least one admin. Promote another user first."
          );
        } else {
          toast.error(body?.error || "Failed to update role.");
        }
        return;
      }
      toast.success(
        nextRole === "admin" ? "Admin access granted." : "Admin access removed."
      );
      // Optimistic update — patch the row locally + bust the cache by
      // refetching the same page so other fields stay accurate.
      setData((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((u) =>
                u.id === row.id ? { ...u, role: nextRole } : u
              ),
            }
          : prev
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to update role.");
    } finally {
      setBusyRow(null);
      setConfirming(null);
    }
  };

  return (
    <>
      <AdminBackBar to="/admin" title="Users" />

      <div className="container mx-auto py-6 space-y-4 max-w-6xl">
        <p className="text-sm text-muted-foreground">
          Manage account-level admin access. Promoting a user grants full
          access to every <code>/admin/*</code> surface. Super-admin
          accounts are immune to demotion from this page — only direct
          database access can change them.
        </p>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by email, name, or phone…"
            className="pl-10"
          />
        </div>

        {/* Counts */}
        <div className="text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : data
            ? `${data.total.toLocaleString()} user${
                data.total === 1 ? "" : "s"
              } · page ${data.page} of ${totalPages}`
            : "—"}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 font-medium">Country</th>
                  <th className="text-left px-4 py-3 font-medium">Last sign-in</th>
                  <th className="text-left px-4 py-3 font-medium">Joined</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Loading users…
                    </td>
                  </tr>
                )}
                {!loading && data && data.users.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      No users match this search.
                    </td>
                  </tr>
                )}
                {!loading &&
                  data?.users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const isSuper = u.role === "super_admin";
                    const isAdmin = u.role === "admin";
                    return (
                      <tr
                        key={u.id}
                        className={`border-b last:border-b-0 hover:bg-muted/30 ${
                          isSelf ? "bg-muted/20" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[220px]" title={u.email ?? ""}>
                              {u.email ?? "—"}
                            </span>
                            {isSelf && (
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase tracking-wide"
                              >
                                You
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {u.full_name?.trim() || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{roleBadge(u.role)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {u.phone || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {u.preferred_country
                            ? (() => {
                                const cc = u.preferred_country as CountryCode;
                                const profile = COUNTRY_PROFILES[cc];
                                return profile ? (
                                  <span
                                    className="inline-flex items-center gap-1.5"
                                    title={profile.name}
                                  >
                                    <CountryFlag code={cc} />
                                    <span className="tabular-nums">{cc}</span>
                                  </span>
                                ) : (
                                  u.preferred_country
                                );
                              })()
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          {formatDate(u.last_sign_in_at)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isSuper ? (
                            <span
                              className="inline-flex items-center text-xs text-muted-foreground"
                              title="Super admin cannot be demoted from this page."
                            >
                              <Lock className="h-3.5 w-3.5 mr-1" /> Protected
                            </span>
                          ) : isAdmin && isSelf ? (
                            <span
                              className="inline-flex items-center text-xs text-muted-foreground"
                              title="You cannot demote your own account."
                            >
                              <Lock className="h-3.5 w-3.5 mr-1" /> Your account
                            </span>
                          ) : isAdmin ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-700 hover:bg-red-50"
                              disabled={busyRow === u.id}
                              onClick={() =>
                                setConfirming({ row: u, nextRole: "customer" })
                              }
                            >
                              <ShieldOff className="h-4 w-4 mr-1" />
                              Remove admin
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyRow === u.id}
                              onClick={() =>
                                setConfirming({ row: u, nextRole: "admin" })
                              }
                            >
                              <ShieldCheck className="h-4 w-4 mr-1" />
                              Make admin
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Showing {(data.page - 1) * data.limit + 1}–
              {Math.min(data.page * data.limit, data.total)} of {data.total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {data.page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
          onClick={() => !busyRow && setConfirming(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">
              {confirming.nextRole === "admin"
                ? "Grant admin access?"
                : "Remove admin access?"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {confirming.nextRole === "admin" ? (
                <>
                  This will give{" "}
                  <strong>{confirming.row.email ?? confirming.row.full_name}</strong>{" "}
                  full access to every <code>/admin/*</code> page in the
                  application. They&apos;ll be able to read and modify all
                  data the admin section exposes.
                </>
              ) : (
                <>
                  This will revoke admin access from{" "}
                  <strong>{confirming.row.email ?? confirming.row.full_name}</strong>.
                  They will return to being a regular customer immediately.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirming(null)}
                disabled={!!busyRow}
              >
                Cancel
              </Button>
              <Button
                variant={confirming.nextRole === "admin" ? "default" : "destructive"}
                onClick={() => performRoleChange(confirming.row, confirming.nextRole)}
                disabled={!!busyRow}
              >
                {busyRow ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                {confirming.nextRole === "admin" ? "Grant admin" : "Remove admin"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
