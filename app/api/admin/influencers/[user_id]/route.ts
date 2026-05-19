export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

// Admin-only per-influencer settings editor. Currently exposes the
// commission cap + default user-discount split — both whole-percent
// fields backed by influencer_profiles. Used by:
//   - the admin approval modal on /admin/influencers to seed values
//     for newly-approved creators (via approve_influencer RPC, not
//     this endpoint),
//   - the inline editor on the same page to revise an existing
//     influencer's cap after approval.

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

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// Whole-percent only; DB enforces these but we surface friendly
// errors here before hitting the constraint.
const CAP_MIN = 5;
const CAP_MAX = 100;

function validatePair(cap: any, def: any): { ok: true; cap: number; def: number } | { ok: false; error: string } {
  const c = Number(cap);
  const d = Number(def);
  if (!Number.isFinite(c) || !Number.isInteger(c) || c < CAP_MIN || c > CAP_MAX) {
    return { ok: false, error: `commission_cap_pct must be an integer ${CAP_MIN}..${CAP_MAX}` };
  }
  if (!Number.isFinite(d) || !Number.isInteger(d) || d < 0 || d > c) {
    return { ok: false, error: `default_user_discount_pct must be an integer 0..${c}` };
  }
  return { ok: true, cap: c, def: d };
}

export async function GET(
  _req: Request,
  { params }: { params: { user_id: string } }
) {
  const { error } = await getAdminOr401();
  if (error) return error;

  const sb = admin();
  const { data, error: dbErr } = await sb
    .from("influencer_profiles")
    .select(
      "user_id, handle, active, commission_cap_pct, default_user_discount_pct"
    )
    .eq("user_id", params.user_id)
    .maybeSingle();
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);
  if (!data) return json({ ok: false, error: "NOT_FOUND" }, 404);

  return json({ ok: true, influencer: data });
}

export async function PATCH(
  req: Request,
  { params }: { params: { user_id: string } }
) {
  const { error } = await getAdminOr401();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const v = validatePair(body.commission_cap_pct, body.default_user_discount_pct);
  if (!v.ok) return json({ ok: false, error: v.error }, 400);

  const sb = admin();
  const { data, error: upErr } = await sb
    .from("influencer_profiles")
    .update({
      commission_cap_pct: v.cap,
      default_user_discount_pct: v.def,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", params.user_id)
    .select("user_id, commission_cap_pct, default_user_discount_pct")
    .maybeSingle();
  if (upErr) return json({ ok: false, error: upErr.message }, 500);
  if (!data) return json({ ok: false, error: "NOT_FOUND" }, 404);

  return json({ ok: true, influencer: data });
}
