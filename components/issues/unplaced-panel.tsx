"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, ImageOff, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { AdPreviewDialog, fileHref } from "@/components/ads/ad-preview";
import { AD_ACCEPT_ATTRIBUTE } from "@/lib/domain/ad-file";
import { sizeLabel, type ShapeSpec } from "@/lib/domain/placement";
import type { DerivedGrid } from "@/lib/domain/grid";
import type { CanvasPlacement } from "./page-canvas";
import { uploadAdvertisementAction } from "@/app/(internal)/advertisements/actions";
import { boardPriceAction, createBoardSaleAction } from "@/app/(internal)/issues/actions";
import { cn } from "@/lib/utils";

export type BoardCandidate = {
  publicationId: string;
  customerName: string;
  shape: ShapeSpec;
  previewUrl: string | null;
  adName: string | null;
  /** Already on a page in this issue. Hidden unless the toggle is on. */
  alreadyPlaced: boolean;
  /** Set when the publication cannot be placed at all — it is not draggable. */
  blockedReason: string | null;
  /** True when the publication has no artwork yet, so uploading is offered. */
  needsArtwork: boolean;
};

export type CustomerOption = { id: string; label: string; hint?: string };

export type OpenPage = {
  id: string;
  label: string;
  pageTypeId: string;
  allowedShapes: ShapeSpec[];
};

/**
 * The start panel: what still has to go somewhere, and how to get it there.
 *
 * ── Why uploading lives here at all ──────────────────────────────────────────
 * The common shape of the day is a designer opening the issue, seeing four
 * publications with no artwork, and finding three of the files in their email.
 * Sending them to the ad library, uploading, choosing the customer, choosing
 * the publication and coming back is five screens for a file that has exactly
 * one place it can go — and the publication already knows the customer and the
 * newspaper, so four of those five answers are not questions.
 *
 * The other half is the one that pays: somebody can SEE that the foot of the
 * open page is empty, and somebody walks in with an ad. That sale used to mean
 * leaving to create a customer, an order and an approval before the file had
 * anywhere to live. Here it is one dialog.
 *
 * Both paths end in stage 05's own upload action, which is what enforces the
 * format, this newspaper's size ceiling (FR-21) and the link. Nothing about
 * those rules is re-implemented.
 */
