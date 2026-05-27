export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

// Admin-only paginated user list backing /admin/users.
//
// Query:
//   ?q=<term>    — case-insensitive match on email / full_name / phone
//   ?page=<n>    — 1-indexed, default 1
//   ?limit=<n>   — default 50, clamped 1..200
//
// Response shape:
//   {
//     ok: true,
//     total: 1234,
//     page: 1,
//     limit: 50,
//     users: [{
//       id, email, full_name, phone, preferred_country, role,
//       last_sign_in_at, created_at
//     }]
//   }
//
// We page over auth.users (the source of truth for accounts) and
// left-join the public.profiles row for app metadata (role + name +
// phone). Doing it the other way (profiles-first) would skip accounts
// whose profile row was never inserted.

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

export async function GET(req: Request) {
  const { user, error } = await getAdminOr401();
  if (error) return error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const limit = Math.min(
    200,
    Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 50))
  );

  const sb = admin();

  // Step 1 — pull candidate profile rows (the table we can search +
  // filter cheaply). Then in step 2 we fetch matching auth.users rows
  // to attach email + last_sign_in.
  //
  // For search, we OR-match on full_name and phone (both live on
  // profiles). For email matches we have to query auth.users
  // separately because Supabase RLS doesn't allow joining onto it.
  let matchedIds: Set<string> | null = null;
  if (q) {
    const wildcard = `%${q.replace(/[%_]/g, "\\$&")}%`;
    const [{ data: profMatches }, { data: { users: authMatches } = {} as any }] =
      await Promise.all([
        sb
          .from("profiles")
          .select("id")
          .or(`full_name.ilike.${wildcard},phone.ilike.${wildcard}`),
        // auth.users doesn't support .ilike via the JS SDK — listUsers
        // supports a string search though.
        sb.auth.admin.listUsers({ page: 1, perPage: 200 }).then((r) => ({
          data: {
            users: (r.data?.users ?? []).filter((u) =>
              (u.email || "").toLowerCase().includes(q.toLowerCase())
            ),
          } as any,
        })),
      ]);

    matchedIds = new Set<string>();
    (profMatches ?? []).forEach((r: any) => matchedIds!.add(r.id));
    (authMatches ?? []).forEach((u: any) => matchedIds!.add(u.id));

    if (matchedIds.size === 0) {
      return json({
        ok: true,
        total: 0,
        page,
        limit,
        users: [],
        current_user_id: user!.id,
      });
    }
  }

  // Step 2 — fetch the matching profile rows with pagination. We sort
  // by created_at desc so the newest accounts surface first (most
  // common "I just signed someone up, where are they" path).
  let pq = sb
    .from("profiles")
    .select(
      "id, full_name, phone, preferred_country, role, created_at, updated_at, email_verified_at, email_verification_grace_starts_at, email_verification_deadline_override",
      { count: "exact" }
    );
  if (matchedIds) {
    pq = pq.in("id", Array.from(matchedIds));
  }
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: profs, count, error: pErr } = await pq
    .order("created_at", { ascending: false })
    .range(from, to);
  if (pErr) return json({ ok: false, error: pErr.message }, 500);

  // Step 3 — fetch the matching auth.users rows in one pass. The
  // sdk's listUsers paginates at 1000/page max; for any single page of
  // our admin UI we'll always have <=200 ids, so getUserById each (in
  // parallel) is fine.
  const ids = (profs ?? []).map((p: any) => p.id);
  const authResults = await Promise.all(
    ids.map((id) => sb.auth.admin.getUserById(id))
  );
  const authMap = new Map<string, any>();
  authResults.forEach((r, i) => {
    if (r.data?.user) authMap.set(ids[i], r.data.user);
  });

  const users = (profs ?? []).map((p: any) => {
    const au = authMap.get(p.id);
    return {
      id: p.id,
      email: au?.email ?? null,
      full_name: p.full_name ?? null,
      phone: p.phone ?? null,
      preferred_country: p.preferred_country ?? null,
      role: p.role ?? "customer",
      last_sign_in_at: au?.last_sign_in_at ?? null,
      created_at: p.created_at ?? au?.created_at ?? null,
      email_verified_at: p.email_verified_at ?? null,
      email_verification_grace_starts_at:
        p.email_verification_grace_starts_at ?? null,
      email_verification_deadline_override:
        p.email_verification_deadline_override ?? null,
    };
  });

  return json({
    ok: true,
    total: count ?? users.length,
    page,
    limit,
    users,
    current_user_id: user!.id,
  });
}
