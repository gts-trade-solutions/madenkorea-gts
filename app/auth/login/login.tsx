"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

// Single browser client (persists session in localStorage)
export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/account";
const [oauthLoading, setOauthLoading] = useState<"google" | "facebook" | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  // If already logged in, go where they intended
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) router.replace(redirect);
      setLoading(false);
    })();
  }, [router, redirect]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const mapAuthError = (message?: string) => {
    const m = (message || "").toLowerCase();
    if (m.includes("invalid login credentials")) {
      return "We couldn't sign you in with that email and password. Check your details or reset your password.";
    }
    if (m.includes("email not confirmed")) {
      return "Your email address is not confirmed yet. Please verify your email before signing in.";
    }
    if (m.includes("too many requests")) return "Too many attempts. Please wait a moment and try again.";
    return "Unable to sign in right now. Please try again.";
  };

  // Attach browser session to server cookies so /api routes & RSC see auth
  const attachAfterAuth = async () => {
    const { data: s } = await supabase.auth.getSession();
    const at = s?.session?.access_token;
    const rt = s?.session?.refresh_token;
    if (!at || !rt) return;
    // sets sb-* cookies on the response
    await fetch("/api/auth/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ access_token: at, refresh_token: rt }),
    }).catch(() => {});
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.email.trim();
    const password = form.password;

    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSubmitting(false);
      toast.error(mapAuthError(error.message));
      return;
    }

    // If a session was returned, set SSR cookies so server can see auth immediately
    if (data.session) {
      await attachAfterAuth();
    }

    // Fire-and-forget: stitch pre-login anonymous activity onto the new
    // user_id and emit a `login` event for funnel attribution.
    void fetch("/api/events/identify", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "login" }),
    }).catch(() => {});

    setSubmitting(false);
    toast.success("Signed in");
    router.replace(redirect);
  };

const loginWithProvider = async (provider: "google" | "facebook") => {
  try {
    setOauthLoading(provider);

    const redirectParam = redirect || "/account";

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // This must match what you added in Supabase URL config:
        // e.g. http://localhost:3000/auth/callback
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
          redirectParam,
        )}`,
      },
    });

    if (error) {
      toast.error(error.message || `Could not start ${provider} sign in`);
      setOauthLoading(null);
    }
    // On success, browser will be redirected away, so code after this usually
    // won't run. We don't call attachAfterAuth here – that's done in /auth/callback.
  } catch (err: any) {
    console.error(err);
    toast.error("Something went wrong, please try again.");
    setOauthLoading(null);
  }
};

const handleGoogleLogin = () => loginWithProvider("google");
const handleFacebookLogin = () => loginWithProvider("facebook");


  if (loading) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader><CardTitle>Sign in</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground">Loading…</p></CardContent>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Use your email and password</CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={onChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={form.password}
                    onChange={onChange}
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="text-right">
                  <Link href="/auth/forgot" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </div>
               <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
                {/* Divider */}
  <div className="relative flex items-center py-2 mt-4">
  <div className="flex-1 border-t" />
  <span className="px-2 text-xs text-muted-foreground">
    or continue with
  </span>
  <div className="flex-1 border-t" />
</div>
{/* Social login buttons */}
<div className="space-y-2 mt-4">

  {/* Google Button */}
  <Button
    type="button"
    onClick={handleGoogleLogin}
    disabled={oauthLoading !== null}
    className="w-full bg-white text-black border border-gray-300 hover:bg-gray-100"
  >
    {oauthLoading === "google" ? "Redirecting to Google…" : "Continue with Google"}
  </Button>

  {/* Facebook Button */}
  <Button
    type="button"
    onClick={handleFacebookLogin}
    disabled={oauthLoading !== null}
    className="w-full bg-[#1877F2] text-white hover:bg-[#166FE5]"
  >
    {oauthLoading === "facebook" ? "Redirecting to Facebook…" : "Continue with Facebook"}
  </Button>

</div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
             

              <p className="text-sm text-center text-muted-foreground">
                New here?{" "}
                <Link
                  href={`/auth/register?redirect=${encodeURIComponent(redirect)}`}
                  className="text-primary hover:underline"
                >
                  Create an account
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
}
