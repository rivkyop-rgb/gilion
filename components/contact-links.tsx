"use client";

import { displayPhone } from "@/lib/domain/phone-display";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { Ltr } from "@/components/ui/ltr";
import { cn } from "@/lib/utils";
import { emailHref } from "@/lib/domain/mail-link";
import { useMailClient } from "./mail-client";

/**
 * wa.me wants the international form without "+" or the trunk zero:
 * 0521234567 → 972521234567. Phones are stored normalised (lib/domain/customer.ts),
 * so a leading 0 is the only local form that reaches here.
 */
export function whatsappHref(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, "");
  const base = `https://wa.me/${digits.startsWith("0") ? `972${digits.slice(1)}` : digits}`;
  // wa.me opens the chat with this text already typed; sending stays a person's act.
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/**
 * A phone number that dials, with WhatsApp beside it.
 *
 * `tel:` hands the number to whatever the computer uses for calls. WhatsApp is
 * a separate link because a browser cannot know whether the app is installed:
 * wa.me opens the desktop app when it is, and WhatsApp Web when it is not.
 */
export function PhoneLink({
  phone,
  className,
  message,
  onSend,
}: {
  phone: string;
  className?: string;
  /** Opens WhatsApp with this already typed. */
  message?: string;
  /** Called as the WhatsApp chat opens — e.g. to record it as sent. */
  onSend?: () => void;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <a
        href={`tel:${phone}`}
        className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
        title="חיוג"
      >
        <Phone className="size-3.5 shrink-0 text-on-surface-variant" aria-hidden />
        <Ltr>{displayPhone(phone)}</Ltr>
      </a>
      <a
        href={whatsappHref(phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="שליחת הודעה בוואטסאפ"
        title="וואטסאפ"
        onClick={onSend}
        className="rounded-full p-0.5 text-status-success-fg hover:bg-surface-container"
      >
        <MessageCircle className="size-4" aria-hidden />
      </a>
    </span>
  );
}

/**
 * An address that opens a new message to it — in Gmail or in the computer's
 * mail program, as the business chose in the admin panel (Business.mail_client).
 * Gmail opens in a new tab, so the screen the person was working on stays.
 */
export function EmailLink({
  email,
  className,
  subject,
  body,
  onSend,
}: {
  email: string;
  className?: string;
  /** Opens a new message with these already written. */
  subject?: string;
  body?: string;
  /** Called as the message opens — e.g. to record it as sent. */
  onSend?: () => void;
}) {
  const client = useMailClient();
  return (
    <a
      href={emailHref(client, email, subject, body)}
      {...(client === "gmail" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn("inline-flex items-center gap-1 underline-offset-2 hover:underline", className)}
      title="שליחת מייל"
      onClick={onSend}
    >
      <Mail className="size-3.5 shrink-0 text-on-surface-variant" aria-hidden />
      <Ltr>{email}</Ltr>
    </a>
  );
}
