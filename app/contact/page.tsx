"use client";

import { useState } from "react";
import { CustomerLayout } from "@/components/CustomerLayout";
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
import { Mail, Phone, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";

export default function ContactPage() {
  const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || "";
  const supportAddress = process.env.NEXT_PUBLIC_SUPPORT_ADDRESS?.trim() || "";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Unable to submit message");
      }

      toast.success("Message sent successfully! We'll get back to you soon.");
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (err: any) {
      toast.error(
        err?.message || "We could not send your message. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Have questions? We'd love to hear from you. Send us a message and
            we'll respond as soon as possible.
          </p>
        </div>

        <div
          className={`grid grid-cols-1 ${
            hasSupportPhone ? "lg:grid-cols-3" : "lg:grid-cols-2"
          } gap-8 mb-12`}
        >
          <Card>
            <CardContent className="pt-6 text-center">
              <Mail className="h-10 w-10 mx-auto mb-4 text-primary" />
              <h3 className="font-semibold mb-2">Email</h3>
              <p className="text-sm text-muted-foreground">
                info@madenkorea.com
              </p>
            </CardContent>
          </Card>

          {hasSupportPhone && (
            <Card>
              <CardContent className="pt-6 text-center">
                <Phone className="h-10 w-10 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">Phone</h3>
                <p className="text-sm text-muted-foreground">{supportPhone}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6 text-center">
              <Clock className="h-10 w-10 mx-auto mb-4 text-primary" />
              <h3 className="font-semibold mb-2">Business Hours</h3>
              <p className="text-sm text-muted-foreground">
                Mon-Fri: 9AM - 6PM IST
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Send us a Message</CardTitle>
              <CardDescription>
                Fill out the form and we'll get back to you within 24 hours
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    name="message"
                    rows={5}
                    value={formData.message}
                    onChange={handleChange}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Sending..." : "Send Message"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {hasSupportAddress ? "Visit Our Office" : "Customer Support"}
              </CardTitle>
              <CardDescription>
                {hasSupportAddress
                  ? "We'd love to meet you in person"
                  : "Reach us through our active support channels"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {hasSupportAddress && (
                <>
                  <div className="flex gap-4">
                    <MapPin className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                    <div>
                      <h4 className="font-semibold mb-2">Address</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {supportAddress}
                      </p>
                    </div>
                  </div>

                </>
              )}

              <div className="space-y-2">
                <h4 className="font-semibold">Customer Support</h4>
                <p className="text-sm text-muted-foreground">
                  For immediate assistance, our customer support team is
                  available via email and phone during business hours. We
                  typically respond to inquiries within 24 hours.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </CustomerLayout>
  );
}
