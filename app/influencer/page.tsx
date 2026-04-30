"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Wallet,
  IndianRupee,
  TrendingUp,
  CheckCircle2,
  Clock,
  Share2,
  ChevronRight,
  Send,
  BadgePercent,
  Copy,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";

/* ---------- Types ---------- */
type PromoRow = {
  id: string;
  code: string;
  scope?: "global" | "product"; // we only create/manage global here
  product_id?: string | null; // should be null for global
  active: boolean;
  discount_percent: number; // customer %
  commission_percent: number; // influencer %
  uses?: number;
  max_uses?: number | null;
};

type PayoutRow = {
  id: string;
  amount: number;
  currency?: string | null;
  status: "initiated" | "processing" | "paid" | "failed" | "canceled";
  notes?: string | null;
  created_at: string;
  paid_at?: string | null;
  covering_orders?: string[] | null;
};

type SummaryResp = {
  lifetime_commission: number;
  pending_total: number;
  paid_total: number;
  available_to_withdraw: number;
};

type WalletData = {
  upi_id?: string | null;
  bank?: {
    name?: string | null;
    number?: string | null;
    ifsc?: string | null;
  } | null;
};

// total split cap
const MAX_SPLIT = 25;

const RECOMMENDED_USER = 10;
const RECOMMENDED_COMM = MAX_SPLIT - RECOMMENDED_USER;

