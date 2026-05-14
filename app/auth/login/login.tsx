"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("auth.signIn");
  const tc = useTranslations("common");
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
    if (m.includes("invalid login credentials")) return t("errInvalidCredentials");
    if (m.includes("email not confirmed")) return t("errEmailNotConfirmed");
    if (m.includes("too many requests")) return t("errTooManyRequests");
    return t("errGeneric");
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
      toast.error(t("missingFields"));
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
    toast.success(t("signedIn"));
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
            <CardHeader><CardTitle>{t("title")}</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground">{tc("loading")}</p></CardContent>
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
            <CardTitle className="text-2xl">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
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
                <Label htmlFor="password">{t("passwordLabel")}</Label>
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
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                    title={showPassword ? t("hidePassword") : t("showPassword")}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="text-right">
                  <Link href="/auth/forgot" className="text-sm text-primary hover:underline">
                    {t("forgotPassword")}
                  </Link>
                </div>
              </div>
               <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("submitting") : t("submit")}
              </Button>
                {/* Divider */}
  <div className="relative flex items-center py-2 mt-4">
  <div className="flex-1 border-t" />
  <span className="px-2 text-xs text-muted-foreground">
    {t("orContinueWith")}
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
    {oauthLoading === "google" ? t("redirectingToGoogle") : t("continueWithGoogle")}
  </Button>

  {/* Facebook Button */}
  <Button
    type="button"
    onClick={handleFacebookLogin}
    disabled={oauthLoading !== null}
    className="w-full bg-[#1877F2] text-white hover:bg-[#166FE5]"
  >
    {oauthLoading === "facebook" ? t("redirectingToFacebook") : t("continueWithFacebook")}
  </Button>

</div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
             

              <p className="text-sm text-center text-muted-foreground">
                {t("newHerePrefix")}{" "}
                <Link
                  href={`/auth/register?redirect=${encodeURIComponent(redirect)}`}
                  className="text-primary hover:underline"
                >
                  {t("createAccount")}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
}
