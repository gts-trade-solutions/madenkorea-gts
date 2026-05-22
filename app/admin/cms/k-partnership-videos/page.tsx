"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, Upload, Video } from "lucide-react";
import {
  SUPPORTED_COUNTRIES,
  COUNTRY_PROFILES,
  type CountryCode,
} from "@/lib/countries";

type VideoRow = {
  country_code: string;
  storage_path: string;
  updated_at?: string;
};

const STORAGE_BUCKET = "site-assets";
const PUBLIC_URL = (path: string) =>
  supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;

export default function KPartnershipVideosAdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [videos, setVideos] = useState<Record<string, VideoRow>>({});
  const [defaultCountry, setDefaultCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDefault, setSavingDefault] = useState(false);
  const [busyCountry, setBusyCountry] = useState<string | null>(null);

  // Gate: admin only
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bounceUrl =
        typeof window !== "undefined"
          ? `/admin?from=${encodeURIComponent(window.location.pathname)}`
          : "/admin";
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(bounceUrl);
        return;
      }
      const { data: adminFlag, error } = await supabase.rpc("is_admin");
      if (error || !adminFlag) {
        router.replace(bounceUrl);
        return;
      }
      if (cancelled) return;
      setIsAdmin(true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Load videos + default-country pointer
  const load = async () => {
    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/k-partnership-videos", {
        credentials: "include",
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(body?.error || "Failed to load");
        return;
      }
      const map: Record<string, VideoRow> = {};
      for (const v of body.videos ?? []) {
        map[String(v.country_code).toUpperCase()] = v;
      }
      setVideos(map);
      setDefaultCountry(body.default_country ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && isAdmin) void load();
  }, [ready, isAdmin]);

  const uploadFor = async (country: string, file: File) => {
    setBusyCountry(country);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const fd = new FormData();
      fd.append("country_code", country);
      fd.append("file", file);
      const res = await fetch("/api/admin/k-partnership-videos", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(body?.error || "Upload failed");
        return;
      }
      toast.success(`Uploaded ${COUNTRY_PROFILES[country as CountryCode]?.name}`);
      await load();
    } finally {
      setBusyCountry(null);
    }
  };

  const removeFor = async (country: string) => {
    if (!confirm(`Remove the video for ${COUNTRY_PROFILES[country as CountryCode]?.name}?`)) {
      return;
    }
    setBusyCountry(country);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(
        `/api/admin/k-partnership-videos?country=${encodeURIComponent(country)}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(body?.error || "Delete failed");
        return;
      }
      toast.success("Removed");
      await load();
    } finally {
      setBusyCountry(null);
    }
  };

  const setDefault = async (country: string | null) => {
    setSavingDefault(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/k-partnership-videos", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ default_country: country }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(body?.error || "Failed to update default");
        return;
      }
      setDefaultCountry(country);
      toast.success(
        country
          ? `Default set to ${COUNTRY_PROFILES[country as CountryCode]?.name}`
          : "Default cleared"
      );
    } finally {
      setSavingDefault(false);
    }
  };

  if (!ready || !isAdmin) return null;

  const countriesWithVideos = SUPPORTED_COUNTRIES.filter((c) => !!videos[c]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/admin/cms")}>
              ← Back
            </Button>
            <h1 className="text-lg sm:text-2xl font-bold">K-Partnership Videos</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 sm:py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Default country</CardTitle>
            <CardDescription>
              Visitors whose country has no video uploaded will see this
              country's video instead. Pick a country that already has a
              video.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={defaultCountry ?? ""}
                onChange={(e) => setDefault(e.target.value || null)}
                disabled={savingDefault}
                className="rounded-md border bg-background px-3 py-2 text-sm min-w-[12rem]"
              >
                <option value="">— No default (no fallback video) —</option>
                {countriesWithVideos.map((c) => (
                  <option key={c} value={c}>
                    {COUNTRY_PROFILES[c]?.flag} {COUNTRY_PROFILES[c]?.name}
                  </option>
                ))}
              </select>
              {savingDefault && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {countriesWithVideos.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Upload at least one video below before picking a default.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Videos by country</CardTitle>
            <CardDescription>
              One video per country, max 100 MB. MP4 / WebM recommended.
              The customer-facing player uses the first frame as the
              poster.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading…
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SUPPORTED_COUNTRIES.map((code) => {
                  const profile = COUNTRY_PROFILES[code];
                  const row = videos[code];
                  const isDefault = defaultCountry === code;
                  return (
                    <CountryRow
                      key={code}
                      code={code}
                      flag={profile?.flag ?? "🏳️"}
                      name={profile?.name ?? code}
                      video={row}
                      isDefault={isDefault}
                      busy={busyCountry === code}
                      onUpload={(file) => uploadFor(code, file)}
                      onRemove={() => removeFor(code)}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CountryRow({
  code,
  flag,
  name,
  video,
  isDefault,
  busy,
  onUpload,
  onRemove,
}: {
  code: string;
  flag: string;
  name: string;
  video?: VideoRow;
  isDefault: boolean;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const hasVideo = !!video?.storage_path;
  return (
    <div className="rounded-lg border bg-background p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl" aria-hidden>
            {flag}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{name}</div>
            <div className="text-[11px] text-muted-foreground">{code}</div>
          </div>
        </div>
        {isDefault && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            Default
          </span>
        )}
      </div>

      {hasVideo ? (
        <div className="space-y-3">
          <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden">
            <video
              src={PUBLIC_URL(video.storage_path)}
              controls
              playsInline
              preload="metadata"
              className="absolute inset-0 w-full h-full object-contain"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                asChild
              >
                <span>
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 mr-1" />
                  )}
                  Replace
                </span>
              </Button>
              <input
                type="file"
                accept="video/mp4,video/webm,video/ogg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRemove}
              disabled={busy}
              className="text-red-600 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-center space-y-2">
          <Video className="h-6 w-6 mx-auto text-muted-foreground" />
          <div className="text-xs text-muted-foreground">No video uploaded</div>
          <label className="inline-block">
            <Button type="button" size="sm" disabled={busy} asChild>
              <span>
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1" />
                )}
                Upload video
              </span>
            </Button>
            <input
              type="file"
              accept="video/mp4,video/webm,video/ogg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
