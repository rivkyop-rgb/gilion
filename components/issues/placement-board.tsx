"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Lock,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Wand2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Ltr } from "@/components/ui/ltr";
import type { DerivedGrid } from "@/lib/domain/grid";
import {
  ISSUE_STATUS_LABELS,
  availableTransitions,
  isEditable,
  lockReason,
  type IssueStatus,
} from "@/lib/domain/issue-status";
import {
  innerPageTypeId,
  pageFill,
  pageLabel,
  unfinishedPages,
  viewIndexOfPage,
  viewsOf,
  type PageFill,
} from "@/lib/domain/issue-layout";
import {
  checkPlacement,
  sizeLabel,
  type ReservedArea,
  type PlacementRejection,
  type ShapeSpec,
} from "@/lib/domain/placement";
import type { Cell, GridRect } from "@/lib/domain/slot-geometry";
import { cn } from "@/lib/utils";
import {
  approveDuplicateOverrideAction,
  autoPlaceIssueAction,
  insertIssuePageAction,
  movePlacementAction,
  placeAdAction,
  removeIssuePageAction,
  removePlacementAction,
  reorderIssuePagesAction,
  setIssueStatusAction,
} from "@/app/(internal)/issues/actions";
import { PageCanvas, type CanvasPlacement } from "./page-canvas";
import { ShapeChips } from "./shape-chips";
import { ISSUE_TONE } from "@/components/status-tone";
import { ChangeIssueDate } from "./issue-calendar";
import { PageStrip } from "./page-strip";
import { PageOrderDialog } from "./page-order-dialog";
import { AutoPlaceDialog } from "./auto-place-dialog";
import { counted } from "@/lib/domain/hebrew-count";
import { UnplacedPanel, type BoardCandidate } from "./unplaced-panel";
import { useFittedSpread } from "./use-fitted-spread";

export type { BoardCandidate };

export type BoardPage = {
  id: string;
  number: number;
  pageTypeName: string;
  pageTypeId: string;
  allowedShapes: ShapeSpec[];
  /** Areas of this page that are not for sale (backlog item 14). */
  reserved: ReservedArea[];
};

export type BoardModel = {
  issueId: string;
  newspaperName: string;
  issueDate: string;
  status: IssueStatus;
  /** yyyy-mm-dd — what the date picker starts from. */
  issueDateIso: string;
  isAdmin: boolean;
  mayWrite: boolean;
  grid: DerivedGrid;
  /** Every page type the newspaper offers — what a new page may be. */
  pageTypes: Array<{ id: string; name: string }>;
  pages: BoardPage[];
  placements: CanvasPlacement[];
  candidates: BoardCandidate[];
  /** Existing customers, for selling a page to one of them from here. */
  customers: Array<{ id: string; label: string; hint?: string }>;
  /**
   * `?page=` from the URL — the view to open on, rather than the first one.
   *
   * The check screen links every finding to the page it lives on, and a link
   * that lands on the cover of a twenty-page issue and says "it is somewhere in
   * here" is not a link. Null when the URL asked for nothing.
   */
  focusPageNumber: number | null;
};

const DETAILS_KEY = "gilion.board.details";
const readDetails = () => {
  try {
    return window.localStorage.getItem(DETAILS_KEY) === "1";
  } catch {
    return false;
  }
};
/** Storage changes in another tab; this tab writes through setDetailsOpen. */
const subscribeDetails = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

/** What the designer is currently holding. */
type Held =
  | { kind: "publication"; publicationId: string; shape: ShapeSpec }
  | { kind: "placement"; placementId: string; publicationId: string; shape: ShapeSpec }
  | null;

/**
 * The placement board (US-007).
 *
 * ── The unit of work is a spread, not a page ─────────────────────────────────
 * `IssuePage` is still one numbered page, and stage 07 still prints one page at
 * a time; the pairing happens in `lib/domain/issue-layout.ts` and stops there.
 * But an ad at the inner edge of page 2 sits against whatever is at the inner
 * edge of page 3, and you cannot judge that one page at a time — which is why
 * a person laying out a newspaper works with it open flat.
 *
 * ── Why the rules run here as well as on the server ──────────────────────────
 * `checkPlacement` is a pure module, so the board imports the SAME function the
 * Server Action enforces with. That is what lets a blocked target explain
 * itself before the drop instead of after a round trip — and it means a rule
 * can never be phrased one way for the cursor and another for the database.
 * The server still decides: this copy cannot see a sibling another designer
 * placed a second ago, which is exactly what the two DB constraints are for.
 */
