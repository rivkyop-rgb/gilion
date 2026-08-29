"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Ltr } from "@/components/ui/ltr";
import { deleteCustomerAction } from "../actions";

/**
 * Deleting a customer.
 *
 * Offered only where it is honest — a customer with orders behind them cannot
 * be removed without taking that history with them, so the button is absent
 * there and the reason is shown in its place rather than hidden behind a
 * click that would fail.
 */
export function DeleteCustomer({
  id,
  name,
  phone,
  email,
  blocked,
}: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  blocked: string | null;
}) {
  if (blocked) {
    return (
      <p className="max-w-md text-xs text-on-surface-variant" data-testid="delete-blocked">
        {blocked}
      </p>
    );
  }

  return (
    <ConfirmDialog
      testId="delete-customer-dialog"
      trigger={
        <Button variant="ghost" data-testid="delete-customer">
          <Trash2 className="size-4" />
          מחיקת הלקוח
        </Button>
      }
      title={`למחוק את ${name}?`}
      body={
        <>
          <p className="mb-2">
            הלקוח יימחק לצמיתות, יחד עם פרטי הקשר שלו
            {phone ? (
              <>
                {" — "}
                <Ltr>{phone}</Ltr>
              </>
            ) : null}
            {email ? (
              <>
                {phone ? ", " : " — "}
                <Ltr>{email}</Ltr>
              </>
            ) : null}
            . <strong>אי אפשר לשחזר.</strong>
          </p>
          <p>אין לו הזמנות, פרסומים או משתמשי פורטל, ולכן לא תיפגע שום היסטוריה.</p>
        </>
      }
      confirmLabel="מחיקה לצמיתות"
      pendingLabel="מוחקת…"
      onConfirm={() => deleteCustomerAction(id)}
    />
  );
}
