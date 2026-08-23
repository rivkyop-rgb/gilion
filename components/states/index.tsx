import * as React from "react";
import Link from "next/link";
import { AlertTriangle, FileQuestion, Inbox, Lock, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The five shell states every screen needs (docs/plan/01-auth-multitenancy.md).
 * The existing Stitch designs show none of them, so they are defined once here
 * and reused, rather than improvised per screen.
 */

function Shell({
  icon,
  title,
  body,
  action,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-10 text-center">
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          tone === "error"
            ? "bg-status-error-bg text-status-error-fg"
            : "bg-surface-container text-on-surface-variant",
        )}
      >
        {icon}
      </div>
      <h2 className="font-serif text-xl font-semibold text-on-surface">{title}</h2>
      <p className="max-w-md text-sm text-on-surface-variant">{body}</p>
      {action}
    </div>
  );
}

/** Loading — a skeleton, not a spinner: it keeps the layout from jumping. */
export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="טוען">
      <div className="h-9 w-1/3 animate-pulse rounded-sm bg-surface-container" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-sm bg-surface-container-low" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return <Shell icon={<Inbox className="size-6" />} title={title} body={body} action={action} />;
}

export function ErrorState({ retry }: { retry?: () => void }) {
  return (
    <Shell
      tone="error"
      icon={<ServerCrash className="size-6" />}
      title="משהו השתבש"
      body="לא הצלחנו לטעון את הנתונים. אפשר לנסות שוב; אם זה חוזר, פנו למנהל המערכת."
      action={
        retry ? (
          <Button variant="secondary" onClick={retry}>
            נסי שוב
          </Button>
        ) : undefined
      }
    />
  );
}

/** 403 — the role is known and is not allowed here (FR-8). */
export function ForbiddenState() {
  return (
    <Shell
      tone="error"
      icon={<Lock className="size-6" />}
      title="אין לך הרשאה לעמוד הזה"
      body="התפקיד שלך במערכת לא כולל גישה לאזור הזה. אם לדעתך זו טעות, פנו למנהל."
      action={
        <Button variant="secondary" asChild>
          <Link href="/dashboard">חזרה ללוח הבקרה</Link>
        </Button>
      }
    />
  );
}

/**
 * 404 — also what a cross-tenant lookup returns. Deliberately not 403: a
 * "forbidden" would confirm that the record exists in another business.
 */
export function NotFoundState() {
  return (
    <Shell
      icon={<FileQuestion className="size-6" />}
      title="לא מצאנו את מה שחיפשת"
      body="ייתכן שהפריט נמחק, או שהקישור שגוי."
      action={
        <Button variant="secondary" asChild>
          <Link href="/dashboard">חזרה ללוח הבקרה</Link>
        </Button>
      }
    />
  );
}

export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      data-testid="form-error"
      className="flex items-center gap-2 rounded-sm bg-status-error-bg px-3 py-2 text-sm text-status-error-fg"
    >
      <AlertTriangle className="size-4 shrink-0" />
      {children}
    </p>
  );
}
