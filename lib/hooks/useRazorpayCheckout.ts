"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

export type AttributionSnapshot = null | {
  type: "promo" | "link";
  code?: string;
  product_id?: string | null;
};

export type AddressSnapshot = null | {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
};

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export function useRazorpayCheckout() {
  const router = useRouter();
  const busyRef = useRef(false);

  const start = async (
    address: AddressSnapshot = null,
    attribution: AttributionSnapshot = null,
    uiTotal?: number | null,
    uiShippingFee?: number | null
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;

    try {
      const { data: created, error: cErr } = await supabase.rpc(
        "create_order_from_cart",
        { p_address: address ?? null, p_notes: null }
      );

      if (cErr || !created || !created[0]) {
        toast.error(cErr?.message || "Could not create order");
        busyRef.current = false;
        return;
      }

      const info = created[0] as {
        order_id: string;
        total: number;
        order_number?: string;
      };

      const res = await fetch("/api/razorpay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: info.order_id,
          ui_total: typeof uiTotal === "number" ? uiTotal : info.total,
          ui_shipping_fee:
            typeof uiShippingFee === "number" ? uiShippingFee : undefined,
          attribution,
        }),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok || !j?.razorpay_order?.id) {
        toast.error(j?.error ? String(j.error) : "Payment init failed");
        busyRef.current = false;
        return;
      }

      const { key, razorpay_order } = j;

      if (typeof uiTotal === "number") {
        console.log(
          "[RZP] Proceeding with total:",
          razorpay_order.amount / 100,
          "UI total:",
          uiTotal,
          "UI shipping:",
          uiShippingFee
        );
      }

      if (!window.Razorpay) {
        toast.error("Razorpay SDK not loaded");
        busyRef.current = false;
        return;
      }

      const rzp = new window.Razorpay({
        key,
        amount: razorpay_order.amount,
        currency: razorpay_order.currency,
        name: "Checkout",
        description: "Order payment",
        order_id: razorpay_order.id,
        prefill: {
          name: address?.name || "",
          email: address?.email || "",
          contact: address?.phone || "",
        },
        notes: { app_order_id: info.order_id },
        handler: async (resp: any) => {
          try {
            const verify = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
                app_order_id: info.order_id,
                raw: resp,
              }),
            });

            const vj = await verify.json().catch(() => ({}));

            if (!verify.ok || !vj?.ok) {
              toast.error(vj?.error || "Payment verification failed");
              router.replace(
                `/order/failure?reason=verification&order_id=${encodeURIComponent(
                  info.order_id
                )}`
              );
              return;
            }

            const successOrderId = vj.order_id || info.order_id;
            try {
              if (typeof window !== "undefined" && successOrderId) {
                sessionStorage.setItem("last_success_order_id", successOrderId);
                sessionStorage.setItem("payment_success_redirecting", "1");
              }
            } catch (e) {
              console.warn("[PAY] could not persist success order id", e);
            }

            router.replace(
              `/order/success?order=${encodeURIComponent(successOrderId)}`
            );

            // Clear cart in background after navigation is triggered so checkout
            // page cart-empty guards don't override success redirect.
            void (async () => {
              try {
                if (typeof window !== "undefined") {
                  localStorage.setItem("guest_cart_v1", "[]");
                  sessionStorage.removeItem("guest_cart_v1");
                }
              } catch (e) {
                console.warn("[CART] clear warning", e);
              }
            })();
          } catch (e: any) {
            console.error("[PAY] verify handler error", e);
            toast.error(e?.message || "Payment error");
          } finally {
            busyRef.current = false;
          }
        },
        modal: {
          ondismiss() {
            toast.info("Payment cancelled");
            router.replace(
              `/order/failure?reason=cancelled&order_id=${encodeURIComponent(
                info.order_id
              )}`
            );
            busyRef.current = false;
          },
        },
        theme: { color: "#3399cc" },
      });

      rzp.on("payment.failed", function (resp: any) {
        console.error("[RZP] payment.failed", resp);
        toast.error(
          resp?.error?.description || resp?.error?.reason || "Payment failed"
        );
        router.replace(
          `/order/failure?reason=failed&order_id=${encodeURIComponent(
            info.order_id
          )}`
        );
        busyRef.current = false;
      });

      rzp.open();
    } catch (e: any) {
      console.error("[RZP] checkout start failed", e);
      toast.error(e?.message || "Unable to start payment");
      busyRef.current = false;
    }
  };

  return { start };
}
