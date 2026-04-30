
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/account";

  const [checking, setChecking] = useState(true);

  const attachAfterAuth = async () => {
    const { data: s } = await supabase.auth.getSession();
    const at = s?.session?.access_token;
    const rt = s?.session?.refresh_token;
    if (!at || !rt) return;

    await fetch("/api/auth/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ access_token: at, refresh_token: rt }),
    }).catch(() => {});
  };

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (!data.session) {
          toast.error("Could not complete sign in. Please try again.");
          router.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
          return;
        }

        await attachAfterAuth();
        router.replace(redirect);
      } catch (err) {
        console.error(err);
        toast.error("Something went wrong while signing you in.");
        router.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
      } finally {
        setChecking(false);
      }
    })();
  }, [router, redirect]);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Signing you in…</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {checking
                ? "Completing your login. Please wait…"
                : "Redirecting…"}
            </p>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
