// /admin/translations/[kind] — list of in-scope entities (products
// published, all brands, all categories, active banners) with
// per-locale translation status. Each row links into the editor.
//
// Top filter for searching by name; per-row "Translate" button to
// retranslate one entity from scratch.

"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Item = {
  id: string;
  slug: string | null;
  label: string;
  translatedCount: number;
  totalLocales: number;
  humanEditedCount: number;
  byLocale: Record<string, { source: string; updated_at: string }>;
};

type Response = {
  ok: true;
  total: number;
  locales: string[];
  items: Item[];
};

const VALID_KINDS = ["products", "brands", "categories", "banners"] as const;
type Kind = (typeof VALID_KINDS)[number];

const PAGE_SIZE = 25;

export default function AdminTranslationsKindList() {
  const params = useParams();
  const router = useRouter();
  const kind = params?.kind as Kind | undefined;

  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  // `appliedQuery` is the search the current page reflects (vs `q`
  // which is whatever the user is typing). Submitting the form syncs
  // them and resets to page 0.
  const [appliedQuery, setAppliedQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [translating, startTranslating] = useTransition();

  // Redirect bad slugs to the dashboard so we don't render an empty
  // table for unsupported kinds (e.g. someone hits /admin/translations/foo).
  useEffect(() => {
    if (kind && !VALID_KINDS.includes(kind)) {
      router.replace("/admin/translations");
    }
  }, [kind, router]);

  async function load(query: string, pageIndex: number) {
    if (!kind || !VALID_KINDS.includes(kind)) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        `/api/admin/content-translations/${kind}`,
        window.location.origin
      );
      if (query.trim()) url.searchParams.set("q", query.trim());
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(pageIndex * PAGE_SIZE));
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || res.statusText);
      setData(json);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // Refetch on (kind, page, appliedQuery) change. The search box drives
  // `appliedQuery` via form submit so a stray keystroke doesn't trigger
  // a paged refetch per character.
  useEffect(() => {
    void load(appliedQuery, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, page, appliedQuery]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // A new query invalidates the current page; jump back to page 0
    // so the admin sees the first slice of results.
    setPage(0);
    setAppliedQuery(q);
  };

  function translateOne(id: string, force: boolean) {
    if (!kind) return;
    startTranslating(async () => {
      try {
        const res = await fetch("/api/admin/content-translations/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, id, force }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || res.statusText);
        const r = json.result;
        toast.success(
          `${r.translated} translated, ${r.skipped} skipped, ${r.humanLocked} human-locked${
            r.errors.length ? `, ${r.errors.length} errors` : ""
          }`
        );
        // Reload the current page so the row's status badges refresh
        // without scrolling the admin back to page 0.
        await load(appliedQuery, page);
      } catch (err: any) {
        toast.error(err?.message ?? "Translation failed");
      }
    });
  }

  return (
    <>
      <AdminBackBar
        to="/admin/translations"
        title={
          kind ? `Translations · ${kind[0].toUpperCase()}${kind.slice(1)}` : "Translations"
        }
        rightSlot={
          <Button
            onClick={() => void load(appliedQuery, page)}
            disabled={loading}
            size="sm"
            variant="outline"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="container mx-auto py-6 space-y-4">
        <form onSubmit={submitSearch} className="flex gap-2 max-w-md">
          <Input
            placeholder="Filter by name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" variant="outline">Search</Button>
        </form>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Coverage</th>
                  <th className="text-left px-4 py-3 font-medium">Locales</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!data && loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {data && data.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No entities match.
                    </td>
                  </tr>
                )}
                {data?.items.map((it) => {
                  const pct = Math.round((it.translatedCount / it.totalLocales) * 100);
                  return (
                    <tr key={it.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/translations/${kind}/${it.id}`}
                          className="hover:underline"
                        >
                          {it.label}
                        </Link>
                        {it.slug && (
                          <div className="text-xs text-muted-foreground font-mono">{it.slug}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 w-48">
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-muted overflow-hidden flex-1">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
                            {it.translatedCount}/{it.totalLocales}
                          </span>
                        </div>
                        {it.humanEditedCount > 0 && (
                          <div className="text-[11px] text-blue-700 mt-1">
                            {it.humanEditedCount} human-edited
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {data.locales.map((l) => {
                            const s = it.byLocale[l];
                            return (
                              <span
                                key={l}
                                title={s ? `${s.source} · ${s.updated_at}` : "Not translated"}
                                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${
                                  !s
                                    ? "border-muted bg-muted/40 text-muted-foreground"
                                    : s.source === "human"
                                    ? "border-blue-200 bg-blue-50 text-blue-700"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {l}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => translateOne(it.id, false)}
                          disabled={translating}
                        >
                          Translate missing
                        </Button>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="ml-2"
                        >
                          <Link href={`/admin/translations/${kind}/${it.id}`}>Edit</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <KindPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          shown={data?.items.length ?? 0}
          loading={loading}
          onChange={setPage}
        />
      </div>
    </>
  );
}

// ─── Pagination controls ────────────────────────────────────────────

function KindPagination({
  page,
  pageSize,
  total,
  shown,
  loading,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  shown: number;
  loading: boolean;
  onChange: (next: number) => void;
}) {
  if (total <= 0) return null;

  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const start = page * pageSize + 1;
  const end = page * pageSize + shown;
  const atStart = page <= 0;
  const atEnd = page >= lastPage;

  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing {start}–{end} of {total} entities
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={atStart || loading}
          onClick={() => onChange(0)}
          aria-label="First page"
        >
          «
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={atStart || loading}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          ‹ Prev
        </Button>
        <span className="px-2 text-xs text-muted-foreground tabular-nums">
          Page {page + 1} / {lastPage + 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={atEnd || loading}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          Next ›
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={atEnd || loading}
          onClick={() => onChange(lastPage)}
          aria-label="Last page"
        >
          »
        </Button>
      </div>
    </div>
  );
}
