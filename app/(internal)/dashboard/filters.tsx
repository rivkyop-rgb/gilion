"use client";

import { useRouter } from "next/navigation";
import { Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";

export type FilterOption = { id: string; name: string };

export type DashboardFilterValues = {
  newspaper: string;
  customer: string;
  status: string;
  from: string;
  to: string;
  /** Every date — the dates are lifted, not merely widened. */
  all?: boolean;
};

/**
 * The four filters US-001 AC-4 requires — newspaper, date, customer, status.
 *
 * The URL stays the whole state, exactly as on every other list in the product:
 * a reload, a shared link and a Playwright run all land on the same rows. What
 * this component changes is only HOW the URL is reached. A native GET `<form>`
 * is a full document load and an App Router `<Link>` scrolls to the top by
 * default, and on a dashboard whose table sits below six cards and two widgets
 * that means every filter change throws the reader back to the top of the page.
 * `router.push(..., { scroll: false })` keeps them where they were.
 *
 * Every field is UNCONTROLLED and re-keyed on its current value. A controlled
 * field can hold a value React does not know about — permanently — when
 * anything writes to the DOM before hydration: a browser restoring the form on
 * a back-navigation, autofill, or a test typing fast. React seeds its value
 * tracker FROM that element, so the tracker and the DOM agree while the state
 * does not, no further `input` event ever fires, and the two never reconcile.
 * On a date field that is a page arguing with itself with nothing on screen to
 * explain it. Reading the values from `FormData` on submit avoids the whole
 * class of problem: there is no second copy of the value to disagree with.
 */
export function DashboardFilters({
  values,
  newspapers,
  customers,
  statuses,
  baseHref,
  dirty,
  thisWeek,
}: {
  values: DashboardFilterValues;
  newspapers: FilterOption[];
  customers: FilterOption[];
  statuses: Array<{ value: string; label: string }>;
  /** The page's URL without any of these five parameters. */
  baseHref: string;
  /** This week's yyyy-MM-dd bounds — to know when "השבוע" is not showing. */
  thisWeek: { from: string; to: string };
  /**
   * Whether the reader actually narrowed anything.
   *
   * Decided by the PAGE and not here, because the two date fields arrive
   * filled on a completely untouched screen — the dashboard opens on this
   * week, which is the question it exists to answer. Inferring "dirty" from
   * the values would offer "ניקוי" to somebody who has not filtered yet, and
   * a reset that resets nothing teaches people to distrust the control.
   */
  dirty: boolean;
}) {
  const router = useRouter();

  const go = (next: Partial<DashboardFilterValues>) => {
    const merged = { ...values, ...next };
    const url = new URL(baseHref, "http://x");
    // A default is left out, so a URL that changed nothing stays clean and
    // "ניקוי" really does return to the bare address.
    if (merged.newspaper && merged.newspaper !== "all")
      url.searchParams.set("newspaper", merged.newspaper);
    if (merged.customer && merged.customer !== "all")
      url.searchParams.set("customer", merged.customer);
    if (merged.status && merged.status !== "all") url.searchParams.set("status", merged.status);
    if (merged.all) url.searchParams.set("all", "1");
    else {
      if (merged.from) url.searchParams.set("from", merged.from);
      if (merged.to) url.searchParams.set("to", merged.to);
    }
    router.push(`${url.pathname}${url.search}`, { scroll: false });
  };

  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3"
      data-testid="dashboard-filters"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const read = (name: string) => String(data.get(name) ?? "").trim();
        go({
          newspaper: read("newspaper") || "all",
          customer: read("customer") || "all",
          status: read("status") || "all",
          from: read("from"),
          to: read("to"),
          // Both dates cleared is "no dates" — everything — not "this week".
          all: !read("from") && !read("to"),
        });
      }}
    >
      <Field label="עיתון" htmlFor="newspaper">
        <select
          key={values.newspaper}
          id="newspaper"
          name="newspaper"
          defaultValue={values.newspaper}
          data-testid="filter-newspaper"
          className="h-10 rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
        >
          <option value="all">כל העיתונים</option>
          {newspapers.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="לקוח" htmlFor="customer">
        {/* Re-keyed like its neighbours; "" is "all" — `onSubmit` maps it. */}
        <div className="w-56">
          <Combobox
            key={values.customer}
            id="customer"
            name="customer"
            testId="filter-customer"
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
            defaultValue={values.customer === "all" ? "" : values.customer}
            placeholder="כל הלקוחות"
            emptyText="אין לקוח בשם הזה"
          />
        </div>
      </Field>

      <Field label="סטטוס" htmlFor="status">
        <select
          key={values.status}
          id="status"
          name="status"
          defaultValue={values.status}
          data-testid="filter-status"
          className="h-10 rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
        >
          <option value="all">כל הסטטוסים</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="מתאריך" htmlFor="from">
        <Input
          key={values.from}
          id="from"
          name="from"
          type="date"
          dir="ltr"
          defaultValue={values.from}
          data-testid="filter-from"
          className="w-40"
        />
      </Field>

      <Field label="עד תאריך" htmlFor="to">
        <Input
          key={values.to}
          id="to"
          name="to"
          type="date"
          dir="ltr"
          defaultValue={values.to}
          data-testid="filter-to"
          className="w-40"
        />
      </Field>

      <Button type="submit" variant="secondary" data-testid="apply-filters">
        <Filter className="size-4" />
        סינון
      </Button>

      {/* The two ranges asked for most, one click each. "השבוע" is the bare
          dashboard's own range, so it clears the dates rather than typing
          this week's into them. */}
      <Button
        type="button"
        variant={values.all ? "primary" : "ghost"}
        data-testid="dates-all"
        aria-pressed={values.all}
        onClick={() => go({ all: true, from: "", to: "" })}
      >
        כל התאריכים
      </Button>
      {values.all || values.from !== thisWeek.from || values.to !== thisWeek.to ? (
        <Button
          type="button"
          variant="ghost"
          data-testid="dates-this-week"
          onClick={() => go({ all: false, from: "", to: "" })}
        >
          השבוע
        </Button>
      ) : null}

      {dirty ? (
        <Button
          type="button"
          variant="ghost"
          data-testid="clear-filters"
          onClick={() =>
            go({ newspaper: "all", customer: "all", status: "all", from: "", to: "", all: false })
          }
        >
          <X className="size-4" />
          ניקוי
        </Button>
      ) : null}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-on-surface-variant" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}
