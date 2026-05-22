export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import {
  SUPPORTED_COUNTRIES,
  isSupportedCountry,
} from "@/lib/countries";

// Admin CRUD for the K-Partnership "How it works" videos. Per-country
// rows in `k_partnership_videos`, plus a singleton default country
// pointer on `store_settings.k_partnership_default_country`.
//
// Methods:
//   GET    — return all rows + the default country code
//   POST   — multipart upload: { country_code, file } → uploads to
//             site-assets/k-partnership/<country>.<ext> and upserts
//             the table row
//   DELETE — ?country=XX → removes the row + the storage file
//   PATCH  — body { default_country } → updates the default country

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const BUCKET = "site-assets";
const PATH_PREFIX = "k-partnership";

async function getAdminOr401() {
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();
  let user: any = null;

  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) user = data.user;
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return { error: json({ ok: false, error: "UNAUTH" }, 401) };

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "admin" && prof?.role !== "super_admin") {
    return { error: json({ ok: false, error: "FORBIDDEN" }, 403) };
  }
  return { error: null };
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function extFromMime(mime: string | null | undefined): string {
  if (!mime) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  return "mp4";
}

export async function GET() {
  const { error: authErr } = await getAdminOr401();
  if (authErr) return authErr;

  const sb = admin();
  const [{ data: videos, error: vErr }, { data: settings }] = await Promise.all([
    sb
      .from("k_partnership_videos")
      .select("country_code, storage_path, updated_at")
      .order("country_code"),
    sb
      .from("store_settings")
      .select("k_partnership_default_country")
      .eq("id", 1)
      .maybeSingle<{ k_partnership_default_country: string | null }>(),
  ]);

  if (vErr) return json({ ok: false, error: vErr.message }, 500);

  return json({
    ok: true,
    videos: videos ?? [],
    default_country: settings?.k_partnership_default_country ?? null,
    supported_countries: SUPPORTED_COUNTRIES,
  });
}

export async function POST(req: NextRequest) {
  const { error: authErr } = await getAdminOr401();
  if (authErr) return authErr;

  const form = await req.formData().catch(() => null);
  if (!form) return json({ ok: false, error: "BAD_REQUEST" }, 400);

  const countryCode = String(form.get("country_code") ?? "").toUpperCase();
  const file = form.get("file");
  if (!isSupportedCountry(countryCode)) {
    return json({ ok: false, error: "UNSUPPORTED_COUNTRY" }, 400);
  }
  if (!(file instanceof File) || file.size === 0) {
    return json({ ok: false, error: "FILE_REQUIRED" }, 400);
  }

  // Cap upload size at 100 MB. The HTML5 player streams progressively
  // but the original file still has to download fully on the first
  // edge-cache miss — anything bigger than this gets slow on mobile.
  const MAX_BYTES = 100 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return json({ ok: false, error: "FILE_TOO_LARGE", maxBytes: MAX_BYTES }, 400);
  }

  const sb = admin();
  const ext = extFromMime((file as File).type);
  const path = `${PATH_PREFIX}/${countryCode.toLowerCase()}.${ext}`;

  // Upload (upsert so re-uploads replace the prior file at the same
  // path — no orphaned files to clean up).
  const buffer = Buffer.from(await (file as File).arrayBuffer());
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, {
      upsert: true,
      cacheControl: "31536000",
      contentType: (file as File).type || "video/mp4",
    });
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  // Upsert the table row pointing at the (now-stored) file.
  const { error: dbErr } = await sb
    .from("k_partnership_videos")
    .upsert(
      { country_code: countryCode, storage_path: path, updated_at: new Date().toISOString() },
      { onConflict: "country_code" }
    );
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);

  return json({ ok: true, country_code: countryCode, storage_path: path });
}

export async function DELETE(req: NextRequest) {
  const { error: authErr } = await getAdminOr401();
  if (authErr) return authErr;

  const url = new URL(req.url);
  const countryCode = (url.searchParams.get("country") ?? "").toUpperCase();
  if (!isSupportedCountry(countryCode)) {
    return json({ ok: false, error: "UNSUPPORTED_COUNTRY" }, 400);
  }

  const sb = admin();

  // Look up the path so we can remove the storage file too.
  const { data: existing } = await sb
    .from("k_partnership_videos")
    .select("storage_path")
    .eq("country_code", countryCode)
    .maybeSingle<{ storage_path: string }>();

  // Delete the row first (RLS would block anon read after; doesn't
  // matter for storage cleanup). Then remove the file. Order doesn't
  // affect correctness because the storefront tolerates missing rows.
  const { error: delErr } = await sb
    .from("k_partnership_videos")
    .delete()
    .eq("country_code", countryCode);
  if (delErr) return json({ ok: false, error: delErr.message }, 500);

  if (existing?.storage_path) {
    await sb.storage.from(BUCKET).remove([existing.storage_path]);
  }

  // If the deleted country was the default, clear the pointer so the
  // storefront falls through to "no video" instead of pointing at a
  // now-deleted row.
  const { data: settings } = await sb
    .from("store_settings")
    .select("k_partnership_default_country")
    .eq("id", 1)
    .maybeSingle<{ k_partnership_default_country: string | null }>();
  if (settings?.k_partnership_default_country === countryCode) {
    await sb
      .from("store_settings")
      .update({ k_partnership_default_country: null })
      .eq("id", 1);
  }

  return json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { error: authErr } = await getAdminOr401();
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const defaultCountry: string | null =
    body?.default_country == null
      ? null
      : String(body.default_country).toUpperCase();

  if (defaultCountry !== null && !isSupportedCountry(defaultCountry)) {
    return json({ ok: false, error: "UNSUPPORTED_COUNTRY" }, 400);
  }

  const sb = admin();

  // If setting a non-null default, ensure that country actually has
  // a video row — otherwise the storefront's fallback resolves to
  // nothing, which is confusing.
  if (defaultCountry !== null) {
    const { data: row } = await sb
      .from("k_partnership_videos")
      .select("country_code")
      .eq("country_code", defaultCountry)
      .maybeSingle();
    if (!row) {
      return json(
        { ok: false, error: "DEFAULT_COUNTRY_HAS_NO_VIDEO", country: defaultCountry },
        400
      );
    }
  }

  const { error: dbErr } = await sb
    .from("store_settings")
    .update({ k_partnership_default_country: defaultCountry })
    .eq("id", 1);
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);

  return json({ ok: true, default_country: defaultCountry });
}
