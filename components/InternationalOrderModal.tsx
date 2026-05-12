"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { convertFromINR } from "@/lib/currency";

// Modal used by the cart page (for non-INR visitors) to submit an
// international order request. We collect contact + shipping
// information and a snapshot of the cart line items, send it to the
// team via SES, and acknowledge to the customer.

export type CartLineForRequest = {
  product_id: string;
  name: string;
  sku?: string | null;
  quantity: number;
  unit_price_inr: number;
  hero_image_url?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cart line items, with prices in INR (canonical). */
  cart: CartLineForRequest[];
  /** Subtotal in INR for the snapshot. */
  subtotalInr: number;
  /** Optional auth-supplied defaults. */
  defaults?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  /** Called after a successful submission so the parent can clear UI. */
  onSubmitted?: () => void;
};

export function InternationalOrderModal({
  open,
  onOpenChange,
  cart,
  subtotalInr,
  defaults,
  onSubmitted,
}: Props) {
  const { rate, currency } = useCurrency();

  const [name, setName] = useState(defaults?.name ?? "");
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name || !email || !line1 || !city || !postalCode || !country) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const displayTotal = convertFromINR(subtotalInr, rate);
      const res = await fetch("/api/international-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_email: email,
          customer_phone: phone || undefined,
          country,
          address: {
            line1,
            line2: line2 || null,
            city,
            state: stateRegion || null,
            postal_code: postalCode,
            country,
          },
          cart: cart.map((l) => ({
            ...l,
            line_total_inr: l.unit_price_inr * l.quantity,
          })),
          currency_code: currency,
          display_total: displayTotal,
          inr_total: subtotalInr,
          notes: notes || undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        toast.error(body?.error || "Could not submit your request.");
        return;
      }

      toast.success(
        "Order request received — we'll email you a quote within 24 hours."
      );
      onSubmitted?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request International Order</DialogTitle>
          <DialogDescription>
            We ship internationally on a per-order basis. Submit your contact
            and shipping details — we&apos;ll email a shipping quote and
            payment instructions for your country within 24 business hours.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="io-name">Full name *</Label>
              <Input id="io-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="io-email">Email *</Label>
              <Input id="io-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="io-phone">Phone (with country code)</Label>
            <Input id="io-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 555 0123" />
          </div>

          <div className="border-t pt-4">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Shipping address
            </Label>
          </div>

          <div>
            <Label htmlFor="io-line1">Address line 1 *</Label>
            <Input id="io-line1" value={line1} onChange={(e) => setLine1(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="io-line2">Address line 2</Label>
            <Input id="io-line2" value={line2} onChange={(e) => setLine2(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="io-city">City *</Label>
              <Input id="io-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="io-state">State / Region</Label>
              <Input id="io-state" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="io-postal">Postal code *</Label>
              <Input id="io-postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="io-country">Country *</Label>
              <Input id="io-country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="io-notes">Notes (optional)</Label>
            <Textarea
              id="io-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any special requests, gift wrapping, preferred delivery dates, etc."
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit request"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
