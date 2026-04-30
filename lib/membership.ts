import { createClient } from "@supabase/supabase-js";

export const MEMBERSHIP_PLAN_CODE = "k_plus";
export const MEMBERSHIP_PLAN_NAME = "K-Plus";
export const MEMBERSHIP_PRICE = 199;
export const MEMBERSHIP_DURATION_DAYS = 90;

export const DELIVERY_THRESHOLD = 2000;
export const DEFAULT_SHIPPING_FEE = 149;

export type MembershipRow = {
  id?: string;
  user_id?: string;
  plan_code?: string;
  plan_name?: string;
  amount?: number;
  duration_days?: number;
  status: string;
  starts_at?: string;
  ends_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export function hasActiveMembership(
  membership?: Pick<MembershipRow, "status" | "ends_at"> | null
) {
  if (!membership) return false;

  return (
    membership.status === "active" &&
    new Date(membership.ends_at).getTime() > Date.now()
  );
}

export function computeShippingFee(
  subtotal: number,
  membership?: Pick<MembershipRow, "status" | "ends_at"> | null
) {
  if (hasActiveMembership(membership)) return 0;
  if (subtotal >= DELIVERY_THRESHOLD) return 0;
  return DEFAULT_SHIPPING_FEE;
}

export function shippingMessage(
  subtotal: number,
  membership?: Pick<MembershipRow, "status" | "ends_at"> | null
) {
  if (hasActiveMembership(membership)) {
    return `${MEMBERSHIP_PLAN_NAME} benefit applied: Free delivery`;
  }

  if (subtotal >= DELIVERY_THRESHOLD) {
    return "Free delivery applied";
  }

  return `Free delivery on orders above ₹${DELIVERY_THRESHOLD.toLocaleString(
    "en-IN"
  )}`;
}

export async function syncMembershipStatus(userId: string) {
  const res = await fetch("/api/membership/sync-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Failed to sync membership status");
  }

  return data;
}

export async function getActiveMembership(userId: string) {
  await syncMembershipStatus(userId);

  const { data, error } = await supabase
    .from("user_memberships")
    .select("id, user_id, plan_code, plan_name, amount, duration_days, status, starts_at, ends_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}