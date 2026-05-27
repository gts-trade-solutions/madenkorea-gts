// GET /api/admin/email-change-requests?status=pending
//
// Lists email change requests. Defaults to pending; pass status=all to
// see all statuses. Admin only.

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createServiceClient } from "@/lib/supabaseServer";

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
  if (!user) return { error: json({ ok: false, error: "UNAUTH" }, 401) };
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "admin" && prof?.role !== "super_admin")
    return { error: json({ ok: false, error: "FORBIDDEN" }, 403) };
  return { error: null };
}

export async function GET(req: Request) {
  const { error } = await getAdminOr401();
  if (error) return error;

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "pending").toLowerCase();
  const sb = createServiceClient();

  let q = sb
    .from("email_change_requests")
    .select(
      "id, user_id, current_email, requested_email, status, reason, admin_note, requested_at, processed_at"
    )
    .order("requested_at", { ascending: false })
    .limit(200);
  if (status !== "all") q = q.eq("status", status);

  const { data, error: qErr } = await q;
  if (qErr) return json({ ok: false, error: qErr.message }, 500);

  // Decorate with the requester's name for the admin UI.
  const ids = Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
  const nameMap = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const p of profs ?? []) {
      nameMap.set(p.id as string, (p.full_name as string | null) ?? null);
    }
  }

  return json({
    ok: true,
    rows: (data ?? []).map((r) => ({
      ...r,
      requester_name: nameMap.get(r.user_id as string) ?? null,
    })),
  });
}
