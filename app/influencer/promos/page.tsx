"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Check } from "lucide-react";

type Promo = {
  id: string;
  code: string;
  scope: "global" | "product";
  product_id: string | null;
  discount_percent: number; // user %
  commission_percent: number; // influencer %
  active: boolean;
  uses?: number;
  max_uses?: number | null;
  starts_at: string | null;
  expires_at: string | null;
};

export default function PromosPage() {
  const supabase = createClientComponentClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [items, setItems] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // form state (global only)
  const [code, setCode] = useState("");
  const [userPct, setUserPct] = useState(10);
  const [commPct, setCommPct] = useState(10);

  // Grab token once and bridge cookies (best-effort)
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || null;
      setAccessToken(token);

      if (token && session?.refresh_token) {
        fetch("/api/auth/attach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            access_token: token,
            refresh_token: session.refresh_token,
          }),
        }).catch(() => {});
      }
    })();
  }, [supabase]);

  async function loadPromos() {
    if (!accessToken) return;
    setLoading(true);
    const res = await fetch("/api/influencer/promos", {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) setItems(j.promos || []);
    setLoading(false);
  }

  useEffect(() => {
    if (accessToken) loadPromos();
  }, [accessToken]);

  function resetForm() {
    setCode("");
    setUserPct(10);
    setCommPct(10);
  }

  async function createPromo() {
    setMsg(null);
    if (!accessToken) {
      setMsg("Please sign in again.");
      return;
    }

    // Friendly validations
    if (!code.trim()) {
      setMsg("Enter your code.");
      return;
    }
    if (userPct < 0 || userPct > 100 || commPct < 0 || commPct > 100) {
      setMsg("Percents must be between 0 and 100.");
      return;
    }

    // Payload — scope/product are omitted; API forces global
    const payload: any = {
      code: code.trim().toUpperCase(),
      discount_percent: Number(userPct),
      commission_percent: Number(commPct),
    };

    const res = await fetch("/api/influencer/promos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.ok) {
      setMsg(j?.error || "Could not create promo.");
      return;
    }

    setMsg("Promo created 🎉");
    resetForm();
    await loadPromos();
  }

  const capHint =
    "Global code: applies to entire cart; each product’s cap is enforced during checkout.";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-4">
      {/* Title */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold">Promo codes</h1>
        <p className="mt-1 text-xs text-neutral-600">
          Create a simple code your audience can remember. Only global codes are
          allowed.
        </p>
      </div>

      {/* Create card */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        {msg && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {msg}
          </div>
        )}

        {/* Static "Global" pill */}
        <div className="mb-3">
          <div className="inline-flex rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            Global (cart-wide)
          </div>
        </div>

        {/* Code + percents */}
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium">Code</label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm uppercase"
              placeholder="MYCODE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              Customer discount (%)
            </label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={userPct}
              onChange={(e) => setUserPct(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              Your commission (%)
            </label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={commPct}
              onChange={(e) => setCommPct(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Helper buttons */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
            onClick={() => {
              setUserPct(10);
              setCommPct(10);
            }}
          >
            <Check className="h-4 w-4" /> Recommended 10% + 10%
          </button>
          <p className="text-[11px] text-neutral-600">{capHint}</p>
        </div>

        {/* Create */}
        <div className="mt-3">
          <button
            className="w-full rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            onClick={createPromo}
            disabled={!code.trim()}
          >
            Create promo
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border bg-white p-3 shadow-sm">
        <h2 className="px-1 text-base font-semibold">Your promo codes</h2>
        {loading ? (
          <p className="px-1 py-3 text-sm text-neutral-600">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-1 py-3 text-sm text-neutral-600">No promos yet.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {items.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-lg border bg-neutral-50 px-2 py-1 text-xs font-semibold">
                      {p.code}
                    </span>
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] bg-emerald-50 text-emerald-700">
                      Global
                    </span>
                    {p.active ? (
                      <span className="text-[11px] text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="text-[11px] text-neutral-500">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Applies to entire cart • Customer {p.discount_percent}% +
                    You {p.commission_percent}%
                    {typeof p.uses === "number"
                      ? ` • Uses ${p.uses}${
                          p.max_uses ? ` / ${p.max_uses}` : ""
                        }`
                      : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
