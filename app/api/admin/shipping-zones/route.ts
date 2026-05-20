export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

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
  if (!user) return { supabase, user: null, error: json({ ok: false, error: "UNAUTH" }, 401) };

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((prof?.role !== "admin" && prof?.role !== "super_admin"))
    return { supabase, user: null, error: json({ ok: false, error: "FORBIDDEN" }, 403) };

  return { supabase, user, error: null };
}

type ZoneRow = {
  zone: string;
  label: string;
  eta_days_min: number;
  eta_days_max: number;
  sort_order: number;
};

export async function GET() {
  const { supabase, error } = await getAdminOr401();
  if (error) return error;

  const { data, error: qErr } = await supabase
    .from("shipping_zones")
    .select("zone, label, eta_days_min, eta_days_max, sort_order")
    .order("sort_order", { ascending: true });

  if (qErr) return json({ ok: false, error: qErr.message }, 500);

  return json({ ok: true, zones: data ?? [] });
}

export async function POST(req: Request) {
  const { supabase, user, error } = await getAdminOr401();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const zones = body?.zones;
  if (!Array.isArray(zones) || zones.length === 0) {
    return json({ ok: false, error: "INVALID_PAYLOAD" }, 400);
  }

  // Validate every row before writing any.
  const updates: { zone: string; eta_days_min: number; eta_days_max: number }[] = [];
  for (const z of zones as ZoneRow[]) {
    const zone = String(z?.zone ?? "").trim();
    const min = Number(z?.eta_days_min);
    const max = Number(z?.eta_days_max);
    if (!zone) return json({ ok: false, error: "MISSING_ZONE" }, 400);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
      return json({ ok: false, error: `INVALID_ETA_FOR_${zone}` }, 400);
    }
    updates.push({ zone, eta_days_min: Math.round(min), eta_days_max: Math.round(max) });
  }

  // Per-row update: zone is the PK, so we update each by zone. Cheaper than
  // an upsert and avoids accidentally overwriting label/sort_order, which
  // are managed via migrations only.
  for (const u of updates) {
    const { error: upErr } = await supabase
      .from("shipping_zones")
      .update({
        eta_days_min: u.eta_days_min,
        eta_days_max: u.eta_days_max,
        updated_at: new Date().toISOString(),
        updated_by: user!.id,
      })
      .eq("zone", u.zone);
    if (upErr) return json({ ok: false, error: upErr.message }, 500);
  }

  return json({ ok: true });
}
