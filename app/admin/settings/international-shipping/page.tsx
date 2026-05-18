"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Flag } from "@/components/Flag";
import {
  SUPPORTED_COUNTRIES,
  COUNTRY_PROFILES,
  type CountryCode,
} from "@/lib/countries";

// Per-country shipping rate editor for international payments.
// India is intentionally excluded — it uses the existing
// /admin/settings (threshold + flat fee) configuration.
//
// Spec: INTERNATIONAL_PAYMENTS.md → step 3

type RateRow = {
  country: string;
  rate_per_gram_inr: number;
  active: boolean;
  notes: string | null;
  updated_at: string | null;
};

type DraftRow = {
  country: CountryCode;
  rate: string;        // string while editing; parsed on save
  active: boolean;
  notes: string;
  isPersisted: boolean;
  dirty: boolean;
  saving: boolean;
};

// Countries we offer in the switcher minus India — these are the only
// destinations a buyer can actually checkout from.
const ELIGIBLE_COUNTRIES = SUPPORTED_COUNTRIES.filter((c) => c !== "IN");

export default function InternationalShippingPage() {
  const router = useRouter();
  const { hasRole, ready } = useAuth();

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for auth to resolve before deciding to redirect; without
    // this, the first render sees `hasRole=false` (user not loaded
    // yet) and we'd kick admins to /admin before their session lands.
    if (!ready) return;

    if (!hasRole("admin")) {
      router.push("/admin");
      return;
    }

    (async () => {
      setLoadError(null);
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch("/api/admin/settings/international-shipping", {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.ok === false) {
          const msg = body.error || `HTTP ${res.status}`;
          setLoadError(msg);
          toast.error(msg);
          return;
        }

        const rates: RateRow[] = body.rates ?? [];
        const byCountry = new Map(rates.map((r) => [r.country, r]));

        // Seed one DraftRow per eligible country. If a row exists in DB
        // we mark it persisted so the UI shows "active" badges; if not,
        // the draft is empty and saving creates the row.
        const seeded: DraftRow[] = ELIGIBLE_COUNTRIES.map((c) => {
          const r = byCountry.get(c);
          return {
            country: c,
            rate: r ? String(r.rate_per_gram_inr) : "",
            active: r ? r.active : true,
            notes: r?.notes ?? "",
            isPersisted: !!r,
            dirty: false,
            saving: false,
          };
        });

        setDrafts(seeded);
      } catch (e: any) {
        const msg = e?.message || "Failed to load rates";
        setLoadError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, hasRole, router]);

  const totalConfigured = useMemo(
    () => drafts.filter((d) => d.isPersisted && d.active).length,
    [drafts]
  );

  // While auth resolves, show a placeholder instead of either flashing
  // "Loading…" then redirecting or returning null (which renders blank).
  if (!ready) {
    return (
      <>
        <AdminBackBar to="/admin/settings" title="International Shipping" />
        <div className="container mx-auto py-6 max-w-4xl">
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </div>
      </>
    );
  }
  if (!hasRole("admin")) return null;

  const updateDraft = (country: CountryCode, patch: Partial<DraftRow>) => {
    setDrafts((rows) =>
      rows.map((r) =>
        r.country === country ? { ...r, ...patch, dirty: true } : r
      )
    );
  };

  const saveRow = async (country: CountryCode) => {
    const row = drafts.find((d) => d.country === country);
    if (!row) return;

    const rateNum = Number(row.rate);
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      toast.error("Rate must be a number ≥ 0");
      return;
    }

    setDrafts((rs) =>
      rs.map((r) => (r.country === country ? { ...r, saving: true } : r))
    );

    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/settings/international-shipping", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          country,
          rate_per_gram_inr: rateNum,
          active: row.active,
          notes: row.notes || null,
        }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        toast.error(body.error || "Save failed");
        return;
      }
      toast.success(`Saved ${country}`);
      setDrafts((rs) =>
        rs.map((r) =>
          r.country === country
            ? { ...r, dirty: false, isPersisted: true, saving: false }
            : r
        )
      );
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
      setDrafts((rs) =>
        rs.map((r) => (r.country === country ? { ...r, saving: false } : r))
      );
    }
  };

  return (
    <>
      <AdminBackBar to="/admin/settings" title="International Shipping" />

      <div className="container mx-auto py-6 space-y-4 max-w-4xl">
        <p className="text-sm text-muted-foreground">
          Per-country rate in <strong>₹ per gram</strong>. Order shipping ={" "}
          <code>Σ(product net weight × quantity) × country rate</code>, then
          FX-converted to the buyer&apos;s currency at checkout. Countries
          without a rate or marked inactive cannot complete an international
          payment.
        </p>

        <div className="text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : `${totalConfigured} of ${ELIGIBLE_COUNTRIES.length} countries active.`}
        </div>

        {loadError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <strong>Couldn’t load rates.</strong>
            <p className="mt-1 text-xs font-mono">{loadError}</p>
            <p className="mt-1 text-xs">
              If this keeps happening, sign out and back in to refresh your
              admin session, then reload this page.
            </p>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Country</th>
                  <th className="text-left px-4 py-3 font-medium">
                    Rate (₹/gram)
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Notes</th>
                  <th className="text-left px-4 py-3 font-medium">Active</th>
                  <th className="text-right px-4 py-3 font-medium">Save</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading &&
                  drafts.map((d) => {
                    const profile = COUNTRY_PROFILES[d.country];
                    return (
                      <tr
                        key={d.country}
                        className="border-b last:border-b-0 hover:bg-muted/30"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Flag
                              code={d.country}
                              width={20}
                              className="rounded-[2px] shrink-0"
                              alt=""
                            />
                            <span className="font-medium">{profile.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {d.country}
                            </span>
                            {!d.isPersisted && (
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                Not set
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 w-44">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={d.rate}
                            onChange={(e) =>
                              updateDraft(d.country, { rate: e.target.value })
                            }
                            placeholder="0.00"
                            className="h-8"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            value={d.notes}
                            onChange={(e) =>
                              updateDraft(d.country, { notes: e.target.value })
                            }
                            placeholder="Internal note (optional)"
                            className="h-8"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Switch
                            checked={d.active}
                            onCheckedChange={(v) =>
                              updateDraft(d.country, { active: v })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant={d.dirty ? "default" : "outline"}
                            onClick={() => saveRow(d.country)}
                            disabled={d.saving || !d.dirty}
                          >
                            {d.saving ? "Saving…" : "Save"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          India uses the existing <code>Settings → Shipping</code> threshold +
          flat-fee configuration, not this table.
        </p>
      </div>
    </>
  );
}
