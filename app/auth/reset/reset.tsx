'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';

// ---- Strength helpers (no external libs) ----
type Strength = { score: 0|1|2|3|4; label: string; tips: string[] };

function hasUpper(s: string) { return /[A-Z]/.test(s); }
function hasNumber(s: string) { return /\d/.test(s); }
function hasSymbol(s: string) { return /[^A-Za-z0-9\s]/.test(s); }
function hasSequence(s: string) { return /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|asdf|zxcv)/i.test(s); }
function hasRepeat(s: string) { return /(.)\1{2,}/.test(s); }

function scorePassword(pw: string): Strength {
  const tips: string[] = [];
  if (!pw) return { score: 0, label: 'Too weak', tips: ['Use at least 8 characters'] };

  let score = 0;

  if (pw.length >= 15) score += 3;
  else if (pw.length >= 11) score += 2;
  else if (pw.length >= 8) score += 1;

  const varieties = [/[a-z]/.test(pw), hasUpper(pw), hasNumber(pw), hasSymbol(pw)].filter(Boolean).length;
  score += Math.max(0, varieties - 1);

  if (hasSequence(pw)) score -= 1;
  if (hasRepeat(pw)) score -= 1;

  score = Math.max(0, Math.min(4, score));

  if (pw.length < 12) tips.push('Make it longer (12+ chars)');
  if (!hasUpper(pw)) tips.push('Add uppercase letter');
  if (!hasNumber(pw)) tips.push('Add a number');
  if (!hasSymbol(pw)) tips.push('Add a symbol');
  if (hasSequence(pw)) tips.push('Avoid common sequences (e.g., 1234, abcd)');
  if (hasRepeat(pw)) tips.push('Avoid repeated characters');

  const labels = ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'] as const;
  return { score: score as 0|1|2|3|4, label: labels[score], tips };
}

function segClass(active: boolean, idx: number, score: number) {
  if (!active) return 'bg-muted';
  return [
    'bg-red-500',
    score >= 2 ? 'bg-orange-500' : 'bg-red-500',
    score >= 3 ? 'bg-yellow-500' : 'bg-orange-500',
    score >= 4 ? 'bg-emerald-500' : 'bg-yellow-500',
  ][idx];
}

export default function ResetPasswordPage() {
  const sp = useSearchParams();
  const token = (sp.get('token') || '').trim();

  const [checking, setChecking] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const peekPwTimeout = useRef<number | null>(null);
  const peekConfirmTimeout = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) {
        if (!cancelled) {
          setCanReset(false);
          setChecking(false);
        }
        return;
      }

      const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));

      if (cancelled) return;
      setCanReset(!!data?.valid);
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const strength = useMemo(() => scorePassword(password), [password]);
  const meetsMin = password.length >= 8;
  const hasU = hasUpper(password);
  const hasN = hasNumber(password);
  const hasS = hasSymbol(password);
  const match = !!password && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetsMin || !hasU || !hasN || !hasS) {
      toast.error('Please meet the minimum password requirements.');
      return;
    }
    if (!match) {
      toast.error('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok || !data?.ok) {
      toast.error(data?.error || 'Could not reset password');
      return;
    }

    toast.success('Password changed successfully.');
    setDone(true);
  };

  const holdToPeek = (which: 'pw' | 'confirm', down: boolean) => {
    const setFn = which === 'pw' ? setShowPw : setShowConfirm;
    const timeoutRef = which === 'pw' ? peekPwTimeout : peekConfirmTimeout;

    if (down) {
      setFn(true);
      const id = window.setTimeout(() => setFn(false), 2000);
      if (which === 'pw') peekPwTimeout.current = id;
      else peekConfirmTimeout.current = id;
    } else {
      setFn(false);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    }
  };

  if (checking) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader><CardTitle>Reset password</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground">Verifying your link...</p></CardContent>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  if (!canReset) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Link expired</CardTitle>
              <CardDescription>Your reset link is invalid or has expired.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Link href="/auth/forgot" className="text-primary hover:underline">Send a new reset link</Link>
            </CardFooter>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  if (done) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Password updated</CardTitle>
              <CardDescription>Your password has been reset successfully.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild className="w-full">
                <Link href="/auth/login">Go to Sign in</Link>
              </Button>
            </CardFooter>
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
            <CardTitle className="text-2xl">Set a new password</CardTitle>
            <CardDescription>Choose a strong password you don't use elsewhere.</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowPw(v => !v)}
                    onMouseDown={() => holdToPeek('pw', true)}
                    onMouseUp={() => holdToPeek('pw', false)}
                    onMouseLeave={() => holdToPeek('pw', false)}
                    onTouchStart={() => holdToPeek('pw', true)}
                    onTouchEnd={() => holdToPeek('pw', false)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    title="Click to toggle • Hold to peek"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="mt-2">
                  <div className="flex gap-1 h-2">
                    {[0,1,2,3].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded ${segClass(i <= strength.score-1, i, strength.score)}`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{strength.label}</span>
                    <span className="text-muted-foreground">{password.length} chars</span>
                  </div>

                  <ul className="mt-2 space-y-1 text-xs">
                    <li className="flex items-center gap-1">
                      {meetsMin ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      At least 8 characters
                    </li>
                    <li className="flex items-center gap-1">
                      {hasU ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      Uppercase letter
                    </li>
                    <li className="flex items-center gap-1">
                      {hasN ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      Number
                    </li>
                    <li className="flex items-center gap-1">
                      {hasS ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      Symbol
                    </li>
                  </ul>

                  {strength.score < 3 && strength.tips.length > 0 && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Try: {strength.tips.slice(0,3).join(' • ')}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <div className="flex gap-2">
                  <Input
                    id="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowConfirm(v => !v)}
                    onMouseDown={() => holdToPeek('confirm', true)}
                    onMouseUp={() => holdToPeek('confirm', false)}
                    onMouseLeave={() => holdToPeek('confirm', false)}
                    onTouchStart={() => holdToPeek('confirm', true)}
                    onTouchEnd={() => holdToPeek('confirm', false)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    title="Click to toggle • Hold to peek"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {confirm.length > 0 && (
                  <p className={`text-xs mt-1 ${match ? 'text-emerald-600' : 'text-destructive'}`}>
                    {match ? 'Passwords match' : 'Passwords do not match'}
                  </p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Updating...' : 'Update password'}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Remembered it?{' '}
                <Link href="/auth/login" className="text-primary hover:underline">Sign in</Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
}
