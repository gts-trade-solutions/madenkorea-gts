"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

type FloatingWhatsAppProps = {
  phoneNumber: string; // example: 919876543210
  message?: string;
};

export function FloatingWhatsApp({
  phoneNumber,
  message = "Hi, I need help.",
}: FloatingWhatsAppProps) {
  const href = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-5 right-5 z-[999] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105"
    >
      <MessageCircle className="h-7 w-7" />
    </Link>
  );
}