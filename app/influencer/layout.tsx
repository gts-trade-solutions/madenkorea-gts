// app/influencer/layout.tsx
import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";

export default async function InfluencerLayout({ children }: { children: ReactNode }) {
  // Use the auth-helpers server client (handles sb-* cookies correctly)
  const supabase = createServerComponentClient({ cookies });

  // If there is a valid sb-* cookie, this returns the user reliably
  const { data: { user } } = await supabase.auth.getUser();

  // Not logged in → send to login with redirect back to /influencer
  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent("/influencer")}`);
  }

  // Check profile role (tolerate missing row)
  const { data: prof } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = prof?.role === "admin";

  // If not admin, require active influencer profile
  let inflHandle: string | null = null;
  if (!isAdmin) {
    const { data: infl } = await supabase
      .from("influencer_profiles")
      .select("handle, active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!infl?.active) {
      // Not an approved influencer yet → send to request page
      redirect("/influencer-request");
    }
    inflHandle = infl?.handle ?? null;
  }

  return (
    <>
   
    <Header/>
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Influencer Portal</h1>
            {inflHandle && (
              <span className="text-xs text-muted-foreground">@{inflHandle}</span>
            )}
            {isAdmin && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                Admin mode
              </span>
            )}
          </div>
          <nav className="flex gap-4 text-sm">
            <Link className="hover:underline" href="/influencer">Dashboard</Link>
            <Link className="hover:underline" href="/influencer/promos">Promos</Link>
            {/* <Link className="hover:underline" href="/influencer/payouts">Payouts</Link> */}
          </nav>
        </div>
      </header>

      <main className="container mx-auto py-8">{children}</main>
    </div>
    <Footer/>
     </>
  );
}
