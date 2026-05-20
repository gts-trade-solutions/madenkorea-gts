// /lib/contexts/AuthContext.tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { isSupportedLocale, type SupportedLocale } from "@/lib/locales";
import { COUNTRY_PROFILES, isSupportedCountry, type CountryCode } from "@/lib/countries";
import { isSupportedCurrency } from "@/lib/currency";

type UserRole = "customer" | "admin" | "super_admin";

type SessionUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  role?: UserRole; // NEW
};

type AuthContextType = {
  user: SessionUser | null;
  isAuthenticated: boolean;
  ready: boolean;
  isAdmin: boolean; // NEW
  hasRole: (role: UserRole) => boolean; // NEW
  login: (c: { email: string; password: string }) => Promise<void>;
  register: (r: {
    full_name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as any);

// ──────────────────────────────────────────────────────────────
// Preference sync: cookies ↔ profile.preferred_locale/country.
//
// The cookies (`mik_locale`, `mik_country`, `mik_currency`) are the
// per-device source of truth. We mirror locale + country to the
// profile so a fresh browser sign-in can restore the same UI/region
// the user picked elsewhere. Currency follows from country, so it's
// derived (not stored).
// ──────────────────────────────────────────────────────────────
const COOKIE_MAX_AGE_DAYS = 365;
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}
function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * On sign-in: if the user's profile has preferred_locale /
 * preferred_country saved, write them through to the cookies so the
 * UI follows the user across devices. If the profile is empty (new
 * user or pre-feature account), seed it from the current cookies.
 *
 * Triggers a full reload when cookies change, because LocaleProvider
 * + CurrencyProvider snapshot the cookie at SSR time and won't pick
 * up a mid-session change otherwise.
 */
async function syncPreferencesOnLogin(userId: string) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_locale, preferred_country")
      .eq("id", userId)
      .maybeSingle();

    const cookieLocale = readCookie("mik_locale");
    const cookieCountry = readCookie("mik_country");
    const cookieCurrency = readCookie("mik_currency");

    const savedLocale = profile?.preferred_locale;
    const savedCountry = profile?.preferred_country;

    let cookieChanged = false;

    if (savedLocale && isSupportedLocale(savedLocale)) {
      if (cookieLocale !== savedLocale) {
        writeCookie("mik_locale", savedLocale);
        cookieChanged = true;
      }
    } else if (cookieLocale && isSupportedLocale(cookieLocale)) {
      // Profile empty → seed it from cookie (one-time backfill).
      await supabase
        .from("profiles")
        .update({ preferred_locale: cookieLocale })
        .eq("id", userId);
    }

    if (savedCountry && isSupportedCountry(savedCountry)) {
      if (cookieCountry !== savedCountry) {
        writeCookie("mik_country", savedCountry);
        // Cascade currency from country profile when restoring across
        // devices — otherwise a user signing in on a new device might
        // see Polish UI but INR prices.
        const newCurrency = COUNTRY_PROFILES[savedCountry as CountryCode].defaultCurrency;
        if (cookieCurrency !== newCurrency) {
          writeCookie("mik_currency", newCurrency);
        }
        cookieChanged = true;
      }
    } else if (cookieCountry && isSupportedCountry(cookieCountry)) {
      await supabase
        .from("profiles")
        .update({ preferred_country: cookieCountry })
        .eq("id", userId);
    }

    if (cookieChanged && typeof window !== "undefined") {
      // Full reload so SSR re-reads the cookies and providers pick up
      // the new values. Cheaper than threading a "rehydrate" path
      // through every provider.
      window.location.reload();
    }
  } catch {
    // Best-effort — never block sign-in on a preferences sync failure.
  }
}

/**
 * On signup: take whatever cookies the visitor's session has now and
 * write them to the new profile so subsequent sign-ins elsewhere
 * restore the same setup. Cookies are guaranteed present because
 * middleware seeds them on first visit.
 */
async function seedProfilePreferences(userId: string) {
  try {
    const cookieLocale = readCookie("mik_locale");
    const cookieCountry = readCookie("mik_country");
    const updates: Record<string, string> = {};
    if (cookieLocale && isSupportedLocale(cookieLocale)) {
      updates.preferred_locale = cookieLocale;
    }
    if (cookieCountry && isSupportedCountry(cookieCountry)) {
      updates.preferred_country = cookieCountry;
    }
    if (Object.keys(updates).length === 0) return;
    await supabase.from("profiles").update(updates).eq("id", userId);
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  async function hydrateFromSession(authed: any) {
    if (!authed) {
      setUser(null);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, role")
      .eq("id", authed.id)
      .maybeSingle();

    setUser({
      id: authed.id,
      email: authed.email,
      full_name: profile?.full_name ?? authed.user_metadata?.full_name ?? null,
      avatar_url:
        profile?.avatar_url ?? authed.user_metadata?.avatar_url ?? null,
      role: (profile?.role as UserRole) ?? "customer",
    });
  }

  async function loadFromSession() {
    if (loadPromiseRef.current) return loadPromiseRef.current;

    loadPromiseRef.current = (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await hydrateFromSession(session?.user ?? null);
    })().finally(() => {
      loadPromiseRef.current = null;
    });

    return loadPromiseRef.current;
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadFromSession();
      if (mounted) setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const run = async () => {
        await hydrateFromSession(session?.user ?? null);
        setReady(true);
      };
      run();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = async (c: { email: string; password: string }) => {
    const { data, error } = await supabase.auth.signInWithPassword(c);
    if (error) throw error;
    await loadFromSession();
    setReady(true);
    // Mirror saved profile preferences into the cookies for this
    // browser. May trigger a reload if the saved values differ from
    // current cookies — that's intentional so SSR picks them up.
    if (data?.user?.id) {
      await syncPreferencesOnLogin(data.user.id);
    }
  };

  const register = async (r: {
    full_name: string;
    email: string;
    password: string;
  }) => {
    const { data, error } = await supabase.auth.signUp({
      email: r.email,
      password: r.password,
      options: { data: { full_name: r.full_name } },
    });
    if (error) throw error;
    await loadFromSession();
    setReady(true);
    // Persist the visitor's already-chosen locale/country to the new
    // profile so future sign-ins on other devices restore the setup.
    if (data?.user?.id) {
      await seedProfilePreferences(data.user.id);
    }
  };

  const logout = async () => {
    // Fire the analytics marker first; once we sign out the auth cookies
    // are gone and the track route would record this as anonymous.
    try {
      const { trackEvent } = await import("@/lib/analytics/track");
      trackEvent("logout", {}, { immediate: true });
    } catch {}
    await supabase.auth.signOut();
    setUser(null);
    setReady(true);
  };

  const refreshProfile = async () => {
    await loadFromSession();
  };

  // Super admin is a strict superset of admin — every check gated on
  // `admin` should also pass for `super_admin` (otherwise the super
  // admin loses access to their own protection-from-demotion page).
  const hasRole = (role: UserRole) => {
    if (!user?.role) return false;
    if (role === "admin") {
      return user.role === "admin" || user.role === "super_admin";
    }
    return user.role === role;
  };
  const isAdmin = hasRole("admin");

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      ready,
      isAdmin,
      hasRole,
      login,
      register,
      logout,
      refreshProfile,
    }),
    [user, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
