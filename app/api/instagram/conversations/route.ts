// app/api/instagram/conversations/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const instagramAccountId = searchParams.get("instagram_account_id");

  // Optional filter by account; and ensure ownership via join
  let query = supabase
    .from("instagram_conversations")
    .select("id, ig_conversation_id, participant_username, last_message, last_message_at, platform, instagram_account_id")
    .order("last_message_at", { ascending: false });

  if (instagramAccountId) {
    query = query.eq("instagram_account_id", instagramAccountId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Load conversations error:", error);
    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500 }
    );
  }

  return NextResponse.json({ conversations: data || [] });
}
