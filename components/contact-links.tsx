import { Mail, MessageCircle, Phone } from "lucide-react";
import { Ltr } from "@/components/ui/ltr";
import { cn } from "@/lib/utils";

/**
 * wa.me wants the international form without "+" or the trunk zero:
 * 0521234567 → 972521234567. Phones are stored normalised (lib/domain/customer.ts),
 * so a leading 0 is the only local form that reaches here.
 */
export function whatsappHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.startsWith("0") ? `972${digits.slice(1)}` : digits}`;
}

/**
 * A phone number that dials, with WhatsApp beside it.
 *
 * `tel:` hands the number to whatever the computer uses for calls. WhatsApp is
 * a separate link because a browser cannot know whether the app is installed:
 * wa.me opens the desktop app when it is, and WhatsApp Web when it is not.
 */
export function PhoneLink({ phone, className }: { phone: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <a
        href={`tel:${phone}`}
        className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
        title="חיוג"
      >
        <Phone className="size-3.5 shrink-0 text-on-surface-variant" aria-hidden />
        <Ltr>{phone}</Ltr>
      </a>
      <a
        href={whatsappHref(phone)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="שליחת הודעה בוואטסאפ"
        title="וואטסאפ"
        className="rounded-full p-0.5 text-status-success-fg hover:bg-surface-container"
      >
        <MessageCircle className="size-4" aria-hidden />
      </a>
    </span>
  );
}

/** An address that opens the mail program on a new message to it. */
export function EmailLink({ email, className }: { email: string; className?: string }) {
  return (
    <a
      href={`mailto:${email}`}
      className={cn("inline-flex items-center gap-1 underline-offset-2 hover:underline", className)}
      title="שליחת מייל"
    >
      <Mail className="size-3.5 shrink-0 text-on-surface-variant" aria-hidden />
      <Ltr>{email}</Ltr>
    </a>
  );
}