export function PlacementBoard({ model }: { model: BoardModel }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const views = useMemo(() => viewsOf(model.pages), [model.pages]);
  // The initial value only: after the first render the pager owns this, so a
  // refresh triggered by a placement does not yank the person back to the page
  // the URL named half an hour ago.
  const [viewIndex, setViewIndex] = useState(() => {
    if (model.focusPageNumber === null) return 0;
    const page = model.pages.find((p) => p.number === model.focusPageNumber);
    const index = page ? viewIndexOfPage(views, page.id) : -1;
    return index >= 0 ? index : 0;
  });
  const [held, setHeld] = useState<Held>(null);
  const [hover, setHover] = useState<{ pageId: string; cell: Cell } | null>(null);
  /**
   * What the board last said, and whether it was bad news.
   *
   * A single string was not enough: several actions succeed and still have
   * something to report — "4 ads placed, 2 pages added" is not an error, and
   * painting it red taught people to read every notice as a failure.
   */
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const fail = (text: string) => setNotice({ text, ok: false });
  const say = (text: string) => setNotice({ text, ok: true });
  const [duplicateFor, setDuplicateFor] = useState<BoardCandidate | null>(null);
  // A page added mid-issue is an inner page; the select still offers the rest.
  const [newPageType, setNewPageType] = useState(innerPageTypeId(model.pageTypes) ?? "");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  /** Full screen: the board over the app's own chrome (27/09/2026). */
  const [focus, setFocus] = useState(false);
  /**
   * The details panel. Remembered per browser; closed until asked for.
   * Read through useSyncExternalStore so the server (no storage) and the first
   * client render agree, and the stored choice arrives right after.
   */
  const storedDetails = useSyncExternalStore(
    subscribeDetails,
    () => readDetails(),
    () => false,
  );
  const [detailsChoice, setDetailsChoice] = useState<boolean | null>(null);
  const detailsOpen = detailsChoice ?? storedDetails;
  const setDetailsOpen = (open: boolean) => {
    setDetailsChoice(open);
    try {
      window.localStorage.setItem(DETAILS_KEY, open ? "1" : "0");
    } catch {
      // A browser that refuses storage just does not remember.
    }
  };
  // F toggles focus and Esc leaves it — never while typing into a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "Escape") setFocus(false);
      else if ((e.key === "f" || e.key === "כ") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setFocus((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  /** Pages the last reorder moved — highlighted on the strip for a few seconds. */
  const [recentlyMoved, setRecentlyMoved] = useState<Set<string>>(() => new Set());
  /** The ordering dialog: null closed; `initial` is the drag that opened it. */
  const [pageOrder, setPageOrder] = useState<{ initial: string[] | null } | null>(null);
  /**
   * Which arrangement the auto-placer produced. Bumping it asks for another —
   * the same number always gives the same layout, so there is a way back.
   */
  const [layoutSeed, setLayoutSeed] = useState(1);

  /**
   * Pressed vs dragging.
   *
   * A press is not a drop. Selecting an ad by clicking it puts the pointer down
   * and up in the same place — and the pointerup lands on the page underneath,
   * which would otherwise read it as "drop here" and move the ad to whatever
   * cell happens to sit under the item that was just clicked. A gesture only
   * becomes a drag once the pointer has actually MOVED over a page.
   */
  const pressed = useRef(false);
  const [dragging, setDragging] = useState(false);

  const editable = isEditable(model.status, model.isAdmin) && model.mayWrite;
  const locked = lockReason(model.status, model.isAdmin);

  const view = views[Math.min(viewIndex, Math.max(0, views.length - 1))];

  const placementsByPage = useMemo(() => {
    const map = new Map<string, CanvasPlacement[]>();
    for (const p of model.placements) {
      map.set(p.pageId, [...(map.get(p.pageId) ?? []), p]);
    }
    return map;
  }, [model.placements]);

  /** How full every page is, and what still fits on it — what a seller needs. */
  const fills = useMemo(() => {
    const map = new Map<string, PageFill>();
    for (const page of model.pages) {
      map.set(
        page.id,
        pageFill(
          page,
          placementsByPage.get(page.id) ?? [],
          model.grid,
          page.allowedShapes,
          page.reserved.map((area) => area.rect),
        ),
      );
    }
    return map;
  }, [model.pages, placementsByPage, model.grid]);

  const unfinished = useMemo(() => unfinishedPages([...fills.values()]), [fills]);
  // Only what the packer could actually take: artwork present and usable.
  const unplacedCount = model.candidates.filter(
    (c) => !c.alreadyPlaced && c.blockedReason === null,
  ).length;
  const totalPages = model.pages.length;

  // Both halves of a spread, whole, without scrolling — see useFittedSpread.
  const { ref: spreadRef, size: pageSize } = useFittedSpread(
    view?.pages.length ?? 1,
    model.grid.pageWidthMm / model.grid.pageHeightMm,
  );

  /** The candidate rectangle under the cursor, on the page it is over. */
  const candidate: (GridRect & { pageId: string }) | null = useMemo(() => {
    if (!held || !hover) return null;
    return {
      pageId: hover.pageId,
      col: hover.cell[0],
      row: hover.cell[1],
      cols: held.shape.cols,
      rows: held.shape.rows,
    };
  }, [held, hover]);

  /**
   * Why the candidate is or is not allowed.
   *
   * Rules 2-4 (newspaper, date, artwork) are supplied as passing values on
   * purpose: the server already filtered this list to publications of this
   * issue's newspaper and date, and anything whose artwork fails is rendered
   * un-draggable with its reason rather than being offered and refused.
   */
  const verdict: PlacementRejection | null = useMemo(() => {
    if (!candidate || !held) return null;
    const page = model.pages.find((p) => p.id === candidate.pageId);
    if (!page) return null;

    const siblings = (placementsByPage.get(page.id) ?? [])
      .filter((p) => !(held.kind === "placement" && p.id === held.placementId))
      .map(({ col, row, cols, rows }) => ({ col, row, cols, rows }));

    return checkPlacement({
      issue: { status: model.status, newspaperId: "same", issueDate: "same" },
      isAdmin: model.isAdmin,
      page: { allowedShapes: page.allowedShapes, reserved: page.reserved },
      publication: {
        newspaperId: "same",
        publicationDate: "same",
        customerId: "same",
        shapeId: held.shape.id,
      },
      advertisement: { customerId: "same", validationPassed: true, archived: false },
      shape: held.shape,
      rect: candidate,
      grid: model.grid,
      siblings,
      alreadyInIssue: false,
      duplicateOverrideApproved: false,
    });
  }, [candidate, held, model.pages, placementsByPage, model.grid, model.status, model.isAdmin]);

  const commit = (pageId: string, cell: Cell) => {
    if (!held || !editable) return;

    // The previous notice is NOT cleared here.
    //
    // It used to be, and that left the board silent for the length of the round
    // trip: the old message gone, the new one not yet written, and the hover
    // reason liable to vanish with it the moment a re-render moved the element
    // under the pointer. A row that empties and refills is read as a message
    // that was dismissed. Whatever the action returns replaces it, and a
    // success clears it explicitly below.
    startTransition(async () => {
      const result =
        held.kind === "publication"
          ? await placeAdAction({
              issueId: model.issueId,
              pageId,
              publicationId: held.publicationId,
              col: cell[0],
              row: cell[1],
            })
          : await movePlacementAction({
              issueId: model.issueId,
              placementId: held.placementId,
              pageId,
              col: cell[0],
              row: cell[1],
            });

      if (result.ok) {
        setNotice(null);
        setHeld(null);
        setHover(null);
        router.refresh();
        return;
      }
      fail(result.message ?? "לא הצלחנו לשבץ");
      // A refused duplicate is the one rejection with a way forward, and only
      // an admin has it (FR-16).
      if (model.isAdmin && held.kind === "publication" && result.message?.includes("כבר משובץ")) {
        setDuplicateFor(
          model.candidates.find((c) => c.publicationId === held.publicationId) ?? null,
        );
      }
    });
  };

  const selectedPlacement =
    held?.kind === "placement"
      ? model.placements.find((p) => p.id === held.placementId)
      : undefined;
  const selectedPage =
    model.pages.find((p) => p.id === (selectedPlacement?.pageId ?? selectedPageId)) ??
    view?.pages[0];

  const run = (action: () => Promise<{ ok?: boolean; message?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      // A message on success is worth showing too — that is where the packer
      // reports how many ads it placed and how many pages it had to open.
      else if (!result.ok) fail(result.message ?? "הפעולה נכשלה");
      if (result.ok && result.message) say(result.message);
    });

  /** The auto-placer's "where" dialog. Remounted per opening, so it starts clean. */
  const [autoOpen, setAutoOpen] = useState(false);

  const jumpToPage = (pageId: string) => {
    const index = viewIndexOfPage(views, pageId);
    if (index >= 0) setViewIndex(index);
    setSelectedPageId(pageId);
  };

  return (
    <div
      // NOT "placement-…": that prefix is reserved for placements, and every
      // spec counts them with [data-testid^="placement-"] (CLAUDE.md).
      data-testid="board-root"
      data-focus={focus || undefined}
      className={cn(
        "flex flex-col gap-3",
        // Focus: the board over everything — top bar and menu included.
        focus && "fixed inset-0 z-40 overflow-hidden bg-background p-3",
      )}
      // One height for all three columns, set here so focus can change it in
      // one place. Measured below by useFittedSpread; this is only the budget.
      /* The board is exactly the window below the top bar (h-16) and the
         frame's padding (py-3), and the columns take what the header row
         leaves — measured by layout, not subtracted by guess. A fixed
         `100dvh - N` held until the header wrapped to two lines on a laptop,
         and the foot of the page went off screen by exactly that line
         (CLAUDE.md, "חיסור קבוע מ־100dvh"). */
      style={{
        height: focus ? "100dvh" : "calc(100dvh - 4rem - 1.5rem)",
      }}
      // A drag that ends anywhere but a page is a cancelled drag, not a drop —
      // the selection survives it so the click path still works.
      onPointerUp={() => {
        pressed.current = false;
        setDragging(false);
      }}
    >
      {/* ── One slim row: which issue, its status, and what to do with it ─────
          It used to be a heading block above the board and a status block at
          the foot of the details panel — together about 150px of height that
          came straight off the printed page (27/09/2026). */}
      <header
        className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2"
        data-testid="board-header"
      >
        <h1 className="font-serif text-xl font-semibold">
          {model.newspaperName} · <Ltr>{model.issueDate}</Ltr>
        </h1>
        <span className="text-xs text-on-surface-variant">
          גריד{" "}
          <Ltr>
            {model.grid.columns} × {model.grid.rows}
          </Ltr>{" "}
          · <Ltr>{totalPages}</Ltr> עמודים
        </span>
        <Badge tone={ISSUE_TONE[model.status]} data-testid="board-status">
          {ISSUE_STATUS_LABELS[model.status]}
        </Badge>
        {model.mayWrite ? (
          <>
            {/* Whether placing is allowed RIGHT NOW, said outright — the status
                name alone does not answer it. NOT "placement-…": every spec
                counts placements with [data-testid^="placement-"]. */}
            <span
              data-testid="can-place"
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs",
                editable
                  ? "bg-status-success-bg text-status-success-fg"
                  : "bg-status-neutral-bg text-status-neutral-fg",
              )}
            >
              {editable ? "אפשר לשבץ עכשיו" : (locked ?? "הגיליון אינו פתוח לשיבוץ")}
            </span>
            {editable ? (
              <ChangeIssueDate
                issueId={model.issueId}
                currentDate={model.issueDateIso}
                onDone={say}
              />
            ) : null}
            {/* `closed` is not one of these, nor is reopening: both run the
                seven checks and write the press file, so they live on the check
                screen behind its findings — never as a one-click status. */}
            {availableTransitions(model.status, model.isAdmin)
              .filter((to) => to !== "closed" && model.status !== "closed")
              .map((to) => (
                <Button
                  key={to}
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  data-testid={`set-status-${to}`}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await setIssueStatusAction(model.issueId, to);
                      if (!result.ok) {
                        fail(result.message ?? "לא הצלחנו לשנות סטטוס");
                        return;
                      }
                      router.refresh();
                    })
                  }
                >
                  {ISSUE_STATUS_LABELS[to]}
                </Button>
              ))}
            <Button asChild size="sm" data-testid="go-to-check">
              <Link href={`/issues/${model.issueId}/validate`}>
                <ClipboardCheck className="size-4" />
                {model.status === "closed" ? "בדיקה ו־PDF" : "בדיקה וסגירה"}
              </Link>
            </Button>
          </>
        ) : null}

        <span className="ms-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={focus ? "primary" : "secondary"}
            data-testid="board-focus"
            aria-pressed={focus}
            title="מסך מלא — מקש F"
            onClick={() => setFocus((f) => !f)}
          >
            {focus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            {focus ? "יציאה ממסך מלא" : "מסך מלא"}
          </Button>
          {!focus ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/issues">חזרה לגיליונות</Link>
            </Button>
          ) : null}
        </span>
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-3 [grid-template-rows:minmax(0,1fr)]",
          focus
            ? "xl:grid-cols-[16rem_1fr_9rem]"
            : detailsOpen
              ? "xl:grid-cols-[16rem_1fr_9rem_17rem]"
              : "xl:grid-cols-[16rem_1fr_9rem_2.75rem]",
        )}
      >
        <UnplacedPanel
          issueId={model.issueId}
          candidates={model.candidates}
          placements={model.placements}
          pageLabelOf={(pageId) =>
            pageLabel(model.pages.find((p) => p.id === pageId)?.number ?? 0, totalPages)
          }
          onJumpToPlacement={(placement) => {
            jumpToPage(placement.pageId);
            setHeld(null);
          }}
          customers={model.customers}
          openPages={(view?.pages ?? []).map((p) => {
            const full = model.pages.find((x) => x.id === p.id);
            return {
              id: p.id,
              label: pageLabel(p.number, totalPages),
              pageTypeId: full?.pageTypeId ?? "",
              allowedShapes: full?.allowedShapes ?? [],
            };
          })}
          grid={model.grid}
          editable={editable}
          isAdmin={model.isAdmin}
          holdingPublicationId={held?.kind === "publication" ? held.publicationId : null}
          onPressStart={() => {
            pressed.current = true;
          }}
          onPick={(item) =>
            setHeld((prev) =>
              prev?.kind === "publication" && prev.publicationId === item.publicationId
                ? null
                : { kind: "publication", publicationId: item.publicationId, shape: item.shape },
            )
          }
        />

        {/* ── Centre: the spread ─────────────────────────────────────────────────

          The column has a definite height and the spread takes whatever the
          rest of it leaves. That is deliberate: subtracting a guessed constant
          for "the chrome" works until the notice row wraps to two lines on a
          narrower screen, and then the page scrolls again by exactly the height
          nobody accounted for. Here the notices, the pager and the strip take
          what they need first, and the page fills the remainder — so it is
          always whole, whatever wrapped. */}
        <section aria-label="קנבס העמוד" className="flex h-full min-h-72 min-w-0 flex-col">
          {/* Both notices live in space that is ALWAYS reserved, and the hover
            reason is drawn over the page rather than above it. A banner that
            appears when the pointer enters a cell pushes the page down by its
            own height — out from under the pointer — so the cell being aimed at
            moves as it is aimed at, and the drop lands somewhere else. */}
          {/* One message, in one always-reserved place.
            
            The hover reason used to ALSO be drawn floating over the top of the
            page — the same sentence twice, and the copy on the canvas sat
            exactly on the rows being aimed at. It was an overlay so it never
            pushed the page (the trap in CLAUDE.md), but covering the target is
            its own version of the same fault: the answer to "why not here" must
            not stand on "here". Reported 06/09/2026.
            
            Priority is deliberate: while something is in hand, why it will not
            drop outranks whatever the last action said. */}
          {/* A FIXED height, and the message positioned inside it.
            
            `min-h-9` reserved one line, so a long refusal wrapped to two and
            took the difference out of the canvas — which moved the cell being
            aimed at while it was being aimed at. That is the trap in CLAUDE.md
            exactly, arriving through the door that was left open: the notice no
            longer opens ABOVE the page, it grows above it, and a page that
            moves is a page that cannot be clicked. Playwright called it
            "element is not stable"; a person calls it a button that misses.
            
            Two lines' worth is reserved always. Anything longer scrolls inside
            the box rather than pushing anything, because a reason is worth
            reading in full and never worth moving the page for. */}
          <div className="relative mb-2 h-14 shrink-0">
            {held && verdict ? (
              /* One testid for the whole row, whatever is in it.
               
               The hover reason used to be a second element with a second name,
               floating over the canvas. Splitting them was splitting one thing:
               "why will this not go down" and "what just happened" are the same
               question to the person reading, they never appear together, and
               two names meant every spec had to know which of them the board
               happened to be showing. `data-kind` keeps them tellable apart
               where that actually matters. */
              <p
                role="status"
                data-testid="board-message"
                data-kind="verdict"
                /* RED, because it blocks.
                 
                 One scheme across the product, the one the check screen already
                 uses: red refuses, orange warns and blocks nothing, green is
                 fine. This message used to be orange while hovering and red
                 after the click — the same sentence in two colours, which
                 taught the reader that the colour means nothing. */
                className="absolute inset-0 overflow-y-auto rounded-lg bg-status-error-bg p-2 text-sm text-status-error-fg"
              >
                {verdict.message}
              </p>
            ) : notice ? (
              <p
                role="alert"
                data-testid="board-message"
                data-kind="notice"
                data-ok={notice.ok}
                className={cn(
                  "absolute inset-0 flex flex-wrap items-center gap-2 overflow-y-auto rounded-lg p-2 text-sm",
                  notice.ok
                    ? "bg-status-success-bg text-status-success-fg"
                    : "bg-status-error-bg text-status-error-fg",
                )}
              >
                <span>{notice.text}</span>

                {/* What is still SELLABLE, said in the same breath as what just
                  happened.
                  
                  The two used to take turns in this row, and a success always
                  won — so the moment auto-placement finished, the one line that
                  says where there is still room to sell disappeared, at exactly
                  the moment somebody wants it. They are not competing pieces of
                  news: "four ads went down" and "two pages still have room" are
                  the same sentence to a person running an issue. */}
                {notice.ok && unfinished.length > 0 ? (
                  <span
                    data-testid="unfinished-after-notice"
                    className="flex flex-wrap items-center gap-1.5 text-on-surface-variant"
                  >
                    · עדיין יש מקום למכור ב־<Ltr>{unfinished.length}</Ltr>{" "}
                    {unfinished.length === 1 ? "עמוד" : "עמודים"}:
                    {unfinished.map((f) => (
                      <button
                        key={f.pageId}
                        type="button"
                        data-testid={`jump-to-page-${f.pageNumber}`}
                        onClick={() => jumpToPage(f.pageId)}
                        className="rounded-full bg-surface-container-lowest px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline"
                      >
                        {pageLabel(f.pageNumber, totalPages)} · {100 - f.percent}% פנוי
                      </button>
                    ))}
                  </span>
                ) : null}
              </p>
            ) : unfinished.length > 0 ? (
              <p
                data-testid="unfinished-alert"
                className="absolute inset-0 flex flex-wrap items-center gap-2 overflow-y-auto rounded-lg bg-status-warning-bg p-2 text-sm text-status-warning-fg"
              >
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  עדיין יש מקום למכור ב־<Ltr>{unfinished.length}</Ltr>{" "}
                  {unfinished.length === 1 ? "עמוד" : "עמודים"}:
                </span>
                {unfinished.map((f) => (
                  <button
                    key={f.pageId}
                    type="button"
                    data-testid={`jump-to-page-${f.pageNumber}`}
                    onClick={() => jumpToPage(f.pageId)}
                    className="rounded-full bg-surface-container-lowest px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline"
                  >
                    {/* The number a seller acts on is what is LEFT, not what is
                      gone. The page caption shows how full it is; this shows
                      what there is to offer somebody on the phone. */}
                    {pageLabel(f.pageNumber, totalPages)} · {100 - f.percent}% פנוי
                  </button>
                ))}
              </p>
            ) : (
              <p
                data-testid="all-full"
                className="absolute inset-0 overflow-y-auto p-2 text-sm text-status-success-fg"
              >
                כל העמודים מלאים — אין יותר שטח למכור בגיליון הזה.
              </p>
            )}
          </div>

          <div className="relative min-h-0 flex-1">
            {locked ? (
              <div
                data-testid="lock-overlay"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-surface-dim/80 text-on-surface"
              >
                <Lock className="size-8" />
                <p className="font-medium">{locked}</p>
              </div>
            ) : null}

            {/* dir="rtl" puts the lower page number on the right with no
              arithmetic — the same rule the grid inside each page follows.

              The height budget is what keeps the issue on one screen. The
              subtraction is the chrome around it: the top bar, the page
              heading, the notice row, the pager, the captions and the strip. */}
            <div
              ref={spreadRef}
              dir="rtl"
              data-testid="spread"
              className="mx-auto flex h-full items-start justify-center gap-2"
            >
              {(view?.pages ?? []).map((page) => {
                const full = model.pages.find((p) => p.id === page.id);
                const fill = fills.get(page.id);
                if (!full || !fill) return null;
                return (
                  <PageCanvas
                    key={page.id}
                    page={page}
                    totalPages={totalPages}
                    size={pageSize}
                    grid={model.grid}
                    placements={placementsByPage.get(page.id) ?? []}
                    reserved={full.reserved}
                    fill={fill}
                    editable={editable}
                    holding={held?.kind === "publication"}
                    refusesHeld={
                      held && !full.allowedShapes.some((s) => s.id === held.shape.id)
                        ? held.shape.name
                        : null
                    }
                    candidate={candidate?.pageId === page.id ? candidate : null}
                    verdict={candidate?.pageId === page.id ? verdict : null}
                    selectedPlacementId={selectedPlacement?.id ?? null}
                    onCellEnter={(pageId, cell) => held && setHover({ pageId, cell })}
                    onCellClick={(pageId, cell) => {
                      setSelectedPageId(pageId);
                      if (held) commit(pageId, cell);
                    }}
                    onPointerCell={(pageId, cell) => {
                      if (!held) return;
                      setHover({ pageId, cell });
                      if (pressed.current) setDragging(true);
                    }}
                    onDrop={(pageId, cell) => {
                      if (!held || !dragging) return;
                      setDragging(false);
                      pressed.current = false;
                      commit(pageId, cell);
                    }}
                    onPlacementPick={(placement) => {
                      pressed.current = editable;
                      setSelectedPageId(placement.pageId);
                      setHeld((prev) =>
                        prev?.kind === "placement" && prev.placementId === placement.id
                          ? null
                          : {
                              kind: "placement",
                              placementId: placement.id,
                              publicationId: placement.publicationId,
                              shape: {
                                // The AD SHAPE's id, never the placement's — see
                                // CanvasPlacement.shapeId. With the wrong one,
                                // rule 5 refuses the move on every page in the
                                // issue, including the one it is already on.
                                id: placement.shapeId,
                                name: placement.shapeName,
                                // The footprint stays the PLACEMENT's own: an ad
                                // laid out before the catalogue was resized keeps
                                // the size it was sold at (conventions.md §7).
                                cols: placement.cols,
                                rows: placement.rows,
                                positions: placement.shapePositions,
                              },
                            },
                      );
                    }}
                    onLeave={() => setHover(null)}
                  />
                );
              })}
            </div>
          </div>
        </section>

        {/* ── The page column: where you are in the issue, and its pages ─────────
          Beside the page rather than under it (27/09/2026): the pager, the
          auto-placer and the page strip used to take ~180px of height under
          the canvas — height a printed page, which is tall, needed more. */}
        <aside
          aria-label="עמודי הגיליון"
          data-testid="board-rail"
          className="flex h-full min-h-72 min-w-0 flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-2 shadow-elevation-1"
        >
          {/* The pager. RTL: "next" walks deeper into the issue, which is
            leftwards on screen, so the chevron pointing left is the forward one. */}
          <div className="flex shrink-0 items-center justify-between gap-1">
            <Button
              size="sm"
              variant="ghost"
              data-testid="pager-prev"
              disabled={viewIndex === 0}
              onClick={() => setViewIndex((i) => Math.max(0, i - 1))}
              aria-label="לתצוגה הקודמת"
            >
              <ChevronRight className="size-4" />
            </Button>
            <span
              data-testid="pager-label"
              className="flex min-w-0 flex-col items-center text-center text-xs font-medium leading-4"
            >
              {view?.label ?? "—"}
              <span className="text-[11px] font-normal text-on-surface-variant">
                <Ltr>
                  {views.length === 0 ? 0 : viewIndex + 1}/{views.length}
                </Ltr>
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              data-testid="pager-next"
              disabled={viewIndex >= views.length - 1}
              onClick={() => setViewIndex((i) => Math.min(views.length - 1, i + 1))}
              aria-label="לתצוגה הבאה"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </div>

          {editable && (unplacedCount > 0 || model.placements.length > 0) ? (
            <div className="flex shrink-0 flex-col gap-1.5">
              {unplacedCount > 0 ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    data-testid="auto-place"
                    className="h-auto w-full whitespace-normal py-1.5 leading-4"
                    // Asks WHERE first — every page, or only chosen ones (27/09/2026).
                    onClick={() => setAutoOpen(true)}
                  >
                    <Wand2 className="size-4" />
                    <span>שיבוץ אוטומטי</span>
                    <span className="rounded-full bg-surface-container-lowest px-1.5 text-xs">
                      <Ltr>{unplacedCount}</Ltr>
                    </span>
                  </Button>
                  <span className="text-[11px] leading-4 text-on-surface-variant">
                    עמודים יתווספו לפי הצורך.
                  </span>
                </>
              ) : null}

              {/* "Another arrangement" empties the board and packs again, which
                is the only thing it could honestly mean once everything is
                already placed. It undoes hand-placed ads as well, so it asks. */}
              {model.placements.length > 0 ? (
                <ConfirmDialog
                  testId="reshuffle"
                  trigger={
                    <Button size="sm" variant="ghost" data-testid="auto-place-reshuffle">
                      סידור אחר
                    </Button>
                  }
                  title="לסדר את הגיליון מחדש?"
                  body={`כל ${model.placements.length} השיבוצים בגיליון יוסרו, והמערכת תסדר אותו מחדש בפריסה אחרת — כולל מודעות ששובצו ביד.`}
                  confirmLabel="סדר מחדש"
                  pendingLabel="מסדר…"
                  onConfirm={async () => {
                    const next = layoutSeed + 1;
                    setLayoutSeed(next);
                    const result = await autoPlaceIssueAction(model.issueId, next, true);
                    if (result.ok) {
                      if (result.message) say(result.message);
                      router.refresh();
                      return;
                    }
                    return { message: result.message ?? "לא הצלחנו לסדר מחדש" };
                  }}
                />
              ) : null}
            </div>
          ) : null}

          {selectedPlacement && !detailsOpen && !focus ? (
            <Button
              size="sm"
              variant="ghost"
              data-testid="open-selected-details"
              onClick={() => setDetailsOpen(true)}
            >
              לפרטי המודעה
            </Button>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col">
            <PageStrip
              views={views}
              fills={fills}
              activeIndex={viewIndex}
              editable={editable}
              pageTypes={model.pageTypes}
              newPageTypeId={newPageType}
              onNewPageTypeChange={setNewPageType}
              onSelectView={(index) => {
                setViewIndex(index);
                setHeld(null);
              }}
              onInsertAfter={(pageId) =>
                run(() => insertIssuePageAction(model.issueId, newPageType, pageId))
              }
              onReorder={(ordered) => setPageOrder({ initial: ordered })}
              onOpenOrder={() => setPageOrder({ initial: null })}
              highlightPageIds={recentlyMoved}
            />
            {autoOpen ? (
              <AutoPlaceDialog
                open
                onOpenChange={setAutoOpen}
                waiting={unplacedCount}
                busy={pending}
                pages={model.pages.map((p) => ({
                  id: p.id,
                  label: pageLabel(p.number, totalPages),
                  pageTypeName: p.pageTypeName,
                  percent: fills.get(p.id)?.percent ?? 0,
                }))}
                onRun={(onlyPageIds) => {
                  setAutoOpen(false);
                  run(() =>
                    autoPlaceIssueAction(
                      model.issueId,
                      layoutSeed,
                      false,
                      onlyPageIds ?? undefined,
                    ),
                  );
                }}
              />
            ) : null}
            {pageOrder ? (
              <PageOrderDialog
                // Remounted per opening, so it always starts from the issue as
                // it stands (or from the drag that opened it), never from a
                // half-finished arrangement someone walked away from.
                key={pageOrder.initial?.join() ?? "fresh"}
                open
                initialOrder={pageOrder.initial}
                pages={model.pages.map((p) => ({
                  id: p.id,
                  number: p.number,
                  pageTypeName: p.pageTypeName,
                  fillPercent: fills.get(p.id)?.percent ?? 0,
                  blocks: (placementsByPage.get(p.id) ?? []).map((b) => ({
                    col: b.col,
                    row: b.row,
                    cols: b.cols,
                    rows: b.rows,
                  })),
                }))}
                grid={{ columns: model.grid.columns, rows: model.grid.rows }}
                onOpenChange={(open) => {
                  if (!open) setPageOrder(null);
                }}
                onConfirm={async (ordered) => {
                  const before = model.pages.map((p) => p.id);
                  const result = await reorderIssuePagesAction(model.issueId, ordered);
                  if (!result.message) {
                    // Said on the board, not only in the dialog that just closed:
                    // the strip is where the new order has to be recognisable.
                    const moved = ordered.filter((id, i) => before[i] !== id);
                    setRecentlyMoved(new Set(moved));
                    say(
                      `סדר העמודים עודכן — ${counted(moved.length, "עמוד אחד קיבל", "עמודים קיבלו")} מספר חדש. הם מסומנים בטור העמודים.`,
                    );
                    window.setTimeout(() => setRecentlyMoved(new Set()), 10_000);
                    router.refresh();
                  }
                  return result;
                }}
              />
            ) : null}
          </div>
        </aside>

        {/* ── End panel: the selection ─────────────────────────────────────────── */}
        {focus ? null : !detailsOpen ? (
          /* Closed by default, and opened only by a click. It does NOT open by
           itself on selecting an ad: opening a column beside the page changes
           the room the page is fitted into, and a page that resizes under the
           pointer is the trap in CLAUDE.md ("הודעה שנפתחת מעל קנבס"). */
          <button
            type="button"
            data-testid="toggle-details"
            aria-expanded={false}
            onClick={() => setDetailsOpen(true)}
            className="flex h-full flex-col items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest py-3 text-xs font-medium text-on-surface-variant shadow-elevation-1 hover:bg-surface-container"
          >
            <PanelLeftOpen className="size-4" aria-hidden />
            <span className="[writing-mode:vertical-rl]">פרטים וצורות</span>
          </button>
        ) : (
          <section
            aria-label="פרטי השיבוץ הנבחר"
            className="max-h-full overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-serif text-lg font-semibold">פרטים</h2>
              <Button
                size="sm"
                variant="ghost"
                data-testid="toggle-details"
                aria-expanded
                aria-label="סגירת הפרטים"
                onClick={() => setDetailsOpen(false)}
              >
                <PanelLeftClose className="size-4" />
              </Button>
            </div>

            {selectedPlacement ? (
              <dl className="space-y-2 text-sm" data-testid="selected-details">
                <Row label="לקוח" value={selectedPlacement.customerName} />
                <Row label="עיתון" value={model.newspaperName} />
                <Row
                  label="עמוד"
                  value={pageLabel(
                    model.pages.find((p) => p.id === selectedPlacement.pageId)?.number ?? 0,
                    totalPages,
                  )}
                />
                <Row label="צורה" value={selectedPlacement.shapeName} />
                {/* Size in centimetres, never in cells (conventions.md §1). */}
                <Row label="גודל" value={sizeLabel(selectedPlacement, model.grid)} />
                {selectedPlacement.duplicate ? (
                  <Badge tone="accent">שיבוץ בחריגה מאושרת</Badge>
                ) : null}

                {editable ? (
                  <ConfirmDialog
                    testId="remove-placement"
                    trigger={
                      <Button
                        variant="destructive"
                        size="sm"
                        className="mt-2 w-full"
                        data-testid="remove-placement-trigger"
                      >
                        <Trash2 className="size-4" />
                        הסר שיבוץ
                      </Button>
                    }
                    title="להסיר את השיבוץ?"
                    body={`המודעה של ${selectedPlacement.customerName} תרד מהעמוד, והפרסום יחזור לרשימת הלא־משובצים.`}
                    confirmLabel="הסר שיבוץ"
                    pendingLabel="מסיר…"
                    onConfirm={async () => {
                      const result = await removePlacementAction(
                        model.issueId,
                        selectedPlacement.id,
                      );
                      if (result.ok) {
                        setHeld(null);
                        router.refresh();
                        return;
                      }
                      return { message: result.message ?? "לא הצלחנו להסיר" };
                    }}
                  />
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-on-surface-variant">
                {held
                  ? "בחרי תא בעמוד כדי להניח את המודעה, או גררי אותה לשם."
                  : "בחרי מודעה משובצת כדי לראות את פרטיה."}
              </p>
            )}

            {editable && selectedPage && model.pages.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                className="mt-3 w-full"
                disabled={pending}
                data-testid="remove-page"
                onClick={() =>
                  run(async () => {
                    const result = await removeIssuePageAction(model.issueId, selectedPage.id);
                    if (result.ok) setSelectedPageId(null);
                    return result;
                  })
                }
              >
                <Trash2 className="size-4" />
                הסרת {pageLabel(selectedPage.number, totalPages)}
              </Button>
            ) : null}

            {/* What may still be SOLD onto the page in front of you.
            "40% free" is not an offer anyone can make; "a quarter page and an
            eighth still fit" is — and a shape the page type refuses is worth
            seeing too, so nobody promises a customer a full page on the cover. */}
            <div className="mt-4 border-t border-outline-variant pt-3">
              <p className="mb-1 text-xs text-on-surface-variant">צורות מותרות בעמוד הפתוח</p>
              {(view?.pages ?? []).map((p) => {
                const full = model.pages.find((x) => x.id === p.id);
                const fill = fills.get(p.id);
                if (!full || !fill) return null;
                const fits = new Set(fill.fits.map((s) => s.id));
                return (
                  <div key={p.id} className="mb-2" data-testid={`allowed-shapes-${p.number}`}>
                    <p className="text-xs font-medium">
                      {pageLabel(p.number, totalPages)} · {full.pageTypeName}
                    </p>
                    <ShapeChips
                      shapes={full.allowedShapes}
                      fits={fits}
                      grid={model.grid}
                      testId={`allowed-shapes-list-${p.number}`}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {duplicateFor ? (
        <DuplicateDialog
          item={duplicateFor}
          onCancel={() => setDuplicateFor(null)}
          onApprove={() =>
            startTransition(async () => {
              const result = await approveDuplicateOverrideAction(
                model.issueId,
                duplicateFor.publicationId,
              );
              setDuplicateFor(null);
              if (result.message) setNotice({ text: result.message, ok: result.ok === true });
              if (result.ok) router.refresh();
            })
          }
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}

/**
 * FR-16's escape hatch, admin only.
 *
 * Deliberately not a silent retry: placing the same publication twice in one
 * issue is usually a mistake, and the times it is not are worth a decision and
 * an audit row.
 */
function DuplicateDialog({
  item,
  onApprove,
  onCancel,
}: {
  item: BoardCandidate;
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="אישור חריגת כפילות"
      data-testid="duplicate-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4"
    >
      <div className="w-full max-w-[500px] rounded-lg bg-surface-container-lowest p-5 shadow-elevation-2">
        <h2 className="mb-2 flex items-center gap-2 font-serif text-xl font-semibold">
          <AlertTriangle className="size-5 text-status-warning-fg" />
          הפרסום כבר משובץ בגיליון
        </h2>
        <p className="mb-4 text-sm text-on-surface-variant">
          הפרסום של <strong>{item.customerName}</strong> כבר מופיע בגיליון הזה. אישור החריגה יאפשר
          לשבץ אותו פעם נוספת, והפעולה תירשם ביומן הביקורת.
        </p>
        <div className="flex gap-2">
          <Button onClick={onApprove} data-testid="confirm-duplicate">
            אשר חריגה
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            ביטול
          </Button>
        </div>
      </div>
    </div>
  );
}
