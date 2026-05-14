"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";

// Browser Supabase client
/* -------------------------------------------------------------------------- */
/*                         PASSWORD VALIDATION HELPERS                        */
/* -------------------------------------------------------------------------- */
function hasLower(s: string) { return /[a-z]/.test(s); }
function hasUpper(s: string) { return /[A-Z]/.test(s); }
function hasNumber(s: string) { return /\d/.test(s); }
function hasSymbol(s: string) { return /[^A-Za-z0-9\s]/.test(s); }
function hasSequence(s: string) {
  return /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|asdf|zxcv)/i.test(s);
}
function hasRepeat(s: string) { return /(.)\1{2,}/.test(s); }

// Strength tips are returned as stable IDs (not translated text) so the
// caller can resolve them via useTranslations() — this lets the same
// helper work across every locale without re-running on locale change.
type StrengthTipId =
  | "tipLonger"
  | "tipUppercase"
  | "tipNumber"
  | "tipSymbol"
  | "tipNoSequence"
  | "tipNoRepeat";

const STRENGTH_LABEL_KEYS = [
  "strengthTooWeak",
  "strengthWeak",
  "strengthOkay",
  "strengthStrong",
  "strengthVeryStrong",
] as const;

function scorePassword(pw: string) {
  const tips: StrengthTipId[] = [];
  if (!pw) {
    return { score: 0, labelKey: STRENGTH_LABEL_KEYS[0], tips: ["tipLonger" as StrengthTipId] };
  }

  let score = 0;

  if (pw.length >= 15) score += 3;
  else if (pw.length >= 11) score += 2;
  else if (pw.length >= 8) score += 1;

  const varieties = [
    hasLower(pw),
    hasUpper(pw),
    hasNumber(pw),
    hasSymbol(pw),
  ].filter(Boolean).length;

  score += Math.max(0, varieties - 1);

  if (hasSequence(pw)) score -= 1;
  if (hasRepeat(pw)) score -= 1;

  score = Math.max(0, Math.min(4, score));

  if (pw.length < 12) tips.push("tipLonger");
  if (!hasUpper(pw)) tips.push("tipUppercase");
  if (!hasNumber(pw)) tips.push("tipNumber");
  if (!hasSymbol(pw)) tips.push("tipSymbol");
  if (hasSequence(pw)) tips.push("tipNoSequence");
  if (hasRepeat(pw)) tips.push("tipNoRepeat");

  return { score, labelKey: STRENGTH_LABEL_KEYS[score], tips };
}

