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
import { convertFromINR, formatPrice } from "@/lib/currency";

// Address where the structured order email gets sent. Keep in sync
// with what the team monitors.
const TEAM_EMAIL = "info@madenkorea.com";

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

  // Build a plain-text email body for the mailto: link. mailto URLs
  // are length-limited (~2000 chars in most clients), so we keep the
  // body terse and rely on the team to reply to the customer's email
  // for follow-up.
  const buildEmailBody = (displayTotal: number): string => {
    const lines: string[] = [];
    lines.push("Hi MadenKorea team,");
    lines.push("");
    lines.push(
      "I'd like to place an international order. My details are below."
    );
    lines.push("");

    lines.push("--- CONTACT ---");
    lines.push(`Name: ${name}`);
    lines.push(`Email: ${email}`);
    if (phone) lines.push(`Phone: ${phone}`);
    lines.push("");

    lines.push("--- SHIPPING ADDRESS ---");
    lines.push(line1);
    if (line2) lines.push(line2);
    lines.push(
      `${city}${stateRegion ? `, ${stateRegion}` : ""} ${postalCode}`
    );
    lines.push(country);
    lines.push("");

    lines.push("--- CART ---");
    for (const l of cart) {
      const lineTotal = l.unit_price_inr * l.quantity;
      lines.push(
        `- ${l.name} × ${l.quantity} — INR ${lineTotal.toLocaleString(
          "en-IN"
        )}`
      );
    }
    lines.push("");

    lines.push(
      `Total in INR: INR ${subtotalInr.toLocaleString("en-IN")}`
    );
    lines.push(
      `Total in ${currency}: ${formatPrice(subtotalInr, rate)}`
    );

    if (notes) {
      lines.push("");
      lines.push("--- NOTES ---");
      lines.push(notes);
    }

    lines.push("");
    lines.push(
      "Please send me a shipping quote and payment instructions."
    );
    lines.push("");
    lines.push(`Thanks,`);
    lines.push(name);

    return lines.join("\n");
  };

  // Save the request to the DB in the background. Failure is
  // non-fatal — the customer's email send is the primary delivery
  // channel while the SES pipeline is offline. We use keepalive so the
  // request finishes even if the page navigates after mailto: opens.
  const saveToDb = (displayTotal: number) => {
    try {
      fetch("/api/international-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
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
      }).catch(() => {
        // best-effort; primary delivery is the mailto: above
      });
    } catch {
      // ignore
    }
  };

  const submit = () => {
    if (!name || !email || !line1 || !city || !postalCode || !country) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const displayTotal = convertFromINR(subtotalInr, rate);

      // Fire-and-forget DB save so the admin team can still see the
      // request via /admin/international-orders even if the customer
      // never sends the mailto.
      saveToDb(displayTotal);

      // Pop open the customer's default mail app pre-filled with the
      // structured order details. They review + send manually. This
      // sidesteps the offline SES pipeline.
      const subject = `International order request — ${name}, ${country}`;
      const body = buildEmailBody(displayTotal);
      const mailto =
        `mailto:${encodeURIComponent(TEAM_EMAIL)}` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`;

      // window.location.href triggers the OS handler. Most browsers
      // open the user's mail app in a new context.
      window.location.href = mailto;

      toast.success(
        "Email draft opened in your mail app — please send it to complete your request."
      );
      onSubmitted?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Could not open mail app.");
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
            We ship internationally on a per-order basis. Fill in your
            details below — when you submit, your email app will open with
            a pre-filled request to us. Just review and send. We&apos;ll
            reply with a shipping quote and payment instructions within
            24 business hours.
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
                Opening mail app…
              </>
            ) : (
              "Open email & submit"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
