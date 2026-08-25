"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { PRICE_ORIGIN_LABELS, priceOrigin } from "@/lib/domain/order";
import {
  addOrderItemAction,
  priceSuggestionAction,
  removeOrderItemAction,
  type FormState,
} from "../actions";
import { formatMoney } from "../format";

export type PaperOption = {
  id: string;
  name: string;
  pageTypes: Array<{ id: string; name: string; shapes: Array<{ id: string; name: string }> }>;
};

export type ExistingLine = {
  id: string;
  newspaperName: string;
  pageTypeName: string;
  shapeName: string;
  publicationDate: string;
  price: number;
};

const selectClass =
  "h-10 w-full rounded-sm border border-outline-variant bg-surface-container px-3 text-start text-sm";

export function LineBuilder({
  orderId,
  papers,
  lines,
  editable,
}: {
  orderId: string;
  papers: PaperOption[];
  lines: ExistingLine[];
  editable: boolean;
}) {
  const bound = addOrderItemAction.bind(null, orderId);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, {});
  const [busy, startTransition] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [paperId, setPaperId] = useState(papers[0]?.id ?? "");
  const [pageTypeChoice, setPageTypeChoice] = useState("");
  const [shapeChoice, setShapeChoice] = useState("");
  const [price, setPrice] = useState("");
  const [suggested, setSuggested] = useState<number | null>(null);

  const paper = useMemo(() => papers.find((p) => p.id === paperId), [papers, paperId]);

  // The effective selection is derived during render rather than synced in an
  // effect: choosing a newspaper narrows the page types, and a page type
  // narrows the shapes to AllowedAdShape. Writing that back into state from an
  // effect only produced a second render pass saying the same thing.
  const pageType = paper?.pageTypes.find((pt) => pt.id === pageTypeChoice) ?? paper?.pageTypes[0];
  const shape = pageType?.shapes.find((sh) => sh.id === shapeChoice) ?? pageType?.shapes[0];

  const pageTypeId = pageType?.id ?? "";
  const shapeId = shape?.id ?? "";

  // The base price follows the combination; typing over it is allowed.
  //
  // The guard is what keeps that promise. Fetching a suggestion is an async
  // round trip, and without it a price typed while the request was in flight
  // would be silently replaced when it landed — the user's number quietly
  // becoming someone else's. A keystroke wins until the combination changes.
  const typedPrice = useRef(false);

  useEffect(() => {
    if (!paperId || !pageTypeId || !shapeId) return;
    let cancelled = false;
    typedPrice.current = false;
    void priceSuggestionAction(paperId, pageTypeId, shapeId).then((value) => {
      if (cancelled) return;
      // The base price is always recorded — the guard protects the *field*, not
      // the knowledge of what the list says. Without this the label could not
      // tell "typed over the base price" from "no base price at all".
      setSuggested(value);
      if (!typedPrice.current) setPrice(value === null ? "" : String(value));
    });
    return () => {
      cancelled = true;
    };
  }, [paperId, pageTypeId, shapeId]);

  const origin = priceOrigin(price.trim() === "" ? null : Number(price), suggested);

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-serif text-xl font-semibold">שורות ההזמנה</h2>

      {lines.length === 0 ? (
        <p className="mb-4 rounded-lg border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
          עוד לא נוספו שורות. כל שורה תהפוך לפרסום אחד באישור ההזמנה.
        </p>
      ) : (
        <div className="mb-4 overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-sm" data-testid="order-lines">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">עיתון</th>
                <th className="p-3 text-start font-semibold">סוג עמוד</th>
                <th className="p-3 text-start font-semibold">צורת פרסום</th>
                <th className="p-3 text-start font-semibold">תאריך</th>
                <th className="p-3 text-start font-semibold">מחיר</th>
                {editable ? <th className="p-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-outline-variant">
                  <td className="p-3">{l.newspaperName}</td>
                  <td className="p-3">{l.pageTypeName}</td>
                  <td className="p-3">{l.shapeName}</td>
                  <td className="p-3">
                    <Ltr>{l.publicationDate}</Ltr>
                  </td>
                  <td className="p-3">
                    <Ltr>{formatMoney(l.price)}</Ltr>
                  </td>
                  {editable ? (
                    <td className="p-3 text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        data-testid={`remove-line-${l.id}`}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await removeOrderItemAction(orderId, l.id);
                            setRemoveError(res.message ?? null);
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {removeError ? <InlineError>{removeError}</InlineError> : null}

      {editable ? (
        <form
          action={action}
          className="grid gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 sm:grid-cols-5"
        >
          <div>
            <Label htmlFor="newspaperId">עיתון</Label>
            <select
              id="newspaperId"
              name="newspaperId"
              data-testid="line-newspaper"
              className={selectClass}
              value={paperId}
              onChange={(e) => setPaperId(e.target.value)}
            >
              {papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="pageTypeId">סוג עמוד</Label>
            <select
              id="pageTypeId"
              name="pageTypeId"
              data-testid="line-page-type"
              className={selectClass}
              value={pageTypeId}
              onChange={(e) => setPageTypeChoice(e.target.value)}
            >
              {paper?.pageTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="adShapeId">צורת פרסום</Label>
            <select
              id="adShapeId"
              name="adShapeId"
              data-testid="line-shape"
              className={selectClass}
              value={shapeId}
              onChange={(e) => setShapeChoice(e.target.value)}
            >
              {pageType?.shapes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="publicationDate">תאריך פרסום</Label>
            <Input
              id="publicationDate"
              name="publicationDate"
              type="date"
              dir="ltr"
              data-testid="line-date"
              required
            />
          </div>

          <div>
            <Label htmlFor="price">מחיר</Label>
            <Input
              id="price"
              name="price"
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              data-testid="line-price"
              value={price}
              onChange={(e) => {
                typedPrice.current = true;
                setPrice(e.target.value);
              }}
              placeholder={suggested === null ? "אין מחיר בסיסי" : undefined}
            />
            <p className="mt-1 text-[11px] text-on-surface-variant" data-testid="price-origin">
              {PRICE_ORIGIN_LABELS[origin]}
            </p>
          </div>

          <div className="sm:col-span-5">
            {state.errors
              ? Object.values(state.errors).map((m) => <InlineError key={m}>{m}</InlineError>)
              : null}
            {state.message ? <InlineError>{state.message}</InlineError> : null}
            <Button type="submit" variant="secondary" disabled={pending} data-testid="add-line">
              <Plus className="size-4" />
              הוספת שורה
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
