"use client";

import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { useLocaleContext } from "@/lib/contexts/LocaleContext";
import { useCountry } from "@/lib/contexts/CountryContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  COUNTRY_PROFILES,
  SUPPORTED_COUNTRIES,
  type CountryCode,
} from "@/lib/countries";
import { LOCALE_INFO, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/currency";

// Single header control that lets the visitor change country,
// language, and currency from one popover. Picking a country
// *cascades* — it updates the locale and currency to the country
// profile's defaults. Language and currency can still be overridden
// independently after — useful for, e.g., a Polish-speaking visitor
// in Germany who wants EUR pricing but Polish UI.
//
// When the user is signed in we also POST the new (locale, country)
// pair to /api/user/preferences so the next session restores it.
// Anonymous visitors rely on the cookies alone.

type Section = "country" | "language" | "currency";

export function CountrySwitcher() {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("country");

  const { country, profile, setCountry } = useCountry();
  const { locale, setLocale } = useLocaleContext();
  const { currency, rates, setCurrency } = useCurrency();
  const { isAuthenticated } = useAuth();

  // Best-effort persistence to profile. Fire-and-forget — the cookies
  // are the source of truth; the profile is just a "remember me on
  // next device" convenience. Failure here must never block the UI.
  const syncToProfile = async (nextLocale: SupportedLocale, nextCountry: CountryCode) => {
    if (!isAuthenticated) return;
    try {
      await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_locale: nextLocale,
          preferred_country: nextCountry,
        }),
      });
    } catch {}
  };

  // Locale changes require a full reload: next-intl's
  // NextIntlClientProvider snapshots `messages` at SSR time, so a
  // client-only locale change updates LocaleContext but doesn't swap
  // the strings rendered by `useTranslations()`. Reloading lets the
  // server re-read the `mik_locale` cookie and serve the new bundle.
  const reloadForLocale = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  const handleCountry = (next: CountryCode) => {
    const p = COUNTRY_PROFILES[next];
    const localeChanged = p.defaultLocale !== locale;
    setCountry(next);
    setLocale(p.defaultLocale);
    setCurrency(p.defaultCurrency);
    syncToProfile(p.defaultLocale, next);
    setOpen(false);
    if (localeChanged) reloadForLocale();
  };

  const handleLanguage = (next: SupportedLocale) => {
    const localeChanged = next !== locale;
    setLocale(next);
    syncToProfile(next, country);
    setOpen(false);
    if (localeChanged) reloadForLocale();
  };

  const handleCurrency = (next: CurrencyCode) => {
    setCurrency(next);
    setOpen(false);
    // Currency override doesn't change profile preferences and
    // doesn't need a reload — CurrencyContext re-renders prices
    // client-side fine.
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="
          inline-flex items-center gap-1.5 rounded-md px-2 py-1.5
          text-sm font-medium text-foreground hover:bg-accent
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        "
        aria-label={`Country: ${profile.name}. Change country, language, or currency`}
      >
        <span className="text-base leading-none" aria-hidden>{profile.flag}</span>
        <span className="hidden sm:inline">{profile.code}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
        <div className="flex border-b text-xs">
          {(["country", "language", "currency"] as Section[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSection(s)}
              className={`
                flex-1 px-3 py-2 capitalize transition-colors
                ${activeSection === s
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent/50"}
              `}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {activeSection === "country" && (
            <ul role="listbox">
              {SUPPORTED_COUNTRIES.map((code) => {
                const p = COUNTRY_PROFILES[code];
                const isActive = country === code;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleCountry(code)}
                      className="
                        flex w-full items-center justify-between gap-3 px-3 py-2
                        text-sm hover:bg-accent cursor-pointer
                      "
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-base leading-none" aria-hidden>{p.flag}</span>
                        <span className="font-medium truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.defaultLocale} · {p.defaultCurrency}
                        </span>
                      </span>
                      {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {activeSection === "language" && (
            <ul role="listbox">
              {SUPPORTED_LOCALES.map((code) => {
                const info = LOCALE_INFO[code];
                const isActive = locale === code;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleLanguage(code)}
                      className="
                        flex w-full items-center justify-between gap-3 px-3 py-2
                        text-sm hover:bg-accent cursor-pointer
                      "
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-medium">{info.nativeName}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {info.name}
                        </span>
                      </span>
                      {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {activeSection === "currency" && (
            <ul role="listbox">
              {SUPPORTED_CURRENCIES.map((code) => {
                const r = rates[code];
                if (!r) return null;
                const isActive = currency === code;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleCurrency(code)}
                      className="
                        flex w-full items-center justify-between gap-3 px-3 py-2
                        text-sm hover:bg-accent cursor-pointer
                      "
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex w-6 justify-center font-semibold text-muted-foreground">
                          {r.symbol}
                        </span>
                        <span className="font-medium">{r.code}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {r.name}
                        </span>
                      </span>
                      {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
