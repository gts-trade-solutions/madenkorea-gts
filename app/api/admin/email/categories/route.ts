import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("email_category")
    .select("id, slug, label, description")
    .order("label", { ascending: true });

  if (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    categories: data,
  });
}