/* ---------- Page ---------- */
export default function InfluencerDashboardPage() {
  const supabase = createClientComponentClient();

  const [token, setToken] = useState<string | null>(null);

  // Stats
  const [loadingStats, setLoadingStats] = useState(true);
  const [statLifetime, setStatLifetime] = useState(0);
  const [statPending, setStatPending] = useState(0);
  const [statPaid, setStatPaid] = useState(0);
  const [statWallet, setStatWallet] = useState(0);

  // Wallet & payout modals
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [savedWallet, setSavedWallet] = useState<WalletData | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);

  // Promos
  const [promoLoading, setPromoLoading] = useState(false);
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [code, setCode] = useState("");
  const [userPct, setUserPct] = useState(10);
  const [commPct, setCommPct] = useState(MAX_SPLIT - 10); // auto-split
  const sumPct = useMemo(
    () => Number(userPct || 0) + Number(commPct || 0),
    [userPct, commPct]
  );

  // field-level errors
  const [codeError, setCodeError] = useState<string | null>(null);
  const [userPctError, setUserPctError] = useState<string | null>(null);

  const [editing, setEditing] = useState<PromoRow | null>(null);
  const [deleting, setDeleting] = useState<PromoRow | null>(null);

  // Payouts list (compact)
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // messaging
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null); // for generic promo list errors

  /* ---------- Auth bootstrap & cookie bridge ---------- */
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const t = session?.access_token || null;
      setToken(t);
      if (t && session?.refresh_token) {
        fetch("/api/auth/attach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            access_token: t,
            refresh_token: session.refresh_token,
          }),
        }).catch(() => {});
      }
    })();
  }, [supabase]);

  /* ---------- Load summary stats ---------- */
  const loadSummary = async (tk: string) => {
    setLoadingStats(true);
    try {
      const r = await fetch("/api/me/summary", {
        headers: { Authorization: `Bearer ${tk}` },
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      console.log(j);
      if (r.ok && j?.ok) {
        setStatLifetime(Number(j.lifetime_commission || 0));
        setStatPending(Number(j.pending_total || 0));
        setStatPaid(Number(j.paid_total || 0));
        setStatWallet(Number(j.available_to_withdraw || 0));
      }
    } finally {
      setLoadingStats(false);
    }
  };
  useEffect(() => {
    if (token) loadSummary(token);
  }, [token]);

  /* ---------- Wallet: load (GET /api/me/wallet) ---------- */
  const loadWallet = async () => {
    if (!token) return;
    setWalletLoading(true);
    setWalletError(null);
    try {
      const r = await fetch("/api/me/wallet", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) {
        // no saved wallet yet is OK; just mark disconnected
        setSavedWallet(null);
        setWalletConnected(false);
        if (j?.error) setWalletError(j.error);
      } else {
        const w: WalletData | null = j.wallet || null;
        setSavedWallet(w);
        setWalletConnected(!!(w?.upi_id || (w?.bank?.number && w?.bank?.ifsc)));
      }
    } catch (e: any) {
      setWalletError(e?.message || "Failed to load wallet");
      setSavedWallet(null);
      setWalletConnected(false);
    } finally {
      setWalletLoading(false);
    }
  };
  useEffect(() => {
    if (token) loadWallet();
  }, [token]);

  /* ---------- Load promos (global only) ---------- */
  const loadPromos = async () => {
    if (!token) return;
    setPromoLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/influencer/promos", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setErr(j?.error || "Failed to load promos");
      } else {
        const rows = (j.promos || []).filter(
          (p: any) =>
            (p.scope || (p.product_id ? "product" : "global")) === "global"
        );
        setPromos(rows);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to load promos");
    } finally {
      setPromoLoading(false);
    }
  };
  useEffect(() => {
    if (token) loadPromos();
  }, [token]);

  /* ---------- Create GLOBAL promo ---------- */
  const createPromo = async () => {
    if (!token) {
      setUserPctError("Please sign in again.");
      return;
    }

    // reset field errors
    setCodeError(null);
    setUserPctError(null);

    if (!code.trim()) {
      setCodeError("Enter your code.");
      return;
    }

    if (userPct < 0 || userPct > MAX_SPLIT) {
      setUserPctError(`Customer discount must be between 0 and ${MAX_SPLIT}%.`);
      return;
    }

    const autoComm = Math.max(0, MAX_SPLIT - Number(userPct || 0));
    setCommPct(autoComm);

    const payload: Record<string, any> = {
      code: code.trim().toUpperCase(),
      scope: "global",
      discount_percent: Number(userPct),
      commission_percent: autoComm,
      user_discount_pct: Number(userPct), // compat
      commission_pct: autoComm, // compat
    };

    const res = await fetch("/api/influencer/promos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));

    if (!res.ok || j?.ok === false) {
      // show API error under code field
      setCodeError(j?.error || "Could not create promo.");
      return;
    }

    setCode("");
    setUserPct(10);
    setCommPct(MAX_SPLIT - 10);
    setFlash("Promo created");
    setTimeout(() => setFlash(null), 1500);
    await loadPromos();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFlash("Copied");
    } catch {
      setFlash("Copy failed");
    }
    setTimeout(() => setFlash(null), 1200);
  };

  /* ---------- Payouts (history on dashboard) ---------- */
  const loadPayouts = async () => {
    if (!token) return;
    setListLoading(true);
    try {
      const res = await fetch("/api/me/payouts", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.ok) setPayouts((j.payouts || []) as PayoutRow[]);
    } finally {
      setListLoading(false);
    }
  };
  useEffect(() => {
    if (token) loadPayouts();
  }, [token]);

  // Keep this for UX messaging (we no longer hard-block opening the modal with it)
  const canRequest = statWallet > 0.0001;

  // Mask helper for showing saved wallet in the card header
  const walletBadgeText = (() => {
    if (walletLoading) return "Loading…";
    if (!walletConnected || !savedWallet) return "Not connected";
    if (savedWallet.upi_id) return `UPI • ${savedWallet.upi_id}`;
    const last4 = savedWallet.bank?.number
      ? savedWallet.bank.number.slice(-4)
      : "";
    return last4 ? `Bank • ****${last4}` : "Bank • saved";
  })();

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4">
      {/* ===== STATS ROW ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          loading={loadingStats}
          icon={<TrendingUp className="h-5 w-5" />}
          label="Commission (lifetime)"
          value={toINR(statLifetime)}
        />
        <StatCard
          loading={loadingStats}
          icon={<Clock className="h-5 w-5" />}
          label="Pending"
          value={toINR(statPending)}
        />
        <StatCard
          loading={loadingStats}
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Paid"
          value={toINR(statPaid)}
        />
        <StatCard
          loading={loadingStats}
          icon={<IndianRupee className="h-5 w-5" />}
          label="Available"
          value={toINR(statWallet)}
        />
      </div>

      {/* ===== WALLET & REDEEM ===== */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-50 p-2">
                <Wallet className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <div className="text-sm font-semibold">Manual payouts</div>
                <p className="text-xs text-neutral-600">
                  Submit your UPI/Bank details and choose an amount to withdraw.
                </p>
                <p className="mt-1 text-[11px] text-neutral-600">
                  <span className="font-medium">Wallet:</span> {walletBadgeText}
                </p>
                {walletError && (
                  <p className="mt-1 text-[11px] text-red-700">{walletError}</p>
                )}
              </div>
            </div>
            <button
              className="rounded-lg border bg-neutral-50 px-3 py-2 text-sm font-medium"
              onClick={() => setShowWalletModal(true)}
            >
              {walletConnected ? "Manage wallet" : "Set up wallet"}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => setShowRedeemModal(true)}
              disabled={loadingStats}
            >
              <Send className="h-4 w-4" />
              Request payout
            </button>
            <a
              href="/influencer/payouts"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-neutral-50 px-4 py-2.5 text-sm font-semibold"
            >
              See payout history
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-2 text-[11px] text-neutral-600">
            Available to withdraw: {toINR(statWallet)}. You can request any
            amount up to this balance.
          </p>
          {!canRequest && !loadingStats && (
            <p className="mt-1 text-[11px] text-red-600">
              You don&apos;t have any approved balance yet. Once your
              commissions are approved, they&apos;ll appear in Available and you
              can request a payout.
            </p>
          )}
        </div>
      </div>

      {/* ===== PROMOS: CREATE + LIST (INLINE) ===== */}
      <div className="mt-4 space-y-4">
        {/* Create */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4" />
              <div className="text-sm font-semibold">Create a global promo</div>
            </div>
            {flash && (
              <div className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                {flash}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Code</label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm uppercase"
                placeholder="MYCODE"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setCodeError(null);
                }}
              />
              {codeError && (
                <p className="mt-1 text-[11px] text-red-600">{codeError}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Customer discount (%)
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                type="number"
                min={0}
                max={MAX_SPLIT}
                step={0.5}
                value={userPct}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (Number.isNaN(raw)) {
                    setUserPct(0);
                    setCommPct(MAX_SPLIT);
                    setUserPctError(null);
                    return;
                  }
                  let value = raw;
                  if (value < 0) value = 0;
                  if (value > MAX_SPLIT) value = MAX_SPLIT;
                  setUserPct(value);
                  setCommPct(MAX_SPLIT - value);
                  setUserPctError(null);
                }}
              />
              {userPctError && (
                <p className="mt-1 text-[11px] text-red-600">{userPctError}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Your commission (%)
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm bg-neutral-50"
                type="number"
                value={commPct}
                disabled
                readOnly
              />
              <p className="mt-1 text-[11px] text-neutral-600">
                Auto-calculated so total stays at {MAX_SPLIT}%.
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
              onClick={() => {
                setUserPct(RECOMMENDED_USER);
    setCommPct(RECOMMENDED_COMM);
                setUserPctError(null);
                setCodeError(null);
              }}
            >
              <Check className="h-4 w-4" /> Recommended {RECOMMENDED_USER}% + {RECOMMENDED_COMM}%
            </button>
            <p className="text-[11px] text-neutral-600">
              Split total: {sumPct}% of {MAX_SPLIT}% cap.
            </p>
          </div>

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

        {/* List + manage */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Your promo codes</div>
            {err && (
              <div className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">
                {err}
              </div>
            )}
          </div>
          {promoLoading ? (
            <ListSkeleton />
          ) : promos.length === 0 ? (
            <EmptyState
              title="No promos yet"
              desc="Create a simple code your audience can remember."
            />
          ) : (
            <ul className="divide-y">
              {promos.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col items-start gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-lg border bg-neutral-50 px-2 py-1 text-xs font-semibold">
                        {p.code}
                        <button
                          className="rounded p-1 hover:bg-neutral-100"
                          onClick={() => copy(p.code)}
                          aria-label="Copy code"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </span>
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                        Global
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${
                          p.active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {p.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-neutral-600">
                      Customer {p.discount_percent}% + You{" "}
                      {p.commission_percent}%
                      {typeof p.uses === "number"
                        ? ` • Uses ${p.uses}${
                            p.max_uses ? ` / ${p.max_uses}` : ""
                          }`
                        : ""}
                    </div>
                  </div>

                  <div className="flex w-full gap-2 sm:w-auto">
                    <button
                      onClick={() => setEditing(p)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-neutral-50 px-3 py-2 text-xs font-semibold sm:w-auto"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleting(p)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 sm:w-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ===== Payouts History (compact) ===== */}
      <div className="mt-4 rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-2 text-sm font-semibold">Recent payout activity</div>
        {listLoading ? (
          <ListSkeleton />
        ) : payouts.length === 0 ? (
          <EmptyState
            title="No payouts yet"
            desc="Use the Request button above to submit your first payout."
          />
        ) : (
          <ul className="divide-y">
            {payouts.slice(0, 8).map((p) => (
              <PayoutRowCard key={p.id} row={p} />
            ))}
          </ul>
        )}
        <a
          href="/influencer/payouts"
          className="mt-3 inline-block text-xs font-medium text-neutral-700 underline"
        >
          View all
        </a>
      </div>

      {/* ===== Wallet modal (LOAD + SAVE) ===== */}
      {showWalletModal && (
        <WalletModal
          onClose={() => setShowWalletModal(false)}
          loadInitial={savedWallet}
          onSaved={(w) => {
            setSavedWallet(w);
            setWalletConnected(
              !!(w.upi_id || (w.bank?.number && w.bank?.ifsc))
            );
            setFlash("Wallet saved");
            setTimeout(() => setFlash(null), 1200);
          }}
        />
      )}

      {/* ===== Redeem (manual payout) modal ===== */}
      {showRedeemModal && (
        <Modal
          onClose={() => setShowRedeemModal(false)}
          title="Request payout (manual)"
        >
          <RequestManualBody
            maxAmount={statWallet}
            onClose={() => setShowRedeemModal(false)}
            onDone={async () => {
              setShowRedeemModal(false);
              setFlash("Payout request submitted");
              await loadPayouts();
              if (token) await loadSummary(token);
            }}
          />
        </Modal>
      )}

      {/* ===== Edit / Delete promo modals ===== */}
      {editing && (
        <EditPromoModal
          promo={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await loadPromos();
            setFlash("Promo updated");
          }}
        />
      )}

      {deleting && (
        <DeletePromoModal
          promo={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            setDeleting(null);
            await loadPromos();
            setFlash("Promo deleted");
          }}
        />
      )}
    </div>
  );
}

/* ---------- Wallet Modal (GET/POST /api/me/wallet) ---------- */
function WalletModal({
  onClose,
  loadInitial,
  onSaved,
}: {
  onClose: () => void;
  loadInitial: WalletData | null;
  onSaved: (w: WalletData) => void;
}) {
  const supabase = createClientComponentClient();
  const [channel, setChannel] = useState<"upi" | "bank">(
    loadInitial?.upi_id ? "upi" : "bank"
  );
  const [upiId, setUpiId] = useState(loadInitial?.upi_id || "");
  const [accName, setAccName] = useState(loadInitial?.bank?.name || "");
  const [accNo, setAccNo] = useState(loadInitial?.bank?.number || "");
  const [ifsc, setIfsc] = useState(loadInitial?.bank?.ifsc || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Please sign in again.");
      return;
    }

    let payload: WalletData;
    if (channel === "upi") {
      if (!upiId.trim()) {
        setError("Enter a valid UPI ID.");
        return;
      }
      payload = { upi_id: upiId.trim(), bank: null };
    } else {
      if (!accName.trim() || !accNo.trim() || !ifsc.trim()) {
        setError("Enter account holder name, number and IFSC.");
        return;
      }
      payload = {
        upi_id: null,
        bank: { name: accName.trim(), number: accNo.trim(), ifsc: ifsc.trim() },
      };
    }

    setSaving(true);
    try {
      const res = await fetch("/api/me/wallet", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setError(j?.error || "Could not save wallet");
        return;
      }
      onSaved(payload);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Wallet / payout details" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setChannel("upi")}
            className={`rounded-xl border px-3 py-2 ${
              channel === "upi"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "bg-neutral-50"
            }`}
          >
            UPI
            <div className="text-[11px] text-neutral-600">
              Fast & simple (UPI ID)
            </div>
          </button>
          <button
            type="button"
            onClick={() => setChannel("bank")}
            className={`rounded-xl border px-3 py-2 ${
              channel === "bank"
                ? "border-sky-300 bg-sky-50 text-sky-800"
                : "bg-neutral-50"
            }`}
          >
            Bank
            <div className="text-[11px] text-neutral-600">Account + IFSC</div>
          </button>
        </div>

        {channel === "upi" ? (
          <div>
            <label className="text-xs font-medium">UPI ID</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="name@bank"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium">Account holder name</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="Full name"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium">Account number</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  placeholder="XXXXXXXXXX"
                  value={accNo}
                  onChange={(e) => setAccNo(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">IFSC</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  placeholder="HDFC0000000"
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <button
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-neutral-50 px-4 py-2 font-semibold"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save
          </button>
        </div>

        <div className="rounded-lg bg-neutral-50 p-2 text-[11px] text-neutral-600">
          Your details are only visible to our payouts team and used for
          transfers.
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Row Card (payout) ---------- */
function PayoutRowCard({ row }: { row: PayoutRow }) {
  const [open, setOpen] = useState(false);

  const badge = {
    initiated: { text: "Pending review", cls: "bg-amber-50 text-amber-700" },
    processing: { text: "Processing", cls: "bg-sky-50 text-sky-700" },
    paid: { text: "Settled", cls: "bg-emerald-50 text-emerald-700" },
    failed: { text: "Failed", cls: "bg-red-50 text-red-700" },
    canceled: { text: "Canceled", cls: "bg-neutral-100 text-neutral-700" },
  }[row.status];

  return (
    <li className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">
              {toINR(row.amount, row.currency)}
            </span>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${badge.cls}`}
            >
              {badge.text}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-neutral-600">
            {new Date(row.created_at).toLocaleString()}
            {row.status === "paid" && row.paid_at
              ? ` • Paid ${new Date(row.paid_at).toLocaleString()}`
              : ""}
            {row.notes ? ` • ${row.notes}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {row.covering_orders && row.covering_orders.length > 0 && (
            <button
              className="inline-flex items-center gap-1 rounded-lg border bg-neutral-50 px-3 py-1.5 text-xs"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Orders ({row.covering_orders.length})
            </button>
          )}
        </div>
      </div>

      {open && row.covering_orders && (
        <div className="mt-2 rounded-lg border bg-neutral-50 p-2 text-xs">
          <div className="mb-1 font-medium">Covering orders</div>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {row.covering_orders.map((oid) => (
              <li key={oid} className="truncate">
                Order: {oid}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/* ---------- Modal shell ---------- */
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="text-base font-semibold">{title}</div>
          <button
            className="rounded p-1 hover:bg-neutral-100"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Manual Request Body ---------- */
function RequestManualBody({
  maxAmount,
  onClose,
  onDone,
}: {
  maxAmount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClientComponentClient();

  const [amount, setAmount] = useState<number>(Math.floor(maxAmount) || 0);
  const [step, setStep] = useState<number>(
    Math.max(50, Math.round((maxAmount || 1000) / 50))
  );
  useEffect(() => {
    const fallback = Math.floor(maxAmount) || 0;
    setAmount(fallback);
    setStep(Math.max(50, Math.round((maxAmount || 1000) / 50)));
  }, [maxAmount]);

  const [channel, setChannel] = useState<"upi" | "bank">("upi");
  const [upiId, setUpiId] = useState("");
  const [accName, setAccName] = useState("");
  const [accNo, setAccNo] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!(amount > 0)) {
      setErr("Enter an amount greater than 0.");
      return;
    }
    if (amount > maxAmount + 0.0001) {
      setErr(`You can request up to ${toINR(maxAmount)} right now.`);
      return;
    }

    if (channel === "upi") {
      if (!upiId.trim()) {
        setErr("Enter your UPI ID.");
        return;
      }
    } else {
      if (!accName.trim() || !accNo.trim() || !ifsc.trim()) {
        setErr("Enter your bank account name, number, and IFSC.");
        return;
      }
    }

    setSaving(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setSaving(false);
      setErr("Please sign in again.");
      return;
    }

    const details = {
      payment_channel: channel,
      upi_id: channel === "upi" ? upiId.trim() : null,
      bank:
        channel === "bank"
          ? { name: accName.trim(), number: accNo.trim(), ifsc: ifsc.trim() }
          : null,
      contact: contact || null,
      user_note: note || null,
    };
    const request_note = `manual_payout | ${JSON.stringify(details)}`;

    const res = await fetch("/api/me/payouts/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify({
        method: "manual",
        amount: Number(amount),
        contact_email: contact || null,
        request_note,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok || j?.ok === false) {
      setErr(j?.error || "Could not submit request.");
      return;
    }
    onDone();
  };

  const canSubmit = maxAmount > 0 && !saving;

  return (
    <div className="space-y-4 text-sm">
      {maxAmount <= 0 && (
        <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">
          You don&apos;t have any available balance to withdraw right now. Once
          your commissions are approved and added to your wallet, you&apos;ll be
          able to submit a payout request here.
        </div>
      )}

      <div className="rounded-lg border bg-neutral-50 p-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Withdraw amount</div>
          <div className="text-sm font-bold">{toINR(amount)}</div>
        </div>
        <input
          type="range"
          className="mt-3 w-full"
          min={0}
          max={Math.floor(maxAmount)}
          step={step}
          value={amount}
          disabled={maxAmount <= 0}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={Math.floor(maxAmount)}
            step={step}
            className="w-28 rounded-lg border px-3 py-2"
            value={amount}
            disabled={maxAmount <= 0}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <div className="text-[11px] text-neutral-600">
            Available: {toINR(maxAmount)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setChannel("upi")}
          className={`rounded-xl border px-3 py-2 ${
            channel === "upi"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "bg-neutral-50"
          }`}
        >
          UPI transfer
          <div className="text-[11px] text-neutral-600">
            Fast & simple (UPI ID)
          </div>
        </button>
        <button
          type="button"
          onClick={() => setChannel("bank")}
          className={`rounded-xl border px-3 py-2 ${
            channel === "bank"
              ? "border-sky-300 bg-sky-50 text-sky-800"
              : "bg-neutral-50"
          }`}
        >
          Bank transfer
          <div className="text-[11px] text-neutral-600">Account + IFSC</div>
        </button>
      </div>

      {channel === "upi" ? (
        <div>
          <label className="text-xs font-medium">UPI ID</label>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="name@bank"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium">Account holder name</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="Full name"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium">Account number</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="XXXXXXXXXX"
                value={accNo}
                onChange={(e) => setAccNo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">IFSC</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="HDFC0000000"
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2 text-xs text-neutral-700">
        <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <div>
            Your payout request will appear as <em>Pending</em> until processed
            by admin. We&apos;ll notify our payouts team with your details.
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <button
          onClick={onClose}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-neutral-50 px-4 py-2 font-semibold"
        >
          <X className="h-4 w-4" /> Close
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Request payout
        </button>
      </div>
    </div>
  );
}

/* ---------- Edit & Delete Promo Modals ---------- */
function EditPromoModal({
  promo,
  onClose,
  onSaved,
}: {
  promo: PromoRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClientComponentClient();

  const [form, setForm] = useState({
    active: promo.active,
    discount_percent: promo.discount_percent,
    commission_percent: promo.commission_percent,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sum = useMemo(
    () =>
      Number(form.discount_percent || 0) + Number(form.commission_percent || 0),
    [form]
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setSaving(false);
      setError("Please sign in again.");
      return;
    }

    if (form.discount_percent < 0 || form.discount_percent > MAX_SPLIT) {
      setSaving(false);
      setError(`Customer % must be between 0 and ${MAX_SPLIT}.`);
      return;
    }

    const autoComm = Math.max(
      0,
      MAX_SPLIT - Number(form.discount_percent || 0)
    );

    const res = await fetch(
      `/api/influencer/promos/${encodeURIComponent(promo.id)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          active: !!form.active,
          discount_percent: Number(form.discount_percent),
          commission_percent: autoComm,
          user_discount_pct: Number(form.discount_percent),
          commission_pct: autoComm,
        }),
      }
    );
    const j = await res.json().catch(() => ({}));

    setSaving(false);
    if (!res.ok || j?.ok === false) {
      setError(j?.error || "Failed to save changes");
      return;
    }
    onSaved();
  };

  return (
    <Modal title={`Edit ${promo.code}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="flex items-center justify-between rounded-lg border bg-neutral-50 px-3 py-2">
          <span>Active</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.active}
            onChange={(e) =>
              setForm((f) => ({ ...f, active: e.target.checked }))
            }
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium">Customer %</label>
            <input
              type="number"
              min={0}
              max={MAX_SPLIT}
              step="0.5"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={form.discount_percent}
              onChange={(e) => {
                const raw = Number(e.target.value);
                let value = Number.isNaN(raw) ? 0 : raw;
                if (value < 0) value = 0;
                if (value > MAX_SPLIT) value = MAX_SPLIT;
                const autoComm = MAX_SPLIT - value;
                setForm((f) => ({
                  ...f,
                  discount_percent: value,
                  commission_percent: autoComm,
                }));
                setError(null);
              }}
            />
          </div>
          <div>
            <label className="text-xs font-medium">You %</label>
            <input
              type="number"
              min={0}
              max={MAX_SPLIT}
              step="0.5"
              className="mt-1 w-full rounded-lg border px-3 py-2 bg-neutral-50"
              value={form.commission_percent}
              disabled
              readOnly
            />
            <p className="mt-1 text-[11px] text-neutral-600">
              Auto-calculated so total stays at {MAX_SPLIT}%.
            </p>
          </div>
        </div>

        <p className="text-[11px] text-neutral-600">
          Split total: {sum}% of {MAX_SPLIT}% cap.
        </p>

        {error && (
          <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <button
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-neutral-50 px-4 py-2 font-semibold"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeletePromoModal({
  promo,
  onClose,
  onDeleted,
}: {
  promo: PromoRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const supabase = createClientComponentClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setBusy(false);
      setError("Please sign in again.");
      return;
    }

    const res = await fetch(
      `/api/influencer/promos/${encodeURIComponent(promo.id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      }
    );
    const j = await res.json().catch(() => ({}));

    setBusy(false);
    if (!res.ok || j?.ok === false) {
      setError(j?.error || "Failed to delete");
      return;
    }
    onDeleted();
  };

  return (
    <Modal title="Delete promo" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p>
          Are you sure you want to delete <strong>{promo.code}</strong>? This
          can’t be undone.
        </p>
        {error && (
          <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <button
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-neutral-50 px-4 py-2 font-semibold"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Small atoms ---------- */
function StatCard({
  loading,
  icon,
  label,
  value,
}: {
  loading: boolean;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-neutral-700">
        <div className="rounded-lg bg-neutral-50 p-2">{icon}</div>
        <div className="text-xs">{label}</div>
      </div>
      <div className="mt-2 text-lg font-bold">
        {loading ? (
          <span className="inline-block h-5 w-24 animate-pulse rounded bg-neutral-100" />
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border bg-neutral-50 p-4 text-center">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs text-neutral-600">{desc}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-neutral-100" />
            <div>
              <div className="mb-1 h-3 w-36 animate-pulse rounded bg-neutral-100" />
              <div className="h-2 w-24 animate-pulse rounded bg-neutral-100" />
            </div>
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-neutral-100" />
        </li>
      ))}
    </ul>
  );
}

function toINR(n: number, currency?: string | null) {
  const code = (currency || "INR").toUpperCase();
  try {
    return n.toLocaleString("en-IN", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${code === "INR" ? "₹" : code + " "}${Math.round(n)}`;
  }
}
