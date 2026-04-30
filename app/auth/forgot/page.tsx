'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const sendReset = async () => {
    if (!email.trim()) {
      toast.error('Please enter your email');
      return;
    }

    setSubmitting(true);
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      toast.error('Could not process request right now. Please try again.');
      setStatus({
        type: 'error',
        message: "We couldn't send the reset email right now. Please try again later or contact support.",
      });
      return;
    }

    if (data?.deliveryStatus === 'failed' || data?.success === false) {
      const msg =
        data?.message ||
        "We couldn't send the reset email right now. Please try again later or contact support.";
      toast.error(msg);
      setStatus({ type: 'error', message: msg });
      setSent(false);
      return;
    }

    const msg =
      data?.message ||
      'If an account exists for this email, a reset link has been sent.';
    toast.success(msg);
    setStatus({ type: 'success', message: msg });
    setSent(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendReset();
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">Forgot password</CardTitle>
            <CardDescription>We'll email you a link to reset your password.</CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            {!sent ? (
              <>
                <CardContent className="space-y-4">
                  {status && (
                    <div
                      className={`rounded-md border px-3 py-3 text-sm ${
                        status.type === 'error'
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {status.message}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? 'Sending...' : 'Send reset link'}
                  </Button>
                  <p className="text-sm text-center text-muted-foreground">
                    Remembered it?{' '}
                    <Link href="/auth/login" className="text-primary hover:underline">
                      Sign in
                    </Link>
                  </p>
                </CardFooter>
              </>
            ) : (
              <>
                <CardContent className="space-y-4">
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                    <p className="font-medium">{status?.message || 'If an account exists for this email, a reset link has been sent.'}</p>
                    <p className="mt-1">Didn&apos;t receive it? You can resend the link.</p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="button" className="w-full" disabled={submitting} onClick={sendReset}>
                    {submitting ? 'Sending...' : 'Resend reset link'}
                  </Button>
                  <p className="text-sm text-center text-muted-foreground">
                    Back to{' '}
                    <Link href="/auth/login" className="text-primary hover:underline">
                      Sign in
                    </Link>
                  </p>
                </CardFooter>
              </>
            )}
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
}