export function UnplacedPanel({
  issueId,
  candidates,
  placements,
  pageLabelOf,
  customers,
  openPages,
  grid,
  editable,
  isAdmin,
  holdingPublicationId,
  onPick,
  onPressStart,
  onJumpToPlacement,
}: {
  issueId: string;
  candidates: BoardCandidate[];
  /** Everything already on a page, for the second tab. */
  placements: CanvasPlacement[];
  pageLabelOf: (pageId: string) => string;
  customers: CustomerOption[];
  /** The pages currently on screen — what a new sale is sold INTO. */
  openPages: OpenPage[];
  grid: DerivedGrid;
  editable: boolean;
  isAdmin: boolean;
  holdingPublicationId: string | null;
  onPick: (item: BoardCandidate) => void;
  onPressStart: () => void;
  onJumpToPlacement: (placement: CanvasPlacement) => void;
}) {
  const [tab, setTab] = useState<"unplaced" | "placed">("unplaced");
  const [showPlaced, setShowPlaced] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFor, setUploadFor] = useState<BoardCandidate | null>(null);

  const unplaced = candidates.filter((c) => !c.alreadyPlaced);
  const visible = showPlaced ? candidates : unplaced;
  const missingArtwork = unplaced.filter((c) => c.needsArtwork);

  return (
    <section
      aria-label="פרסומים שלא שובצו"
      className="flex max-h-full min-h-0 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3"
    >
      {/* Two tabs, because the panel answers two different questions: what is
          left to do, and what has already been done. The second one used to be
          unanswerable without walking every spread and clicking every ad. */}
      <div
        role="tablist"
        aria-label="פרסומים בגיליון"
        className="mb-2 flex gap-1 rounded-lg border border-outline-variant bg-surface-container p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "unplaced"}
          data-testid="tab-unplaced"
          onClick={() => setTab("unplaced")}
          className={cn(
            "flex-1 rounded-sm px-2 py-1.5 text-sm font-medium transition-colors",
            tab === "unplaced"
              ? "bg-surface-container-lowest text-on-surface shadow-elevation-1 ring-1 ring-outline-variant"
              : "text-on-surface-variant hover:text-on-surface",
          )}
        >
          לא שובצו <span data-testid="unplaced-count">({unplaced.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "placed"}
          data-testid="tab-placed"
          onClick={() => setTab("placed")}
          className={cn(
            "flex-1 rounded-sm px-2 py-1.5 text-sm font-medium transition-colors",
            tab === "placed"
              ? "bg-surface-container-lowest text-on-surface shadow-elevation-1 ring-1 ring-outline-variant"
              : "text-on-surface-variant hover:text-on-surface",
          )}
        >
          שובצו <span data-testid="placed-count">({placements.length})</span>
        </button>
      </div>

      {tab === "placed" ? (
        <PlacedList
          placements={placements}
          pageLabelOf={pageLabelOf}
          grid={grid}
          onJump={onJumpToPlacement}
        />
      ) : (
        <>
          {editable ? (
            <Button
              size="sm"
              variant="secondary"
              className="mb-2"
              data-testid="upload-new-ad"
              onClick={() => {
                setUploadFor(null);
                setUploadOpen(true);
              }}
            >
              <CloudUpload className="size-4" />
              העלאת מודעה מהמחשב
            </Button>
          ) : null}

          {isAdmin ? (
            <label className="mb-2 flex items-center gap-2 text-xs text-on-surface-variant">
              <input
                type="checkbox"
                data-testid="show-placed"
                checked={showPlaced}
                onChange={(e) => setShowPlaced(e.target.checked)}
              />
              הצג גם פרסומים ששובצו
            </label>
          ) : null}

          {visible.length === 0 ? (
            <p className="text-sm text-on-surface-variant">כל הפרסומים של התאריך הזה שובצו.</p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto" data-testid="unplaced-list">
              {visible.map((item) => {
                const held = holdingPublicationId === item.publicationId;
                return (
                  <li key={item.publicationId}>
                    <button
                      type="button"
                      data-testid={`unplaced-item-${item.publicationId}`}
                      data-blocked={item.blockedReason !== null}
                      disabled={!editable || item.blockedReason !== null}
                      aria-pressed={held}
                      /* Pointer-down is the ONE selector: a click and the start of a
                     drag are the same gesture until the pointer moves, and
                     handling both would toggle the selection off again the
                     moment a plain click landed. */
                      onPointerDown={() => {
                        if (item.blockedReason) return;
                        onPressStart();
                        onPick(item);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border p-2 text-start text-sm transition-colors",
                        held
                          ? "border-primary bg-status-accent-bg shadow-elevation-1"
                          : "border-outline-variant hover:bg-surface-container",
                        item.blockedReason ? "cursor-not-allowed opacity-60" : "cursor-grab",
                      )}
                    >
                      <Thumb previewUrl={item.previewUrl} name={item.adName} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.customerName}</span>
                        <span className="block truncate text-xs text-on-surface-variant">
                          {item.shape.name} · {sizeLabel(item.shape, grid)}
                        </span>
                        {item.blockedReason ? (
                          <Badge tone="error" className="mt-1">
                            {item.blockedReason}
                          </Badge>
                        ) : item.alreadyPlaced ? (
                          <Badge tone="accent" className="mt-1">
                            כבר משובץ
                          </Badge>
                        ) : null}
                      </span>
                    </button>

                    {/* On the publication itself, because that is where the person
                    is looking when they realise the file is missing. */}
                    {editable && item.needsArtwork ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 w-full"
                        data-testid={`upload-for-${item.publicationId}`}
                        onClick={() => {
                          setUploadFor(item);
                          setUploadOpen(true);
                        }}
                      >
                        <CloudUpload className="size-4" />
                        העלאת מודעה לפרסום הזה
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {uploadOpen ? (
        <UploadDialog
          issueId={issueId}
          initialPublication={uploadFor}
          waiting={missingArtwork}
          customers={customers}
          openPages={openPages}
          grid={grid}
          onClose={() => setUploadOpen(false)}
        />
      ) : null}
    </section>
  );
}

/**
 * Everything already on a page, with the artwork visible.
 *
 * Two things a person wants here and could not get before: to see what an ad
 * actually looks like without hunting for it on a spread, and to jump to the
 * page it is on. Clicking the name opens the real file in the SAME dialog the
 * ad library uses — one preview in the product, not a second one that drifts.
 */
function PlacedList({
  placements,
  pageLabelOf,
  grid,
  onJump,
}: {
  placements: CanvasPlacement[];
  pageLabelOf: (pageId: string) => string;
  grid: DerivedGrid;
  onJump: (placement: CanvasPlacement) => void;
}) {
  if (placements.length === 0) {
    return <p className="text-sm text-on-surface-variant">עוד לא שובץ שום פרסום בגיליון הזה.</p>;
  }

  const ordered = [...placements].sort((a, b) =>
    pageLabelOf(a.pageId).localeCompare(pageLabelOf(b.pageId), "he"),
  );

  return (
    <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto" data-testid="placed-list">
      {ordered.map((placement) => (
        <li
          key={placement.id}
          data-testid={`placed-item-${placement.id}`}
          className="flex items-center gap-2 rounded-lg border border-outline-variant p-2 text-sm"
        >
          <AdPreviewDialog
            ad={placement.ad}
            testId={`placed-preview-${placement.id}`}
            trigger={
              <button
                type="button"
                data-testid={`placed-open-${placement.id}`}
                aria-label={`תצוגה מקדימה של ${placement.ad.name}`}
                className="shrink-0 rounded-sm ring-offset-2 hover:ring-2 hover:ring-primary"
              >
                <Thumb previewUrl={placement.previewUrl} name={placement.ad.name} />
              </button>
            }
          />

          <span className="min-w-0 flex-1">
            {/* The name is the handle: clicking it opens the file, which is
                what someone checking a layout actually wants. */}
            <AdPreviewDialog
              ad={placement.ad}
              testId={`placed-preview-name-${placement.id}`}
              trigger={
                <button
                  type="button"
                  data-testid={`placed-name-${placement.id}`}
                  className="block max-w-full truncate text-start font-medium underline-offset-2 hover:underline"
                >
                  {placement.customerName}
                </button>
              }
            />
            <span className="block truncate text-xs text-on-surface-variant">
              {placement.shapeName} · {sizeLabel(placement, grid)}
            </span>
          </span>

          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            data-testid={`placed-jump-${placement.id}`}
            onClick={() => onJump(placement)}
          >
            {pageLabelOf(placement.pageId)}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Thumb({ previewUrl, name }: { previewUrl: string | null; name: string | null }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-container">
      {previewUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={fileHref(previewUrl)} alt={name ?? ""} className="size-full object-contain" />
      ) : (
        <ImageOff className="size-4 text-on-surface-variant" />
      )}
    </span>
  );
}

type Target = "publication" | "customer" | "new";

/**
 * One file, and the three things it can belong to.
 *
 * A publication that is already waiting settles everything by itself. A
 * customer settles who is buying but not what — so a shape, a page and a price
 * are asked for, and confirming creates the order and the publication. A
 * walk-in settles nothing, so the customer is created too.
 *
 * One dialog for all three, deliberately: the upload rules are identical and
 * three dialogs would be three places for them to drift apart.
 */
function UploadDialog({
  issueId,
  initialPublication,
  waiting,
  customers,
  openPages,
  grid,
  onClose,
}: {
  issueId: string;
  initialPublication: BoardCandidate | null;
  waiting: BoardCandidate[];
  customers: CustomerOption[];
  openPages: OpenPage[];
  grid: DerivedGrid;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [target, setTarget] = useState<Target>(
    initialPublication ? "publication" : waiting.length > 0 ? "publication" : "customer",
  );
  const [publicationId, setPublicationId] = useState(
    initialPublication?.publicationId ?? waiting[0]?.publicationId ?? "",
  );
  const [customerId, setCustomerId] = useState("");
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [pageId, setPageId] = useState(openPages[0]?.id ?? "");
  const page = openPages.find((p) => p.id === pageId) ?? openPages[0];
  const [shapeId, setShapeId] = useState(page?.allowedShapes[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [listPrice, setListPrice] = useState<number | null>(null);

  const shape = page?.allowedShapes.find((s) => s.id === shapeId) ?? page?.allowedShapes[0];

  // The list price for whatever combination is on screen (FR-17: it is only a
  // suggestion — what gets frozen on the publication is whatever is submitted).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (target === "publication" || !page || !shape) {
        if (!cancelled) setListPrice(null);
        return;
      }
      const result = await boardPriceAction(issueId, page.pageTypeId, shape.id);
      if (cancelled) return;
      setListPrice(result.price);
      setPrice(result.price === null ? "" : String(result.price));
    })();
    return () => {
      cancelled = true;
    };
    // Keyed by IDS, not by the objects. `page` and `shape` are found inside a
    // prop array the board rebuilds on every render, so depending on them
    // re-runs this effect constantly — and each run calls setPrice, wiping a
    // number the person is in the middle of typing.
  }, [issueId, target, page?.pageTypeId, shape?.id]);

  const upload = async (targetPublicationId: string) => {
    const file = inputRef.current?.files?.[0];
    if (!file) return { message: "לא נבחר קובץ" };

    const form = new FormData();
    form.set("file", file);
    // The publication settles the customer and the newspaper on the server, so
    // nothing about either is sent from here (stage 05 §uploadAdvertisement).
    form.set("publicationId", targetPublicationId);
    return uploadAdvertisementAction({}, form);
  };

  const submit = () => {
    if (!inputRef.current?.files?.[0]) {
      setError("לא נבחר קובץ");
      return;
    }
    setError(null);

    startTransition(async () => {
      let targetPublicationId = publicationId;

      // A sale first, when there is nothing to attach to yet. If the upload
      // then fails, the publication stays — with no artwork, listed as "אין
      // מודעה" — which is a real state somebody can retry into, not a loss.
      if (target !== "publication") {
        if (target === "customer" && !customerId) {
          setError("לא נבחר לקוח");
          return;
        }
        if (!page || !shape) {
          setError("אין עמוד פתוח לשבץ אליו");
          return;
        }
        const sale = await createBoardSaleAction({
          issueId,
          pageTypeId: page.pageTypeId,
          adShapeId: shape.id,
          price: Number(price === "" ? 0 : price),
          customerId: target === "customer" ? customerId : null,
          newCustomer:
            target === "new"
              ? {
                  businessName: businessName.trim(),
                  contactName: contactName.trim() === "" ? null : contactName.trim(),
                  phone: phone.trim() === "" ? null : phone.trim(),
                  email: email.trim() === "" ? null : email.trim(),
                }
              : null,
        });
        if (!sale.ok || !sale.publicationId) {
          setError(sale.message ?? "לא הצלחנו ליצור את ההזמנה");
          return;
        }
        targetPublicationId = sale.publicationId;
      }

      const result = await upload(targetPublicationId);
      router.refresh();
      if (result.ok && !result.message) {
        onClose();
        return;
      }
      // A stored-but-invalid file also comes back ok, with the reason attached.
      setError(result.message ?? "ההעלאה נכשלה");
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="העלאת מודעה"
      data-testid="board-upload-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4"
    >
      <div className="max-h-[90dvh] w-full max-w-[32rem] overflow-y-auto rounded-lg bg-surface-container-lowest p-5 shadow-elevation-2">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="font-serif text-xl font-semibold">העלאת מודעה מהמחשב</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container"
          >
            <X className="size-4" />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          name="file"
          data-testid="board-upload-file"
          accept={AD_ACCEPT_ATTRIBUTE}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="mb-1 block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-surface-container file:px-3 file:py-2 file:text-sm"
        />
        {fileName ? (
          <p className="mb-3 text-xs text-on-surface-variant">
            <Ltr>{fileName}</Ltr>
          </p>
        ) : null}

        <div
          role="radiogroup"
          aria-label="למי לשייך את המודעה"
          className="my-3 flex flex-wrap gap-1 rounded-lg border border-outline-variant bg-surface-container p-1"
        >
          {(
            [
              ["publication", "לפרסום שממתין"],
              ["customer", "ללקוח קיים"],
              ["new", "ללקוח חדש"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={target === value}
              data-testid={`upload-target-${value}`}
              disabled={value === "publication" && waiting.length === 0}
              onClick={() => setTarget(value)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40",
                target === value
                  ? "bg-surface-container-lowest text-on-surface shadow-elevation-1 ring-1 ring-outline-variant"
                  : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {target === "publication" ? (
          <>
            <Label htmlFor="upload-target">לאיזה פרסום</Label>
            <select
              id="upload-target"
              data-testid="upload-target"
              value={publicationId}
              onChange={(e) => setPublicationId(e.target.value)}
              className="mb-3 h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
            >
              {waiting.map((t) => (
                <option key={t.publicationId} value={t.publicationId}>
                  {t.customerName} · {t.shape.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            {target === "customer" ? (
              <>
                <Label htmlFor="upload-customer">לקוח</Label>
                <div className="mb-3">
                  <Combobox
                    id="upload-customer"
                    name="upload-customer"
                    testId="upload-customer"
                    options={customers.map((c) => ({ value: c.id, label: c.label, hint: c.hint }))}
                    defaultValue={customerId}
                    onChange={setCustomerId}
                    emptyText="אין לקוח בשם הזה — אפשר ״ללקוח חדש״"
                  />
                </div>
              </>
            ) : (
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="nc-business">שם העסק</Label>
                  <Input
                    id="nc-business"
                    data-testid="new-customer-business"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="nc-contact">איש קשר (רשות)</Label>
                  <Input
                    id="nc-contact"
                    data-testid="new-customer-contact"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="nc-phone">טלפון</Label>
                  <Input
                    id="nc-phone"
                    data-testid="new-customer-phone"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="nc-email">מייל</Label>
                  <Input
                    id="nc-email"
                    data-testid="new-customer-email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <p className="text-xs text-on-surface-variant sm:col-span-2">
                  צריך טלפון או מייל — אחד מהם מספיק. שאר הפרטים (ח.פ, אנשי קשר נוספים) אפשר להשלים
                  אחר כך בכרטיס הלקוח.
                </p>
              </div>
            )}

            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <div>
                <Label htmlFor="sale-page">עמוד</Label>
                <select
                  id="sale-page"
                  data-testid="sale-page"
                  value={pageId}
                  onChange={(e) => {
                    setPageId(e.target.value);
                    const next = openPages.find((p) => p.id === e.target.value);
                    setShapeId(next?.allowedShapes[0]?.id ?? "");
                  }}
                  className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
                >
                  {openPages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="sale-shape">צורה</Label>
                <select
                  id="sale-shape"
                  data-testid="sale-shape"
                  value={shapeId}
                  onChange={(e) => setShapeId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
                >
                  {(page?.allowedShapes ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {sizeLabel(s, grid)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="sale-price">מחיר</Label>
                <Input
                  id="sale-price"
                  data-testid="sale-price"
                  dir="ltr"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>

            <p className="mb-3 text-xs text-on-surface-variant" data-testid="sale-price-hint">
              {listPrice === null ? (
                "אין מחיר במחירון לצירוף הזה — יש להקליד מחיר."
              ) : (
                <>
                  {/* Currency and digits stay LTR inside a Hebrew sentence, or
                      the shekel sign detaches from its number (conventions §1). */}
                  מחיר המחירון: <Ltr>₪{listPrice.toLocaleString("he-IL")}</Ltr>. אפשר לשנות, והמחיר
                  שיישמר הוא זה שכאן.
                </>
              )}
            </p>
            <p className="mb-3 rounded-lg bg-status-warning-bg p-2 text-xs text-status-warning-fg">
              אישור ייצור הזמנה <strong>מאושרת</strong> ופרסום לתאריך הגיליון, והפעולה תירשם ביומן
              הביקורת.
            </p>
          </>
        )}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="mt-4 flex gap-2">
          <Button onClick={submit} disabled={pending} data-testid="board-upload-submit">
            {pending ? "מעלה…" : target === "publication" ? "העלאה ושיוך" : "העלאה, הזמנה ושיוך"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
        </div>
      </div>
    </div>
  );
}
