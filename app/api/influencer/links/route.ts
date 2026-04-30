import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET() {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set:()=>{}, remove:()=>{} } }
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok:false }, { status:401 });

  // Assuming referral_links has (id uuid, influencer_id uuid, slug text null, product_id uuid null, note text null)
  const { data, error } = await sb
    .from("referral_links")
    .select("id, slug, product_id, note")
    .eq("influencer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status:400 });
  return NextResponse.json({ ok:true, links: data });
}
