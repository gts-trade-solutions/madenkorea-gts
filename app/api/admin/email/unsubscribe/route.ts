import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  email: string;
  unsubscribed: boolean;
};

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();
  const { email, unsubscribed }: Body = await req.json();

  if (!email) {
    return NextResponse.json(
      { error: "Email is required" },
      { status: 400 }
    );
  }

  const emailLower = email.trim().toLowerCase();

  if (unsubscribed) {
    const { error } = await supabase
      .from("email_unsubscribe")
      .upsert(
        {
          email: emailLower,
          source: "admin",
        },
        { onConflict: "email" }
      );

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to unsubscribe email" },
        { status: 500 }
      );
    }
  } else {
    const { error } = await supabase
      .from("email_unsubscribe")
      .delete()
      .eq("email", emailLower);

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to resubscribe email" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
