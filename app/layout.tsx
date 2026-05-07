import "./globals.css";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { CartProvider } from "@/lib/contexts/CartContext";
import { WishlistProvider } from "@/lib/contexts/WishlistContext";
import { CookieConsentProvider } from "@/lib/contexts/CookieConsentContext";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import Script from "next/script";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { AnalyticsBootstrap } from "@/components/AnalyticsBootstrap";
import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import {
  WHATSAPP_DEFAULT_MESSAGE,
  WHATSAPP_PHONE_NUMBER,
} from "@/lib/config/site";

const inter = Inter({ subsets: ["latin"] });


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} overflow-x-clip`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="madenkorea-theme"
        >
          <AuthProvider>
            <CookieConsentProvider>
              <CartProvider>
                <WishlistProvider>
                  {/* Google Analytics — only loads once the user grants
                      "Analytics" consent through the banner. No GA cookies
                      or requests until that happens. */}
                  <AnalyticsScripts />
                  <Suspense fallback={null}>
                    <AnalyticsBootstrap />
                  </Suspense>
                  {children}
                  <FloatingWhatsApp
                    phoneNumber={WHATSAPP_PHONE_NUMBER}
                    message={WHATSAPP_DEFAULT_MESSAGE}
                  />
                  <Toaster />
                  <CookieConsentBanner />
                </WishlistProvider>
              </CartProvider>
            </CookieConsentProvider>
          </AuthProvider>
        </ThemeProvider>
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
