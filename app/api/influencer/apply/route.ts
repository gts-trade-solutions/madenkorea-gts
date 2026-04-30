import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabaseRoute";

export async function POST(req: Request) {
  const supabase = supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { handle, social = {}, note } = await req.json().catch(() => ({}));

  const { data, error } = await supabase.rpc("request_influencer", {
    p_handle: handle ?? null,
    p_social: social,
    p_note: note ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, request: data });
}