function segClass(active: boolean, idx: number, score: number) {
  if (!active) return "bg-muted";
  return [
    "bg-red-500",
    score >= 2 ? "bg-orange-500" : "bg-red-500",
    score >= 3 ? "bg-yellow-500" : "bg-orange-500",
    score >= 4 ? "bg-emerald-500" : "bg-yellow-500",
  ][idx];
}

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("auth.signUp");
  const tIn = useTranslations("auth.signIn");
  const tLinks = useTranslations("footer.links");

  const redirect = params.get("redirect") || "/account";
  const mode = params.get("mode");

  /* OAuth buttons loading state */
  const [oauthLoading, setOauthLoading] = useState<"google" | "facebook" | null>(null);

  /* Original form states */
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm: "",
  });

  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(form.password), [form.password]);
  const meetsMin = form.password.length >= 8;
  const hasU = hasUpper(form.password);
  const hasN = hasNumber(form.password);
  const hasS = hasSymbol(form.password);
  const match = !!form.password && form.password === form.confirm;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  /* Attach SSR cookies */
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

  /* -------------------------------------------------------------------------- */
  /*                               OAUTH HANDLERS                               */
  /* -------------------------------------------------------------------------- */
  const loginWithProvider = async (provider: "google" | "facebook") => {
    try {
      setOauthLoading(provider);

      const redirectParam = redirect || "/account";

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
            redirectParam
          )}`,
        },
      });

      if (error) {
        toast.error(error.message || `Could not start ${provider} sign in`);
        setOauthLoading(null);
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong, please try again.");
      setOauthLoading(null);
    }
  };

  const handleGoogleLogin = () => loginWithProvider("google");
  const handleFacebookLogin = () => loginWithProvider("facebook");

  /* -------------------------------------------------------------------------- */
  /*                           FORM SUBMIT HANDLER                               */
  /* -------------------------------------------------------------------------- */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agree) {
      toast.error(t("errAgree"));
      return;
    }
    if (!meetsMin || !hasU || !hasN || !hasS) {
      toast.error(t("errPasswordRequirements"));
      return;
    }
    if (!match) {
      toast.error(t("errPasswordsMismatch"));
      return;
    }

    setSubmitting(true);
    setVerificationNotice(null);

    const email = form.email.trim();
    const password = form.password;

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: form.full_name } },
      });

      if (error) {
        toast.error(error.message || t("errGeneric"));
        return;
      }

      if (!data.session) {
        setVerificationNotice(t("verificationSent"));
        toast.success(t("verificationEmailToast"));
        return;
      }

      await attachAfterAuth();

      // Stitch pre-signup anonymous activity onto the new user_id and
      // emit a `signup` event so the funnel can show signup placement.
      void fetch("/api/events/identify", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "signup" }),
      }).catch(() => {});

      toast.success(t("successToast"));
      router.replace(mode === "influencer" ? "/influencer-request" : redirect);
    } catch (err: any) {
      toast.error(err.message || t("errGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                                    UI                                      */
  /* -------------------------------------------------------------------------- */
  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            <CardContent className="space-y-5">

              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="full_name">{t("fullNameLabel")}</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  value={form.full_name}
                  onChange={onChange}
                  required
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={onChange}
                  required
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    name="password"
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={onChange}
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Strength Meter */}
                <div className="mt-2">
                  <div className="flex gap-1 h-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded ${segClass(
                          i <= strength.score - 1,
                          i,
                          strength.score
                        )}`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{t(strength.labelKey)}</span>
                    <span className="text-muted-foreground">
                      {t("charsCount", { count: form.password.length })}
                    </span>
                  </div>

                  <ul className="mt-2 space-y-1 text-xs">
                    <li className="flex items-center gap-1">
                      {meetsMin ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {t("requireMinLength")}
                    </li>

                    <li className="flex items-center gap-1">
                      {hasU ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {t("requireUppercase")}
                    </li>

                    <li className="flex items-center gap-1">
                      {hasN ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {t("requireNumber")}
                    </li>

                    <li className="flex items-center gap-1">
                      {hasS ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {t("requireSymbol")}
                    </li>
                  </ul>

                  {strength.score < 3 && strength.tips.length > 0 && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {t("tipsPrefix")} {strength.tips.slice(0, 3).map((id) => t(id)).join(" • ")}
                    </div>
                  )}
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirm">{t("confirmPasswordLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="confirm"
                    name="confirm"
                    type={showConfirm ? "text" : "password"}
                    value={form.confirm}
                    onChange={onChange}
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {form.confirm.length > 0 && (
                  <p
                    className={`text-xs mt-1 ${
                      match ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    {match ? t("passwordsMatch") : t("passwordsDoNotMatch")}
                  </p>
                )}
              </div>

              {/* Terms */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="agree"
                  checked={agree}
                  onCheckedChange={(v: any) => setAgree(!!v)}
                />
                <label htmlFor="agree" className="text-sm text-muted-foreground">
                  {t("agreePrefix")}{" "}
                  <Link href="/terms" className="text-primary hover:underline">
                    {tLinks("terms")}
                  </Link>{" "}
                  {t("agreeAnd")}{" "}
                  <Link href="/privacy" className="text-primary hover:underline">
                    {tLinks("privacy")}
                  </Link>
                  {t("agreeSuffix")}
                </label>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("submitting") : t("submit")}
              </Button>
              {verificationNotice ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {verificationNotice}
                </p>
              ) : null}
              {/* Divider — reuses the signIn namespace so the
                  "or continue with" / OAuth button labels translate
                  consistently across both auth pages. */}
              <div className="relative flex items-center py-2 mt-4">
                <div className="flex-1 border-t" />
                <span className="px-2 text-xs text-muted-foreground">
                  {tIn("orContinueWith")}
                </span>
                <div className="flex-1 border-t" />
              </div>

              {/* Social OAuth Buttons */}
              <div className="space-y-2 mt-4">
                <Button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={oauthLoading !== null}
                  className="w-full bg-white text-black border border-gray-300 hover:bg-gray-100"
                >
                  {oauthLoading === "google"
                    ? tIn("redirectingToGoogle")
                    : tIn("continueWithGoogle")}
                </Button>

                <Button
                  type="button"
                  onClick={handleFacebookLogin}
                  disabled={oauthLoading !== null}
                  className="w-full bg-[#1877F2] text-white hover:bg-[#166FE5]"
                >
                  {oauthLoading === "facebook"
                    ? tIn("redirectingToFacebook")
                    : tIn("continueWithFacebook")}
                </Button>
              </div>

            </CardContent>

            <CardFooter className="flex flex-col gap-4">


              <p className="text-sm text-center text-muted-foreground">
                {t("alreadyHaveAccountPrefix")}{" "}
                <Link
                  href={`/auth/login?redirect=${encodeURIComponent(redirect)}`}
                  className="text-primary hover:underline"
                >
                  {t("signInLink")}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
}
