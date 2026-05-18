"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MEMBERSHIP_PLAN_NAME } from "@/lib/membership";
import { useCurrency } from "@/lib/contexts/CurrencyContext";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

type MembershipRow = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  plan_name?: string | null;
};

export function AccountMembershipCard() {
  const t = useTranslations("membershipCard");
  const { isINR } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<MembershipRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;

      if (!userId) {
        if (!cancelled) {
          setMembership(null);
          setLoading(false);
        }
        return;
      }

      const { data: row } = await supabase
        .from("user_memberships")
        .select("id, status, starts_at, ends_at, plan_name")
        .eq("user_id", userId)
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: false })
        .limit(1)
        .maybeSingle<MembershipRow>();

      if (!cancelled) {
        setMembership(row ?? null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // K Plus is India-only; hide the entire card for international
  // customers. Early-return AFTER all hooks to keep hook order stable.
  if (!isINR) return null;

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">
            {t("label")}
          </p>
          <h3 className="mt-2 text-2xl font-bold">{MEMBERSHIP_PLAN_NAME}</h3>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("checking")}</p>
      ) : membership ? (
        <div className="mt-4 rounded-xl border border-green-600 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-700">
            {t("activeStatus", { plan: membership.plan_name || MEMBERSHIP_PLAN_NAME })}
          </p>
          <p className="mt-2 text-sm text-green-700">
            {t("validUntil", {
              date: new Date(membership.ends_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            })}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            {t("inactiveBody", { plan: MEMBERSHIP_PLAN_NAME })}
          </p>
          <Button asChild className="mt-4">
            <Link href="/k-plus">{t("joinCta", { plan: MEMBERSHIP_PLAN_NAME })}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default AccountMembershipCard;