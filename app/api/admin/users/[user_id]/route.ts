export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

// Admin-only role toggle for /admin/users.
//
// PATCH /api/admin/users/[user_id]
//   body: { role: "customer" | "admin" }
//
// Safety rails:
//   1. Cannot demote a super_admin — the DB trigger guard_super_admin_role
//      catches this too, but we return a friendly error here first so
//      the UI shows something better than "42501 forbidden".
//   2. Cannot demote yourself — prevents accidental self-lockout.
//   3. Cannot drop the last admin — the app would be unusable. Counts
//      `admin` + `super_admin` together; since the super admin can't
//      be demoted, this rail is mostly belt-and-suspenders for periods
//      between super admin reassignments.
//   4. Cannot set role to anything other than "customer" or "admin".
//      Promoting to super_admin is DB-only on purpose.

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
  if (prof?.role !== "admin" && prof?.role !== "super_admin")
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

export async function PATCH(
  req: Request,
  { params }: { params: { user_id: string } }
) {
  const { user: caller, error } = await getAdminOr401();
  if (error) return error;

  const targetId = params.user_id;
  const body = await req.json().catch(() => ({}));
  const nextRole = String(body.role || "").toLowerCase();

  if (nextRole !== "customer" && nextRole !== "admin") {
    return json(
      { ok: false, error: "INVALID_ROLE", code: "INVALID_ROLE" },
      400
    );
  }

  // Safety rail 2: no self-demote. (Promoting yourself doesn't apply
  // — you're already an admin, and there's no path to super_admin.)
  if (nextRole === "customer" && targetId === caller!.id) {
    return json(
      { ok: false, error: "CANNOT_DEMOTE_SELF", code: "CANNOT_DEMOTE_SELF" },
      400
    );
  }

  const sb = admin();

  // Read the current role to apply rails 1 + 3.
  const { data: current, error: rdErr } = await sb
    .from("profiles")
    .select("role")
    .eq("id", targetId)
    .maybeSingle();
  if (rdErr) return json({ ok: false, error: rdErr.message }, 500);
  if (!current) return json({ ok: false, error: "NOT_FOUND" }, 404);

  // Safety rail 1: super_admin is immune to demotion via this API.
  if (current.role === "super_admin") {
    return json(
      {
        ok: false,
        error: "CANNOT_MODIFY_SUPER_ADMIN",
        code: "CANNOT_MODIFY_SUPER_ADMIN",
      },
      403
    );
  }

  // Safety rail 3: don't drop the last admin. Only matters when
  // demoting. Counts admin + super_admin together — but since
  // super_admin can't be demoted, the only way to hit "0 admins" is
  // if there's no super_admin AND we're demoting the last admin.
  if (current.role === "admin" && nextRole === "customer") {
    const { count, error: cntErr } = await sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role", ["admin", "super_admin"]);
    if (cntErr) return json({ ok: false, error: cntErr.message }, 500);
    if ((count ?? 0) <= 1) {
      return json(
        {
          ok: false,
          error: "LAST_ADMIN_GUARD",
          code: "LAST_ADMIN_GUARD",
        },
        400
      );
    }
  }

  // No-op early-out: avoid a write + revalidation when nothing changes.
  if (current.role === nextRole) {
    return json({ ok: true, role: nextRole, no_op: true });
  }

  const { data, error: upErr } = await sb
    .from("profiles")
    .update({ role: nextRole, updated_at: new Date().toISOString() })
    .eq("id", targetId)
    .select("id, role")
    .maybeSingle();
  if (upErr) {
    // Surface PostgreSQL trigger errors with a stable code so the UI
    // can map to a translated string if needed.
    if ((upErr as any).code === "42501") {
      return json(
        {
          ok: false,
          error: "CANNOT_MODIFY_SUPER_ADMIN",
          code: "CANNOT_MODIFY_SUPER_ADMIN",
        },
        403
      );
    }
    return json({ ok: false, error: upErr.message }, 500);
  }

  return json({ ok: true, role: data?.role ?? nextRole });
}
