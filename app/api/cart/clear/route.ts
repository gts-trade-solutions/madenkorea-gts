import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // get current user from sb cookies
    const cookieStore = cookies();
    const sbSSR = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    );
    const { data: { user } } = await sbSSR.auth.getUser();
    if (!user) return NextResponse.json({ ok: true }); // nothing to clear

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Prefer an RPC if one exists, but never fail cart clearing on a missing RPC.
    let rpcError: unknown = null;
    try {
      const { error } = await admin.rpc("clear_my_cart", { p_user_id: user.id });
      rpcError = error;
    } catch (error) {
      rpcError = error;
    }
    if (!rpcError) {
      return NextResponse.json({ ok: true });
    }

    // Fallback to table delete (try both common names)
    const try1 = await admin.from("cart_items").delete().eq("user_id", user.id);
    if (!try1.error) return NextResponse.json({ ok: true });

    const try2 = await admin.from("cart_lines").delete().eq("user_id", user.id);
    if (!try2.error) return NextResponse.json({ ok: true });

    return NextResponse.json({ ok: true }); // don't fail the UX
  } catch {
    return NextResponse.json({ ok: true });
  }
}
