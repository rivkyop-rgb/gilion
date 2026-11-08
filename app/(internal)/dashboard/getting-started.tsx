import Link from "next/link";
import { Check, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

type Progress = {
  firstNewspaperId: string | null;
  newspaper: boolean;
  pricing: boolean;
  customer: boolean;
  order: boolean;
};

/**
 * "להתחיל לעבוד" — the first-run checklist (08/11/2026).
 *
 * Shown only while something is missing, and always in the order the work
 * depends on: an order needs a customer and a price, a price needs a newspaper.
 * The next step is the only one with a button, so the card says where to go
 * instead of listing four equal options.
 */
export function GettingStarted({ progress }: { progress: Progress }) {
  const pricingHref = progress.firstNewspaperId
    ? `/settings/newspapers/${progress.firstNewspaperId}/pricing`
    : "/settings/newspapers";
  const steps = [
    {
      key: "newspaper",
      done: progress.newspaper,
      title: "פתיחת עיתון",
      body: "שם, גודל עמוד, עמודות ושורות. ממנו נגזרים כל הגדלים שנמכרים.",
      href: "/settings/newspapers/new",
      cta: "פתיחת עיתון",
    },
    {
      key: "pricing",
      done: progress.pricing,
      title: "מחירון",
      body: "מחיר לכל גודל ולכל סוג עמוד. בלי מחיר, הזמנה לא יודעת כמה לגבות.",
      href: pricingHref,
      cta: "למחירון",
    },
    {
      key: "customer",
      done: progress.customer,
      title: "לקוח ראשון",
      body: "אפשר גם לייבא רשימה קיימת מ־Excel.",
      href: "/customers/new",
      cta: "הוספת לקוח",
    },
    {
      key: "order",
      done: progress.order,
      title: "הזמנה ראשונה",
      body: "מהזמנה נוצרים הפרסומים, ומהם הגיליון ולוח השיבוץ.",
      href: "/orders/new",
      cta: "הזמנה חדשה",
    },
  ];
  if (steps.every((s) => s.done)) return null;
  const next = steps.find((s) => !s.done)!;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section
      data-testid="getting-started"
      className="mb-6 rounded-xl border border-brand-gold/40 bg-surface-container-lowest p-5 shadow-elevation-1"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">להתחיל לעבוד</h2>
        <span className="text-sm text-on-surface-variant">
          <span className="ltr-isolate">{doneCount}</span> מתוך{" "}
          <span className="ltr-isolate">{steps.length}</span> שלבים
        </span>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => {
          const isNext = s.key === next.key;
          return (
            <li
              key={s.key}
              data-testid={`setup-${s.key}`}
              data-done={s.done ? "true" : "false"}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-3",
                isNext ? "border-primary bg-primary-container/20" : "border-outline-variant",
                s.done && "opacity-70",
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                {s.done ? (
                  <Check className="size-4 text-status-success-fg" aria-label="בוצע" />
                ) : (
                  <Circle className="size-4 text-on-surface-variant" aria-hidden />
                )}
                <span className="ltr-isolate">{i + 1}.</span> {s.title}
              </span>
              <span className="text-xs text-on-surface-variant">{s.body}</span>
              {isNext ? (
                <Link
                  href={s.href}
                  className="mt-1 self-start rounded-lg bg-primary px-3 py-1.5 text-sm text-on-primary hover:opacity-90"
                  data-testid={`setup-go-${s.key}`}
                >
                  {s.cta}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
