export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { isSupportedCountry } from "@/lib/countries";

// Admin CRUD for the per-country shipping-rate table backing the
// international checkout flow. India is NOT managed here — that uses
// the existing /api/admin/settings/shipping (threshold + flat fee).

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

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
  if (!user) return { user: null, error: json({ ok: false, error: "UNAUTH" }, 401) };

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "admin")
    return { user: null, error: json({ ok: false, error: "FORBIDDEN" }, 403) };

  return { user, error: null };
}

// Service-role client — table RLS only allows public SELECT, so writes
// have to go through service role from this admin-gated endpoint.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  const { error } = await getAdminOr401();
  if (error) return error;

  const sb = admin();
  const { data, error: dbErr } = await sb
    .from("country_shipping_rates")
    .select("country, rate_per_gram_inr, active, notes, updated_at")
    .order("country", { ascending: true });
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);
  return json({ ok: true, rates: data ?? [] });
}

// Upsert one country row. Body: { country, rate_per_gram_inr, active, notes }
export async function POST(req: Request) {
  const { error } = await getAdminOr401();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const country = String(body.country || "").toUpperCase();
  const rate = Number(body.rate_per_gram_inr);
  const active = body.active === undefined ? true : !!body.active;
  const notes = body.notes ? String(body.notes).slice(0, 500) : null;

  if (!isSupportedCountry(country) || country === "IN") {
    return json({ ok: false, error: "INVALID_COUNTRY" }, 400);
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return json({ ok: false, error: "INVALID_RATE" }, 400);
  }

  const sb = admin();
  const { error: upErr } = await sb
    .from("country_shipping_rates")
    .upsert(
      { country, rate_per_gram_inr: rate, active, notes },
      { onConflict: "country" }
    );

  if (upErr) return json({ ok: false, error: upErr.message }, 500);
  return json({ ok: true });
}

// Hard-delete one country row. Soft-disabling via `active=false` is the
// more common path; DELETE is provided for cleanup.
export async function DELETE(req: Request) {
  const { error } = await getAdminOr401();
  if (error) return error;

  const url = new URL(req.url);
  const country = String(url.searchParams.get("country") || "").toUpperCase();
  if (!isSupportedCountry(country) || country === "IN") {
    return json({ ok: false, error: "INVALID_COUNTRY" }, 400);
  }

  const sb = admin();
  const { error: delErr } = await sb
    .from("country_shipping_rates")
    .delete()
    .eq("country", country);
  if (delErr) return json({ ok: false, error: delErr.message }, 500);
  return json({ ok: true });
}
