// app/api/promo/apply/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { setPromoCookie } from "@/lib/promo-cookie";

export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({ code: "" }));
  const normalized = String(code || "").toUpperCase().trim();
  if (!normalized) return NextResponse.json({ ok: false, error: "CODE_REQUIRED" }, { status: 400 });

  const sb = createAdminClient();
  const { data, error } = await sb.rpc("get_promo_details", { p_code: normalized });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row) return NextResponse.json({ ok: false, error: "INVALID_OR_INACTIVE" }, { status: 404 });

  setPromoCookie(normalized);
  return NextResponse.json({ ok: true, promo: row });
}
