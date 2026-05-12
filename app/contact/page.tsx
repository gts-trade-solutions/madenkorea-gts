"use client";

import { useEffect, useState } from "react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { PolicyHero } from "@/components/PolicyHero";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, MapPin, Clock, ShieldCheck, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_BUSINESS_INFO,
  getBusinessInfo,
  type BusinessInfo,
} from "@/lib/businessInfo";
import { WHATSAPP_PHONE_NUMBER } from "@/lib/config/site";

// Inline WhatsApp glyph reused for the contact-form CTA. Same path data
// as `components/FloatingWhatsApp.tsx` so the brand mark stays
// consistent across surfaces.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export default function ContactPage() {
  // Pull live business / legal / Grievance Officer info on mount. The
  // page is `'use client'` because of the form below; the policy
  // disclosures used to live in the footer but are now surfaced here on
  // the relevant page only.
  const [business, setBusiness] = useState<BusinessInfo>(DEFAULT_BUSINESS_INFO);
  useEffect(() => {
    let cancelled = false;
    getBusinessInfo().then((b) => {
      if (!cancelled) setBusiness(b);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const supportPhone = business.publicPhone ?? "";
  const supportAddress = business.registeredAddress ?? "";
  const hasSupportPhone = supportPhone.length > 0;
  const hasSupportAddress = supportAddress.length > 0;

  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Email path — POST to /api/contact, which saves to contact_messages
  // and sends a notification email to the team via SES. SES is now
  // signing with d=madenkorea.com (custom MAIL FROM + DKIM verified)
  // so notifications actually reach the inbox.
  const handleSendEmail = async () => {
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      toast.error("Name, email, and message are required.");
      return;
    }

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        toast.error(
          body?.message || "Unable to send your message right now."
        );
        return;
      }
      toast.success("Thanks — we'll get back to you within 24 hours.");
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      toast.error("Network error — please try again.");
    }
  };

  // WhatsApp path — opens wa.me with the form fields pre-filled into a
  // chat message. Email is optional here since the conversation will
  // happen on WhatsApp, but we still pass it through if provided so
  // we can match the customer up with their account later if they email
  // us. Note: this does NOT save to `contact_messages` — the message
  // only exists in the resulting WhatsApp thread.
  const handleSendWhatsApp = () => {
    if (!formData.name.trim() || !formData.message.trim()) {
      toast.error("Please enter your name and a message.");
      return;
    }
    const lines = [
      `Hi MadenKorea, I'm ${formData.name.trim()}.`,
      formData.subject.trim() ? `Subject: ${formData.subject.trim()}` : null,
      formData.email.trim() ? `Email: ${formData.email.trim()}` : null,
      "",
      formData.message.trim(),
    ].filter(Boolean) as string[];
    const text = encodeURIComponent(lines.join("\n"));
    const url = `https://wa.me/${WHATSAPP_PHONE_NUMBER}?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
    // We don't clear the form here — the customer hasn't actually sent
    // the message yet (they still need to tap Send inside WhatsApp), so
    // keeping the form populated is the right behaviour if they come
    // back to retry or fall back to email.
  };

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow="We're here to help"
        title="Get in touch"
        description="Questions about a product, an order, or anything K-beauty? Reach us through the form below or any of the channels on the right — we typically reply within 24 hours during business hours."
      />

      <div className="container mx-auto px-4 py-10 sm:py-14">
        {/* Main: form (3 cols) + sidebar (2 cols) at lg:+. Form first in
            DOM so it stacks on top on mobile (the primary action). */}
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-5 lg:gap-8">
          {/* ---------- Form ---------- */}
          <Card className="lg:col-span-3 border-none shadow-md">
            <CardHeader className="border-b bg-muted/30 rounded-t-lg">
              <CardTitle className="text-2xl">Send us a message</CardTitle>
              <CardDescription>
                Fill the form and pick whichever channel is easiest for you.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {/* The form `onSubmit` defaults to the email path so pressing
                  Enter in any field still sends an email (least-surprise
                  behaviour). The two buttons below let the customer pick
                  channel explicitly. */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendEmail();
                }}
                className="space-y-5"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Your name"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="flex items-baseline justify-between">
                      <span>Email</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        Required for email
                      </span>
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="subject" className="flex items-baseline justify-between">
                    <span>Subject</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      Optional
                    </span>
                  </Label>
                  <Input
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder="What's this about?"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    name="message"
                    rows={6}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us how we can help…"
                    required
                  />
                </div>

                {/* Send buttons: stacked on mobile, side-by-side on sm+. */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full sm:flex-1"
                    disabled={isLoading}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Send via email
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleSendWhatsApp}
                    disabled={isLoading}
                    className="w-full sm:flex-1 bg-[#25D366] text-white hover:bg-[#1fb958] focus-visible:ring-[#25D366]"
                  >
                    <WhatsAppIcon className="mr-2 h-4 w-4" />
                    Send via WhatsApp
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  We pre-fill the message and open your own email or
                  WhatsApp app &mdash; you tap Send inside it. Nothing
                  leaves your device automatically.
                </p>
              </form>
            </CardContent>
          </Card>

          {/* ---------- Sidebar: Reach us + WhatsApp shortcut ---------- */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-none shadow-md">
              <CardHeader className="border-b bg-muted/30 rounded-t-lg">
                <CardTitle className="text-lg">Reach us directly</CardTitle>
                <CardDescription>
                  Prefer a quick channel? Pick one of these.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-5">
                <ContactRow
                  icon={<Mail className="h-4 w-4" />}
                  label="Email"
                  value={business.supportEmail}
                  href={`mailto:${business.supportEmail}`}
                />
                {hasSupportPhone && (
                  <ContactRow
                    icon={<Phone className="h-4 w-4" />}
                    label="Phone"
                    value={supportPhone}
                    href={`tel:${supportPhone.replace(/\s+/g, "")}`}
                  />
                )}
                <ContactRow
                  icon={<Clock className="h-4 w-4" />}
                  label="Business hours"
                  value={business.businessHours}
                />
                {hasSupportAddress && (
                  <ContactRow
                    icon={<MapPin className="h-4 w-4" />}
                    label="Address"
                    value={supportAddress}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-gradient-to-br from-[#25D366] to-[#1ea857] text-white">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-white/20 p-2 flex-shrink-0">
                    <WhatsAppIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold mb-1">
                      Chat on WhatsApp
                    </h3>
                    <p className="text-sm text-white/90 mb-4">
                      Skip the form &mdash; open a chat with us on WhatsApp
                      for the quickest response.
                    </p>
                    <a
                      href={`https://wa.me/${WHATSAPP_PHONE_NUMBER}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-[#1fa855] hover:bg-white/90 transition-colors"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                      Start a chat
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ---------- Grievance Officer + Company info ----------
            Required under Consumer Protection (E-Commerce) Rules 2020
            and the DPDP Act 2023. Visually subtler than the main form
            since they're reference info, not the primary CTA. */}
        {(business.grievanceOfficerName || business.legalEntityName) && (
          <div className="max-w-6xl mx-auto mt-16 pt-10 border-t">
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold">Legal &amp; company information</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Statutory disclosures &mdash; for grievances, GST queries, or
                regulatory questions.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {business.grievanceOfficerName && (
                <Card className="bg-muted/30 border-muted">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">
                        Grievance Redressal Officer
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs">
                      For unresolved complaints &middot; acknowledged within
                      48 hrs &middot; resolved within one month.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm space-y-1">
                    <p className="font-medium">{business.grievanceOfficerName}</p>
                    {business.grievanceOfficerDesignation && (
                      <p className="text-muted-foreground">
                        {business.grievanceOfficerDesignation}
                      </p>
                    )}
                    {business.grievanceOfficerEmail && (
                      <p>
                        <a
                          href={`mailto:${business.grievanceOfficerEmail}`}
                          className="text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {business.grievanceOfficerEmail}
                        </a>
                      </p>
                    )}
                    {hasSupportPhone && (
                      <p className="text-muted-foreground">
                        Phone: {supportPhone}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {business.legalEntityName && (
                <Card className="bg-muted/30 border-muted">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">Company information</CardTitle>
                    </div>
                    <CardDescription className="text-xs">
                      Operator of the MadenKorea storefront.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm space-y-1">
                    <p className="font-medium">{business.legalEntityName}</p>
                    {hasSupportAddress && (
                      <p className="text-muted-foreground whitespace-pre-line">
                        {supportAddress}
                      </p>
                    )}
                    {business.gstin && (
                      <p className="text-muted-foreground">
                        GSTIN: <span className="font-mono">{business.gstin}</span>
                      </p>
                    )}
                    {business.cdscoRegistration && (
                      <p className="text-muted-foreground">
                        CDSCO reg.:{" "}
                        <span className="font-mono">{business.cdscoRegistration}</span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}

// Compact contact-method row used in the sidebar. Icon in a muted
// rounded square + label + value, where the value can optionally be a
// real link (mailto / tel).
function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const valueEl = href ? (
    <a
      href={href}
      className="text-sm text-foreground hover:text-primary hover:underline break-words"
    >
      {value}
    </a>
  ) : (
    <p className="text-sm text-foreground whitespace-pre-line break-words">
      {value}
    </p>
  );
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-md bg-muted p-2 text-muted-foreground flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
          {label}
        </p>
        {valueEl}
      </div>
    </div>
  );
}
