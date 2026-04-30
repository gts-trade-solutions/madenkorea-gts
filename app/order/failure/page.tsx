'use client';

import { useRouter } from 'next/navigation';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { XCircle, Home, ShoppingCart, RefreshCw } from 'lucide-react';

export default function OrderFailurePage() {
  const router = useRouter();

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <div className="max-w-2xl mx-auto">
          <Card className="border-destructive">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-destructive/10 p-6">
                  <XCircle className="h-16 w-16 text-destructive" />
                </div>
              </div>
              <CardTitle className="text-2xl">Payment Failed</CardTitle>
              <CardDescription className="text-base mt-2">
                We were unable to process your payment. Please try again or use a different payment method.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Common reasons for payment failure:</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Insufficient funds in your account</li>
                  <li>Incorrect card details or CVV</li>
                  <li>Card expired or blocked</li>
                  <li>Network or connection issues</li>
                  <li>Daily transaction limit exceeded</li>
                </ul>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={() => router.push('/checkout')}
                  className="w-full"
                  size="lg"
                >
                  <RefreshCw className="mr-2 h-5 w-5" />
                  Try Again
                </Button>

                <Button
                  onClick={() => router.push('/cart')}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Return to Cart
                </Button>

                <Button
                  onClick={() => router.push('/')}
                  variant="ghost"
                  className="w-full"
                  size="lg"
                >
                  <Home className="mr-2 h-5 w-5" />
                  Continue Shopping
                </Button>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-center text-muted-foreground">
                  Need help? Contact our support team at{' '}
                  <a href="mailto:support@madenkorea.com" className="text-primary hover:underline">
                    support@madenkorea.com
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </CustomerLayout>
  );
}
