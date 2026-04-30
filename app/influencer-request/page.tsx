"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowRight,
  Gift,
  LineChart,
  ShieldCheck,
  Percent,
  Clock,
  X,
  BadgeCheck,
  Users2,
  Star,
  HelpCircle,
  ChevronDown,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/lib/contexts/AuthContext";

type Status = "none" | "pending" | "rejected" | "influencer" | "admin";

// ✅ Same pattern as your /auth/login and /account pages (persist session in localStorage)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export default function PartnerProgramPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // status
  const [status, setStatus] = useState<Status>("none");
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const isApproved = status === "influencer" || status === "admin";

  // modal + form
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ✅ 1) Gate the page exactly like /account (NO anon UI here)
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/login?redirect=/influencer-request");
    }
  }, [isAuthenticated, router]);

  // ✅ 2) Attach browser session to server cookies ONCE (same idea as /auth/login + /auth/callback)
  const attachedOnce = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (attachedOnce.current) return;
    attachedOnce.current = true;

    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      const rt = s?.session?.refresh_token;
      if (!at || !rt) return;

      fetch("/api/auth/attach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ access_token: at, refresh_token: rt }),
      }).catch(() => {});
    })();
  }, [isAuthenticated]);

  // helper: get token or kick to login (no reload)
  const getAccessTokenOrRedirect = async () => {
    const { data } = await supabase.auth.getSession();
    const at = data.session?.access_token;
    if (!at) {
      router.replace("/auth/login?redirect=/influencer-request");
      return null;
    }
    return at;
  };

  // ✅ 3) Load influencer status once logged in
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      setErr(null);

      const at = await getAccessTokenOrRedirect();
      if (!at) return;

      try {
        const res = await fetch(`/api/influencer/status?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${at}` },
          cache: "no-store",
        });

        const j = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setErr(j?.error || "Failed to load status");
        } else {
          setStatus((j?.status as Status) ?? "none");
          setRequestedAt(j?.requested_at ?? null);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Network error. Please try again.");
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setSubmitting(true);

    const at = await getAccessTokenOrRedirect();
    if (!at) {
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/influencer/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${at}`,
        },
        credentials: "include",
        body: JSON.stringify({ handle, note, social: {} }),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok || j?.ok === false) {
        setErr(j?.error || "Failed to submit. Please try again.");
      } else {
        setMsg(j?.message || "Request submitted.");
        setHandle("");
        setNote("");
        setStatus("pending");
        setRequestedAt(new Date().toISOString());
        setOpen(false);
      }
    } catch (e: any) {
      setErr(e?.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ✅ Match /account behavior: if not authed, render nothing (redirect is happening)
  if (!isAuthenticated) return null;

  // ========== LOGGED-IN VIEW (your existing UI) ==========
  return (
    <>
      <Header />

      <div className="min-h-screen bg-[radial-gradient(60%_60%_at_20%_-10%,#FDECEC,transparent),radial-gradient(40%_50%_at_100%_0%,#E8F7FF,transparent)] text-neutral-900">
        {/* ============ HERO — Consumer Innovations banner ============ */}
        <section className="relative isolate">
          <div
            className="absolute inset-0 -z-10 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1616394584738-fc6e612b1df9?q=80&w=1920&auto=format&fit=crop')",
            }}
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white/70 via-white/40 to-white/10" />
          <div className="pointer-events-none absolute inset-0 -z-10 mix-blend-overlay [background:radial-gradient(60%_60%_at_50%_0%,rgba(255,255,255,0.2),rgba(255,255,255,0))]" />

          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
            <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-2xl backdrop-blur">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                    MadenKorea • Global codes • Consumer innovations
                  </p>
                  <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                    Partner with us. Share consumer innovations from Korea. Earn
                    more.
                  </h1>
                  <p className="mt-2 text-sm text-neutral-700">
                    Join our creator circle for Korean skincare and wellness.
                    Your audience gets a discount and you earn commission —
                    together capped at <strong>20% per product</strong> by
                    default for fairness.
                  </p>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    {isApproved ? (
                      <button
                        onClick={() => router.push("/influencer")}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400"
                      >
                        Visit partner portal <ArrowRight className="h-4 w-4" />
                      </button>
                    ) : status === "pending" ? (
                      <span className="inline-flex items-center justify-center rounded-xl bg-amber-300/90 px-4 py-3 text-sm font-semibold text-amber-900">
                        Pending review
                      </span>
                    ) : (
                      <button
                        onClick={() => setOpen(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-black/90"
                      >
                        Become a partner <ArrowRight className="h-4 w-4" />
                      </button>
                    )}

                    {!isApproved && (
                      <button
                        onClick={() => router.push("/")}
                        className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold hover:bg-white"
                      >
                        Explore catalog
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick feature chips */}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Chip
                  icon={<Percent className="h-4 w-4" />}
                  title="Fair & simple"
                  desc="Your % + buyer % ≤ 20% cap."
                />
                <Chip
                  icon={<Gift className="h-4 w-4" />}
                  title="Global code"
                  desc="One code across the cart."
                />
                <Chip
                  icon={<LineChart className="h-4 w-4" />}
                  title="Live tracking"
                  desc="Clicks, orders & payouts."
                />
                <Chip
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title="Auto-enforced"
                  desc="Caps handled at checkout."
                />
              </div>
            </div>
          </div>
        </section>

        {/* Wave divider */}
        <div className="relative h-10 -mt-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-white to-transparent [mask-image:radial-gradient(120%_50%_at_50%_-10%,black,transparent)]" />
        </div>

        {/* A. Steps */}
        <section className="mx-auto max-w-6xl px-4">
          <h2 className="mb-3 text-lg font-semibold">How it works</h2>
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Step
              n={1}
              title="Apply"
              desc="Tell us your handle & niche."
              color="bg-rose-100 text-rose-700"
            />
            <Step
              n={2}
              title="Approval"
              desc="We activate your portal."
              color="bg-amber-100 text-amber-700"
            />
            <Step
              n={3}
              title="Share"
              desc="Links + global promo code."
              color="bg-sky-100 text-sky-700"
            />
            <Step
              n={4}
              title="Earn"
              desc="Commission on eligible sales."
              color="bg-emerald-100 text-emerald-700"
            />
          </ol>
        </section>

        {/* Pending ribbon */}
        {!isApproved && !statusLoading && status === "pending" && (
          <section className="mx-auto mt-4 max-w-6xl px-4">
            <div className="rounded-2xl border bg-amber-50 p-4 text-amber-900">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" />
                Application received
              </div>
              <p className="mt-1 text-xs">
                Submitted on{" "}
                {requestedAt ? new Date(requestedAt).toLocaleString() : "—"}. We
                usually review within 1–2 business days.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                <span className="rounded-lg bg-white/70 px-2 py-1">
                  Submitted ✓
                </span>
                <span className="rounded-lg bg-white/70 px-2 py-1">
                  Reviewing …
                </span>
                <span className="rounded-lg bg-white/70 px-2 py-1">
                  Decision → Email
                </span>
              </div>
            </div>
          </section>
        )}

        {/* B. Trust stats */}
        <section className="mx-auto mt-6 max-w-6xl px-4">
          <div className="rounded-2xl border p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat
                icon={<Users2 className="h-5 w-5" />}
                label="Creators active"
                value="2,400+"
              />
              <Stat
                icon={<Star className="h-5 w-5" />}
                label="Avg. payout rating"
                value="4.9/5"
              />
              <Stat
                icon={<BadgeCheck className="h-5 w-5" />}
                label="Approval time"
                value="~24–48h"
              />
            </div>
          </div>
        </section>

        {/* D. Benefits grid */}
        <section className="mx-auto mt-6 max-w-6xl px-4">
          <h2 className="mb-3 text-lg font-semibold">Why creators love it</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card
              icon={<BadgeCheck className="h-5 w-5" />}
              title="Consumer innovations"
              desc="Thoughtfully curated formulas and routines your audience trusts."
              gradient="from-rose-100 to-fuchsia-50"
            />
            <Card
              icon={<LineChart className="h-5 w-5" />}
              title="Real-time insights"
              desc="Transparent performance, attribution, and payout history."
              gradient="from-sky-100 to-indigo-50"
            />
            <Card
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Hassle-free"
              desc="Per-product caps auto-enforced. You focus on creating."
              gradient="from-emerald-100 to-teal-50"
            />
          </div>
        </section>

        {/* E. FAQ */}
        <section className="mx-auto mt-6 max-w-6xl px-4 pb-16">
          <h2 className="mb-3 text-lg font-semibold">FAQ</h2>
          <div className="rounded-2xl border">
            <FaqItem
              q="What does the “20% cap” mean?"
              a="Customer discount + your commission together won’t exceed 20% per product by default. If a product has a lower cap, checkout clamps the split automatically."
            />
            <FaqItem
              q="Is my promo code global?"
              a="Yes. Your code is cart-wide, while caps are enforced per item at checkout to keep things fair."
            />
            <FaqItem
              q="When are payouts processed?"
              a="We batch commissions regularly; you’ll see pending/paid status and payout history in your portal."
            />
          </div>
        </section>

        {/* Application modal */}
        {open && !isApproved && status !== "pending" && (
          <div
            aria-modal="true"
            role="dialog"
            className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
            onClick={() => setOpen(false)}
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
                <h3 className="text-lg font-semibold">Become a partner</h3>
                <button
                  className="rounded p-1 hover:bg-neutral-100"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-3 text-sm text-neutral-600">
                Tell us your public handle and a short note about your content.
                We’ll review and email you.
              </p>

              <label className="mb-1 block text-xs font-medium">Name</label>
              <input
                className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="e.g. glowwithjin"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
              <label className="mb-1 block text-xs font-medium">Note</label>
              <textarea
                rows={4}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="What do you create? Who’s your audience?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : "Submit request"}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>

              <p className="mt-3 text-[11px] text-neutral-500">
                Global codes apply cart-wide; per-product caps (default 20%)
                auto-enforced at checkout.
              </p>
            </div>
          </div>
        )}

        {/* Inline form (fallback) */}
        {!isApproved &&
          !statusLoading &&
          (status === "none" || status === "rejected") &&
          !open && (
            <section className="mx-auto mt-2 max-w-6xl px-4 pb-16">
              <div className="rounded-2xl border p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Apply now</h2>
                  <button
                    onClick={() => setOpen(true)}
                    className="text-sm font-medium underline"
                  >
                    Open as modal
                  </button>
                </div>
                <form onSubmit={submit} className="mt-4 grid gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      Name
                    </label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="e.g. glowwithjin"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      Note
                    </label>
                    <textarea
                      rows={4}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Tell us briefly about your content and audience"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {submitting ? "Submitting…" : "Submit request"}
                  </button>
                </form>
              </div>
            </section>
          )}

        {(msg || err) && (
          <div
            className="fixed bottom-3 left-0 right-0 mx-auto w-[92%] max-w-md rounded-lg border p-3 text-sm shadow"
            style={{
              background: msg ? "#ecfdf5" : "#fef2f2",
              borderColor: msg ? "#a7f3d0" : "#fecaca",
              color: msg ? "#065f46" : "#991b1b",
            }}
          >
            {msg || err}
          </div>
        )}
      </div>

      <Footer />
    </>
  );
}

/* ---------- Atoms ---------- */
function Chip({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-3">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-white p-1.5 text-rose-700">{icon}</div>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <p className="mt-1 text-xs text-neutral-700">{desc}</p>
    </div>
  );
}

function Step({
  n,
  title,
  desc,
  color,
}: {
  n: number;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <li className="relative rounded-2xl border bg-white p-4 shadow-sm">
      <div
        className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full ${color} text-xs font-bold`}
      >
        {n}
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs text-neutral-600">{desc}</p>
    </li>
  );
}

function Card({
  icon,
  title,
  desc,
  gradient,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  gradient: string;
}) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${gradient} p-4`}>
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-white/70 p-1.5">{icon}</div>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <p className="mt-1 text-xs text-neutral-700">{desc}</p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-4">
      <div className="rounded-md bg-neutral-50 p-2">{icon}</div>
      <div>
        <div className="text-lg font-bold">{value}</div>
        <div className="text-xs text-neutral-600">{label}</div>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="group border-b last:border-none"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-neutral-500" />
          {q}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-neutral-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </summary>
      <div className="px-4 pb-4 text-xs text-neutral-600">{a}</div>
    </details>
  );
}
