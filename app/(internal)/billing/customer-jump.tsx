"use client";

import { useRouter } from "next/navigation";

import { Combobox } from "@/components/ui/combobox";
import { formatMoney } from "@/lib/domain/format";

/**
 * "מעבר ללקוח" — any customer's billing page from the billing tab (08/11/2026:
 * "שיוכלו להגיע משם לכל לקוח ולא רק דרך מסך לקוח"). The list below it only
 * holds customers with money on the books; this reaches everybody, including
 * one whose payment arrives before their first order is approved.
 */
export function CustomerJump({
  customers,
}: {
  customers: Array<{ id: string; label: string; owes: number }>;
}) {
  const router = useRouter();
  return (
    <div className="w-64" data-testid="billing-customer-jump">
      <label className="sr-only" htmlFor="billing-jump">
        מעבר ללקוח
      </label>
      <Combobox
        id="billing-jump"
        name="jump"
        placeholder="מעבר ללקוח…"
        testId="billing-jump"
        options={customers.map((c) => ({
          value: c.id,
          label: c.label,
          hint: c.owes > 0 ? `פתוח ${formatMoney(c.owes)}` : undefined,
        }))}
        onChange={(id) => {
          if (id) router.push(`/billing/customers/${id}`);
        }}
      />
    </div>
  );
}
