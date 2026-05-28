// POST /api/admin/notifications/[id]/read
//
// Marks one notification read for the calling admin. Idempotent —
// re-firing just no-ops via the unique (notification_id, admin_id) PK.
// DELETE on the same path un-marks (lets the UI offer "mark unread").

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

async function getAdminOr401() {
  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();
  let user: any = null;
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(auth.slice(7));
    user = data.user;
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return { user: null, supabase, error: json({ ok: false, error: "UNAUTH" }, 401) };
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "admin" && prof?.role !== "super_admin")
    return { user: null, supabase, error: json({ ok: false, error: "FORBIDDEN" }, 403) };
  return { user, supabase, error: null };
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const { user, supabase, error } = await getAdminOr401();
  if (error) return error;
  if (!params.id) return json({ ok: false, error: "missing_id" }, 400);

  // RLS permits the caller to write only their own read row.
  const { error: insErr } = await supabase
    .from("admin_notification_reads")
    .upsert(
      { notification_id: params.id, admin_id: user!.id },
      { onConflict: "notification_id,admin_id", ignoreDuplicates: true }
    );
  if (insErr) return json({ ok: false, error: insErr.message }, 500);
  return json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { user, supabase, error } = await getAdminOr401();
  if (error) return error;
  if (!params.id) return json({ ok: false, error: "missing_id" }, 400);

  const { error: delErr } = await supabase
    .from("admin_notification_reads")
    .delete()
    .eq("notification_id", params.id)
    .eq("admin_id", user!.id);
  if (delErr) return json({ ok: false, error: delErr.message }, 500);
  return json({ ok: true });
}
