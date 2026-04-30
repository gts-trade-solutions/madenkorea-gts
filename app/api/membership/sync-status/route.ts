import { NextRequest, NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabaseRoute";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const routeClient = supabaseRouteClient();
    const { data: authData } = await routeClient.auth.getUser();
    const userId = authData.user?.id ?? null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: expiredRows, error: fetchError } = await supabaseAdmin
      .from("user_memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .lte("ends_at", nowIso);

    if (fetchError) {
      return NextResponse.json(
        { ok: false, error: fetchError.message },
        { status: 500 }
      );
    }

    if (!expiredRows || expiredRows.length === 0) {
      return NextResponse.json({
        ok: true,
        updated: 0,
      });
    }

    const ids = expiredRows.map((row) => row.id);

    const { error: updateError } = await supabaseAdmin
      .from("user_memberships")
      .update({ status: "expired" })
      .in("id", ids);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      updated: ids.length,
    });
  } catch (error: any) {
    console.error("Membership sync status error:", error);

    return NextResponse.json(
      { ok: false, error: error.message || "Failed to sync membership status" },
      { status: 500 }
    );
  }
}
