"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCookieConsent } from "@/lib/contexts/CookieConsentContext";

/**
 * Bottom-anchored cookie consent banner. Shows on first visit until the
 * user picks one of three actions: Accept all, Reject all, or Customize
 * (opens the preferences dialog). Once a decision is recorded the
 * banner doesn't reappear unless the user opens "Manage cookies" from
 * the footer to revisit.
 */
export function CookieConsentBanner() {
  const t = useTranslations("cookieConsent");
  const {
    consent,
    needsDecision,
    acceptAll,
    rejectAll,
    setConsent,
    preferencesOpen,
    openPreferences,
    closePreferences,
  } = useCookieConsent();

  // Local mirror of the form state inside the dialog. First-time
  // visitors get Functional + Analytics ON by default (a generally
  // user-friendly stance), but Marketing OFF — marketing pixels are the
  // highest-risk category for consent claims and most regulators expect
  // an explicit opt-in. Returning users see whatever they previously
  // saved.
  const [draft, setDraft] = useState({
    analytics: consent.analytics ?? true,
    marketing: consent.marketing ?? false,
    functional: consent.functional ?? true,
  });

  const handleOpenPrefs = () => {
    setDraft({
      analytics: consent.analytics ?? true,
      marketing: consent.marketing ?? false,
      functional: consent.functional ?? true,
    });
    openPreferences();
  };

  const handleSave = () => {
    setConsent({
      analytics: draft.analytics,
      marketing: draft.marketing,
      functional: draft.functional,
    });
    closePreferences();
  };

  return (
    <>
      {needsDecision && (
        <div
          role="dialog"
          aria-label={t("ariaLabel")}
          // Bigger, more visible card. Centered max-width so it doesn't
          // stretch edge-to-edge on huge displays. z-40 sits above page
          // content but below shadcn Dialog (z-50). Mobile safe-area
          // inset keeps the banner above the iOS home bar.
          className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-primary bg-background shadow-2xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="container mx-auto px-4 py-5 sm:py-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="rounded-full bg-muted p-2 flex-shrink-0">
                <Cookie className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold mb-1">{t("title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("body")}{" "}
                  <Link
                    href="/policies/cookies"
                    className="underline text-foreground"
                  >
                    {t("readPolicy")}
                  </Link>
                  .
                </p>
              </div>
            </div>
            {/* Buttons: full-width column on mobile (one per row, big tap
                targets), inline on desktop. Order is Customize (least
                committal) → Reject all → Accept all (primary). */}
            <div className="flex flex-col sm:flex-row gap-2 lg:flex-nowrap shrink-0 w-full lg:w-auto">
              <Button
                variant="outline"
                onClick={handleOpenPrefs}
                className="w-full sm:w-auto"
              >
                {t("customize")}
              </Button>
              <Button
                variant="outline"
                onClick={rejectAll}
                className="w-full sm:w-auto"
                // "Only necessary" instead of "Reject all" — the latter
                // implied the app might stop working, which isn't true
                // (necessary cookies stay on regardless). Same action
                // under the hood: rejectAll() keeps Necessary on and
                // turns Functional / Analytics / Marketing off.
                title={t("onlyNecessaryTitle")}
              >
                {t("onlyNecessary")}
              </Button>
              <Button onClick={acceptAll} className="w-full sm:w-auto">
                {t("acceptAll")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={preferencesOpen}
        onOpenChange={(o) => (o ? handleOpenPrefs() : closePreferences())}
      >
        <DialogContent
          // max-h + overflow-y so the close button at top-right stays
          // visible on mobile (where DialogContent + system bars together
          // were exceeding 100dvh and clipping the top of the dialog).
          className="max-w-lg max-h-[90dvh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{t("prefsTitle")}</DialogTitle>
            <DialogDescription>{t("prefsDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <PrefRow
              title={t("rowNecessary")}
              description={t("rowNecessaryDesc")}
              checked
              disabled
              onChange={() => {}}
            />
            <PrefRow
              title={t("rowFunctional")}
              description={t("rowFunctionalDesc")}
              checked={draft.functional}
              onChange={(v) => setDraft((d) => ({ ...d, functional: v }))}
            />
            <PrefRow
              title={t("rowAnalytics")}
              description={t("rowAnalyticsDesc")}
              checked={draft.analytics}
              onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
            />
            <PrefRow
              title={t("rowMarketing")}
              description={t("rowMarketingDesc")}
              checked={draft.marketing}
              onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))}
            />
          </div>

          {/* Action row: stacked full-width on mobile, inline on desktop.
              Save is the primary; "Only necessary" / Accept all are
              quick shortcuts that bypass the toggles. "Only necessary"
              keeps Necessary cookies on (the site needs them) and turns
              everything else off. */}
          <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap gap-2 sm:justify-end pt-2">
            <Button
              variant="outline"
              onClick={rejectAll}
              className="w-full sm:w-auto"
              title={t("onlyNecessaryTitle")}
            >
              {t("onlyNecessary")}
            </Button>
            <Button
              variant="outline"
              onClick={acceptAll}
              className="w-full sm:w-auto"
            >
              {t("acceptAll")}
            </Button>
            <Button onClick={handleSave} className="w-full sm:w-auto">
              {t("save")}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("fullListPrefix")}{" "}
            <Link href="/policies/cookies" className="underline">
              {t("cookiePolicyLink")}
            </Link>
            .
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PrefRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <Label className="text-sm font-medium">{title}</Label>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={title}
      />
    </div>
  );
}
