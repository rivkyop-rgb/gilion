"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormActionState } from "@/components/use-form-action-state";
import { setPendingLines } from "./pending-lines";
import Link from "next/link";
import { AlertTriangle, Plus, Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { PRICE_ORIGIN_LABELS, priceDeviation, priceOrigin } from "@/lib/domain/order";
import {
  formatDays,
  hasSchedule,
  isPublicationDay,
  weekdayOf,
  WEEKDAY_LABELS,
} from "@/lib/domain/publication-days";
import {
  addOrderItemAction,
  priceSuggestionAction,
  removeOrderItemAction,
  type FormState,
} from "../actions";
import { groupOrderLines, timesLabel } from "@/lib/domain/order-grouping";
import { formatMoney } from "../format";
import { MultiDatePicker } from "./date-picker";
import { counted } from "@/lib/domain/hebrew-count";
import { NO_POSITION, type PositionRequest } from "@/lib/domain/position-request";
import { ItemPositionEditor, PositionFields } from "./position-fields";

export type PaperOption = {
  id: string;
  name: string;
  publicationDays: number[];
  pageTypes: Array<{
    id: string;
    name: string;
    /** The inner pages — the default for a new line (03/11/2026). */
    inner?: boolean;
    shapes: Array<{ id: string; name: string }>;
  }>;
};

export type ExistingLine = {
  id: string;
  newspaperId: string;
  newspaperName: string;
  pageTypeName: string;
  shapeName: string;
  publicationDate: string;
  isoDate: string;
  offSchedule: boolean;
  price: number;
  position: PositionRequest;
  positionLabel: string | null;
  /** False once the date is on a page — then the board moves it. */
  positionEditable: boolean;
};

/**
 * A newspaper can be ordered in only once it has a page type that allows at
 * least one shape — without that pair there is no valid line to build.
 */
const usable = (p: PaperOption) => p.pageTypes.some((pt) => pt.shapes.length > 0);

const selectClass =
  "h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm";

export function LineBuilder({
  orderId,
  papers,
  lines,
  editable,
  customerPreferredPage = null,
  canEditPositions = editable,
}: {
  orderId: string;
  papers: PaperOption[];
  lines: ExistingLine[];
  editable: boolean;
  /** Positions stay editable after approval, until the date is placed. */
  canEditPositions?: boolean;
  /** The customer's fixed page — the default for a new line, which may override it. */
  customerPreferredPage?: number | null;
}) {
  const bound = addOrderItemAction.bind(null, orderId);
  const [state, action, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    bound,
    {},
  );
  const [busy, startTransition] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  // The default is the first newspaper that can actually be ordered in, not
  // simply the first alphabetically. A half-configured newspaper — created but
  // with no page types yet — otherwise wins the sort and greets the user with
  // "this newspaper has nothing to choose", while a perfectly usable one sits
  // one row below in the same select.
  const [paperId, setPaperId] = useState(() => (papers.find(usable) ?? papers[0])?.id ?? "");
  const [pageTypeChoice, setPageTypeChoice] = useState("");
  const [shapeChoice, setShapeChoice] = useState("");
  const [price, setPrice] = useState("");
  const [suggested, setSuggested] = useState<number | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [specialEdition, setSpecialEdition] = useState(false);

  const paper = useMemo(() => papers.find((p) => p.id === paperId), [papers, paperId]);

  // The effective selection is derived during render rather than synced in an
  // effect: choosing a newspaper narrows the page types, and a page type
  // narrows the shapes to AllowedAdShape. Writing that back into state from an
  // effect only produced a second render pass saying the same thing.
  const pageType =
    paper?.pageTypes.find((pt) => pt.id === pageTypeChoice) ??
    paper?.pageTypes.find((pt) => pt.inner && pt.shapes.length > 0) ??
    paper?.pageTypes[0];
  const shape = pageType?.shapes.find((sh) => sh.id === shapeChoice) ?? pageType?.shapes[0];

  const pageTypeId = pageType?.id ?? "";
  const shapeId = shape?.id ?? "";

  const publicationDays = paper?.publicationDays ?? [];

  // Dates already on the order for THIS newspaper — the calendar strikes them
  // through, because two lines for the same paper on the same day is nearly
  // always a slip rather than a genuine double booking.
  const takenDates = useMemo(
    () => lines.filter((l) => l.newspaperId === paperId).map((l) => l.isoDate),
    [lines, paperId],
  );

  // The dates that fall outside the newspaper's print schedule. Not an error —
  // special editions exist — but they cost a deliberate tick.
  const offScheduleDates = useMemo(
    () => dates.filter((d) => !isPublicationDay(publicationDays, d)),
    [dates, publicationDays],
  );
  const needsAcknowledgement = offScheduleDates.length > 0 && !specialEdition;

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

  // A successful submit clears the picker, or the next click would silently
  // re-add the same dates on top of the ones just created.
  //
  // Adjusted during render rather than in an effect: the action result is the
  // trigger, and an effect would render the stale selection once before
  // wiping it — a visible flash of dates that no longer exist as a selection.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) {
      setDates([]);
      setSpecialEdition(false);
    }
  }

  // Told to the action bar, so it can refuse to send an order while dates
  // sit in the picker un-added (pending-lines.ts).
  useEffect(() => {
    setPendingLines(dates.length);
    return () => setPendingLines(0);
  }, [dates.length]);

  const groups = groupOrderLines(lines);

  const origin = priceOrigin(price.trim() === "" ? null : Number(price), suggested);
  const unitPrice = price.trim() === "" ? suggested : Number(price);
  const deviation = priceDeviation(price.trim() === "" ? null : Number(price), suggested);
  const previewTotal = unitPrice === null ? null : unitPrice * dates.length;

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-serif text-xl font-semibold">שורות ההזמנה</h2>

      {lines.length === 0 ? (
        <p className="mb-4 rounded-lg border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
          עוד לא נוספו שורות. בוחרים למטה עיתון, סוג עמוד, צורה ותאריכים, ולוחצים &quot;הוספה
          להזמנה&quot;. כל תאריך יהפוך לפרסום אחד באישור ההזמנה.
        </p>
      ) : (
        <>
          <div className="mb-4 overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
            {/*
            One row per THING ORDERED, not per date. Nobody orders "a full page
            on the 1st" and then "a full page on the 8th" — they order a full
            page five times, and fifteen near-identical rows is a table you scan
            instead of read. The dates are still there, one click away, and the
            per-date view with its statuses is the publications list.
          */}
            <table className="w-full text-sm" data-testid="order-lines">
              <thead className="bg-surface-container">
                <tr>
                  <th className="p-3 text-start font-semibold">עיתון</th>
                  <th className="p-3 text-start font-semibold">סוג עמוד</th>
                  <th className="p-3 text-start font-semibold">צורת פרסום</th>
                  <th className="p-3 text-start font-semibold">כמה פעמים</th>
                  <th className="p-3 text-start font-semibold">מחיר ליחידה</th>
                  <th className="p-3 text-start font-semibold">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr
                    key={g.key}
                    data-testid={`order-line-group-${g.key}`}
                    className="border-t border-outline-variant align-top"
                  >
                    <td className="p-3">{g.newspaperName}</td>
                    <td className="p-3">
                      {g.pageTypeName}
                      {g.positionLabel ? (
                        <span
                          className="block text-xs text-on-surface-variant"
                          data-testid="line-position-label"
                        >
                          {g.positionLabel}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3">{g.shapeName}</td>
                    <td className="p-3">
                      {/* Short lists cost nothing to show, and a long one is the
                        whole reason the row was grouped in the first place. */}
                      <details open={g.times <= 3}>
                        <summary className="cursor-pointer select-none">
                          {timesLabel(g.times)}
                          {g.hasOffSchedule ? (
                            <span
                              className="ms-2 rounded-full bg-status-warning-bg px-2 py-0.5 text-[11px] text-status-warning-fg"
                              title="לפחות תאריך אחד אינו יום הדפסה של העיתון"
                            >
                              מהדורה מיוחדת
                            </span>
                          ) : null}
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {g.lines.map((l) => (
                            <li
                              key={l.id}
                              data-testid={`order-line-${l.id}`}
                              className="flex items-center gap-2 text-xs"
                            >
                              <Ltr>{l.publicationDate}</Ltr>
                              {l.offSchedule ? (
                                <span className="text-status-warning-fg">מיוחדת</span>
                              ) : null}
                              {/* Each date can ask for its own place (03/11/2026). */}
                              {l.positionEditable && canEditPositions ? (
                                <ItemPositionEditor
                                  orderId={orderId}
                                  itemId={l.id}
                                  initial={l.position}
                                />
                              ) : null}
                              {editable ? (
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
                                  <span className="sr-only">הסרת התאריך</span>
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    <td className="p-3">
                      <Ltr>{formatMoney(g.unitPrice)}</Ltr>
                    </td>
                    <td className="p-3 font-medium">
                      <Ltr>{formatMoney(g.subtotal)}</Ltr>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* A stable count of the DATES behind the groups: the number of
            publications this order will create, which the grouped rows no
            longer state directly. */}
          <p className="mb-4 text-xs text-on-surface-variant" data-testid="order-line-count">
            {counted(lines.length, "תאריך אחד", "תאריכים")} ·{" "}
            {counted(groups.length, "שורת הזמנה אחת", "שורות הזמנה")}
          </p>
        </>
      )}

      {removeError ? <InlineError>{removeError}</InlineError> : null}

      {/*
        Three ways the builder can have nothing to offer, and all three used to
        render an enabled-looking form with a dead button. Each one now says
        what is missing and links straight to the screen that fixes it.
      */}
      {editable && papers.length === 0 ? (
        <MissingSetup
          body="עדיין לא הוגדר אף עיתון, ולכן אין מה להזמין בו. הזמנה מתחילה בעיתון, סוג עמוד וצורת פרסום."
          href="/settings/newspapers/new"
          cta="הגדרת עיתון"
        />
      ) : null}

      {editable && paper && paper.pageTypes.length === 0 ? (
        <MissingSetup
          body={`לעיתון "${paper.name}" עדיין לא הוגדרו סוגי עמודים, ולכן אין מה לבחור. יש להגדיר אותם בהגדרות העיתון — ואז גם לקבוע אילו צורות פרסום מותרות בכל סוג עמוד.`}
          href={`/settings/newspapers/${paper.id}`}
          cta="הגדרות העיתון"
        />
      ) : null}

      {editable && pageType && pageType.shapes.length === 0 ? (
        <MissingSetup
          body={`לסוג העמוד "${pageType.name}" לא הוגדרו צורות פרסום מותרות, ולכן אי אפשר להוסיף שורה. יש לסמן אותן בהגדרות העיתון.`}
          href={`/settings/newspapers/${paper?.id ?? ""}`}
          cta="הגדרות העיתון"
        />
      ) : null}

      {editable && papers.length > 0 ? (
        <form
          action={action}
          onReset={keepTypedOnError}
          className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4"
        >
          <h3 className="mb-1 font-semibold">הוספת פרסום להזמנה</h3>
          <p className="mb-4 text-xs text-on-surface-variant">
            1. עיתון, סוג עמוד וצורה · 2. תאריכים · 3. &quot;הוספה להזמנה&quot; בתחתית. אפשר לחזור
            על זה כמה פעמים שצריך, ורק אחר כך לשלוח את ההזמנה.
          </p>
          {/* One line per chosen date, all submitted together. */}
          {dates.map((d) => (
            <input key={d} type="hidden" name="dates" value={d} />
          ))}
          <input type="hidden" name="offSchedule" value={specialEdition ? "1" : ""} />

          <div className="mb-4 grid gap-3 sm:grid-cols-5">
            <div>
              <Label htmlFor="newspaperId">עיתון</Label>
              <select
                id="newspaperId"
                name="newspaperId"
                data-testid="line-newspaper"
                className={selectClass}
                value={paperId}
                onChange={(e) => {
                  setPaperId(e.target.value);
                  // A different newspaper has different print days, so the
                  // acknowledgement no longer refers to the set that was
                  // acknowledged. Reset it here, where the change happens.
                  setSpecialEdition(false);
                }}
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
              <Label htmlFor="price">מחיר לפרסום</Label>
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
                {deviation ? (
                  <span
                    data-testid="price-deviation"
                    className={deviation.below ? "text-status-warning-fg" : undefined}
                  >
                    {" · "}
                    {deviation.below ? "הנחה של " : "תוספת של "}
                    <Ltr>{formatMoney(deviation.amount)}</Ltr> (<Ltr>{`${deviation.percent}%`}</Ltr>){" "}
                    {deviation.below ? "מהמחירון" : "מעל המחירון"} <Ltr>{formatMoney(suggested!)}</Ltr>
                  </span>
                ) : null}
              </p>
            </div>

          </div>

          <PositionFields
            initial={
              customerPreferredPage
                ? { ...NO_POSITION, kind: "page", page: customerPreferredPage }
                : NO_POSITION
            }
            errors={state.errors}
          />
          {customerPreferredPage ? (
            <p className="-mt-2 text-[11px] text-on-surface-variant">
              העמוד הקבוע של הלקוח הוא {customerPreferredPage}. מה שנבחר כאן גובר.
            </p>
          ) : null}

          {shapeId ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>תאריכי פרסום</Label>
                <MultiDatePicker
                  selected={dates}
                  onChange={setDates}
                  publicationDays={publicationDays}
                  newspaperName={paper?.name ?? ""}
                  takenDates={takenDates}
                />
              </div>

              <div className="flex flex-col">
                <Label htmlFor="publicationDate">הוספת תאריך ידנית</Label>
                {/* Typing a known date beats hunting for it in the calendar, and
                  it is the only way to reach a date months out in one action. */}
                <Input
                  id="publicationDate"
                  name="publicationDate"
                  type="date"
                  dir="ltr"
                  data-testid="line-date"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value) setDates((prev) => [...new Set([...prev, value])].sort());
                  }}
                />

                <p className="mt-3 mb-1 text-xs font-medium text-on-surface-variant">
                  {dates.length === 0
                    ? "עוד לא נבחרו תאריכים"
                    : dates.length === 1
                      ? "נבחר תאריך אחד"
                      : `נבחרו ${dates.length} תאריכים`}
                </p>
                <div
                  className="min-h-24 grow content-start rounded-lg border border-outline-variant bg-surface-container-low p-2"
                  data-testid="chosen-dates"
                >
                  {!shapeId ? (
                    <span className="ms-3 text-xs text-on-surface-variant">
                      יש להשלים את הגדרות העיתון קודם
                    </span>
                  ) : dates.length === 0 ? (
                    <p className="p-2 text-xs text-on-surface-variant">
                      סמני תאריכים בלוח. כל תאריך יהפוך לשורה נפרדת בהזמנה.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {dates.map((d) => {
                        const weekday = weekdayOf(d);
                        const off = !isPublicationDay(publicationDays, d);
                        return (
                          <span
                            key={d}
                            data-testid={`chosen-${d}`}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                              off
                                ? "bg-status-warning-bg text-status-warning-fg"
                                : "bg-status-info-bg text-status-info-fg"
                            }`}
                          >
                            <Ltr>{d}</Ltr>
                            {weekday === null ? null : <span>· {WEEKDAY_LABELS[weekday]}</span>}
                            <button
                              type="button"
                              aria-label={`הסרת ${d}`}
                              onClick={() => setDates((prev) => prev.filter((x) => x !== d))}
                              className="rounded-full hover:bg-black/10"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {previewTotal !== null && dates.length > 0 ? (
                  <p className="mt-2 text-sm" data-testid="lines-preview-total">
                    {counted(dates.length, "תאריך אחד", "תאריכים")} ×{" "}
                    <Ltr>{formatMoney(unitPrice ?? 0)}</Ltr> ={" "}
                    <strong>
                      <Ltr>{formatMoney(previewTotal)}</Ltr>
                    </strong>
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {offScheduleDates.length > 0 ? (
            <div
              className="mt-4 rounded-lg border border-status-warning-fg/30 bg-status-warning-bg p-3 text-sm text-status-warning-fg"
              data-testid="off-schedule-warning"
            >
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {offScheduleDates.length} מהתאריכים שנבחרו אינם ימי הדפסה של &quot;{paper?.name}
                  &quot;
                  {hasSchedule(publicationDays) ? ` (${formatDays(publicationDays)})` : ""}:{" "}
                  <Ltr>{offScheduleDates.join(", ")}</Ltr>
                </span>
              </p>
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={specialEdition}
                  onChange={(e) => setSpecialEdition(e.target.checked)}
                  data-testid="confirm-special-edition"
                  className="size-4"
                />
                כן, אלה מהדורות מיוחדות — להמשיך בכל זאת
              </label>
            </div>
          ) : null}

          <div className="mt-4">
            {state.errors
              ? Object.values(state.errors).map((m) => <InlineError key={m}>{m}</InlineError>)
              : null}
            {state.message ? <InlineError>{state.message}</InlineError> : null}
            <Button
              type="submit"
              disabled={pending || !shapeId || dates.length === 0 || needsAcknowledgement}
              data-testid="add-line"
            >
              <Plus className="size-4" />
              {dates.length > 1 ? `הוספה להזמנה · ${dates.length} תאריכים` : "הוספה להזמנה"}
            </Button>
            {dates.length === 0 ? (
              <span className="ms-3 text-xs text-on-surface-variant">יש לבחור לפחות תאריך אחד</span>
            ) : needsAcknowledgement ? (
              <span className="ms-3 text-xs text-status-warning-fg">
                יש לאשר את התאריכים שאינם ימי הדפסה
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

/** A dead form is worse than no form: say what is missing and link to it. */
function MissingSetup({ body, href, cta }: { body: string; href: string; cta: string }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-status-warning-bg p-4 text-sm text-status-warning-fg">
      <p className="mb-3">{body}</p>
      <Button asChild size="sm" variant="secondary">
        <Link href={href}>
          <Settings className="size-4" />
          {cta}
        </Link>
      </Button>
    </div>
  );
}
