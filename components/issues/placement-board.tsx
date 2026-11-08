"use client";

import { DesignerPackage } from "./designer-package";
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
  PanelRightOpen,
  LayoutGrid,
  Trash2,
  Wand2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  MoveHorizontal,
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
  sheetToRemove,
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
import { UnfinishedDialog, type UnfinishedRow } from "./unfinished-dialog";
import { counted } from "@/lib/domain/hebrew-count";
import { UnplacedPanel, type BoardCandidate } from "./unplaced-panel";
import { useFittedSpread } from "./use-fitted-spread";
import { largestThatFits, firstFit } from "@/lib/domain/auto-place";
import { TONE_LABELS } from "@/lib/domain/placement-tone";
import { IssueOverview } from "./issue-overview";
import {
  pushBounded,
  redoOp,
  undoOp,
  describeOp,
  type BoardOp,
  type HistoryActions,
  type Remap,
  type Spot,
} from "./board-history";

/** The zoom steps (08/11/2026). 1 = the whole spread fits the screen. */
const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3];

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
  /** The page types auto-placement may use — the newspaper's setting. */
  autoPlaceTypeNames: string[];
  /** "pageTypeId|shapeId" → list price — what free space on a page is worth. */
  prices: Record<string, number>;
  /** publicationId → the page number its order (or customer) asked for. */
  /** The designer's signed link (03/11/2026). */
  packagePath: string;
  /** Where each publication asked to be, resolved to this issue's pages. */
  positions: Record<string, { pages: number[]; label: string | null; note: string | null }>;
  /** Placements auto-placement made — the only ones "another arrangement" clears. */
  autoPlacedCount: number;
  newspaperId: string;
  /** May open the newspaper settings, where that is changed. */
  mayConfigure: boolean;
  pages: BoardPage[];
  placements: CanvasPlacement[];
  candidates: BoardCandidate[];
  /**
   * The page type each publication was SOLD for, by publication id. Placing it
   * on a page of another type is allowed — a designer may have a reason — but
   * never silently: the price was set by the type (orange, never red).
   */
  soldPageTypes: Record<string, { id: string; name: string }>;
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
  const [held, setHeldState] = useState<Held>(null);
  const heldRef = useRef<Held>(null);
  const setHeld = (next: Held | ((prev: Held) => Held)) => {
    const prev = heldRef.current;
    const value = typeof next === "function" ? next(prev) : next;
    heldRef.current = value;
    setHeldState(value);
    // A new thing in hand starts from no cell: the hover of the last one is
    // not where this one is — that is how a refusal stayed on screen over a
    // cell where the next ad fitted (habodek, 08/11/2026).
    if (value !== prev) setHover(null);
    if (!value || value.kind !== "placement") setAlsoSelected(new Set());
  };
  const [hover, setHover] = useState<{ pageId: string; cell: Cell } | null>(null);
  const hoverRef = useRef(hover);
  useEffect(() => {
    hoverRef.current = hover;
  }, [hover]);
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
  /**
   * The placement just made, offered back for one undo (redesign, 29/09/2026).
   *
   * It lives beside the notice row and never in it: a success leaves the row
   * empty on purpose (the board is clean after a good drop), and an undo is not
   * news about the drop — it is a way back from it. Cleared by the next act.
   */
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
      // Esc releases what is in hand first; only with nothing held does it
      // leave full screen (08/11/2026).
      if (e.key === "Escape") {
        if (heldRef.current) return;
        setFocus(false);
      } else if (
        (e.code === "KeyF" || e.key === "f" || e.key === "כ") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
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
   * Undo / redo (08/11/2026) — see board-history.ts. Replaces the single
   * "undo the last new placement" that could not take back a move.
   */
  const [undoStack, setUndoStack] = useState<BoardOp[]>([]);
  const [redoStack, setRedoStack] = useState<BoardOp[]>([]);
  const remap = useRef<Remap>(new Map());
  const record = (op: BoardOp) => {
    setUndoStack((s) => pushBounded(s, op));
    setRedoStack([]);
  };
  /** Zoom over the fitted size, and "fit the width" (08/11/2026). */
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(false);
  const zoomBy = (dir: 1 | -1) =>
    setZoom((z) => {
      const i = ZOOM_STEPS.indexOf(z);
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))]!;
      return next;
    });
  /** More placed ads moved or removed together with the one in hand (Shift+click). */
  const [alsoSelected, setAlsoSelected] = useState<Set<string>>(() => new Set());
  /** Shift held: placed ads stay clickable while something is in hand, to add them. */
  const [shiftDown, setShiftDown] = useState(false);

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

  /** Per page: the biggest shape still sellable there, and its list price (01/11/2026). */
  const freeSpace = useMemo(() => {
    const map = new Map<string, { shapeName: string; price: number | null } | null>();
    for (const page of model.pages) {
      const fit = largestThatFits(
        {
          pageId: page.id,
          pageNumber: page.number,
          allowedShapes: page.allowedShapes,
          occupied: [
            ...(placementsByPage.get(page.id) ?? []),
            ...page.reserved.map((area) => area.rect),
          ],
        },
        model.grid,
      );
      map.set(
        page.id,
        fit
          ? {
              shapeName: fit.shape.name,
              price: model.prices[`${page.pageTypeId}|${fit.shape.id}`] ?? null,
            }
          : null,
      );
    }
    return map;
  }, [model.pages, placementsByPage, model.grid, model.prices]);

  const unfinishedRows: UnfinishedRow[] = useMemo(
    () =>
      unfinished.map((f) => ({
        pageId: f.pageId,
        pageNumber: f.pageNumber,
        label: pageLabel(f.pageNumber, model.pages.length),
        pageType: model.pages.find((p) => p.id === f.pageId)?.pageTypeName ?? "",
        freePercent: 100 - f.percent,
        biggest: freeSpace.get(f.pageId) ?? null,
      })),
    [unfinished, model.pages, freeSpace],
  );

  // "כל הגיליון": every page small, side by side (01/11/2026).
  const [overview, setOverview] = useState(false);
  // The list of ads to place folds to a rail, so the page gets the width.
  const [listOpen, setListOpen] = useState(true);
  // Only what the packer could actually take: artwork present and usable.
  const unplacedCount = model.candidates.filter(
    (c) => !c.alreadyPlaced && c.blockedReason === null,
  ).length;
  // What a click on "שיבוץ אוטומטי" will actually place, and what it will
  // leave and why — said on the button, not discovered after (03/11/2026).
  const autoReady = model.candidates.filter(
    (c) => !c.alreadyPlaced && c.blockedReason === null && !c.manualOnly,
  ).length;
  const waitingForFile = model.candidates.filter(
    (c) => !c.alreadyPlaced && c.needsArtwork,
  ).length;
  const manualOnly = model.candidates.filter(
    (c) => !c.alreadyPlaced && c.blockedReason === null && c.manualOnly,
  ).length;
  const totalPages = model.pages.length;

  // Both halves of a spread, whole, without scrolling — see useFittedSpread.
  const { ref: spreadRef, size: fittedSize } = useFittedSpread(
    view?.pages.length ?? 1,
    model.grid.pageWidthMm / model.grid.pageHeightMm,
    fitWidth,
  );
  const pageSize = {
    width: Math.floor(fittedSize.width * zoom),
    height: Math.floor(fittedSize.height * zoom),
  };

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

  /** Allowed, but not where it was sold for — said in orange, blocks nothing. */
  const typeWarning: string | null = useMemo(() => {
    if (!candidate || !held || verdict) return null;
    const sold = model.soldPageTypes[held.publicationId];
    const page = model.pages.find((p) => p.id === candidate.pageId);
    if (!sold || !page || page.pageTypeId === sold.id) return null;
    return `הפרסום נמכר לעמוד ${sold.name}, וכאן העמוד הוא ${page.pageTypeName}. אפשר להניח אותו כאן — המחיר נקבע לפי ${sold.name}.`;
  }, [candidate, held, verdict, model.soldPageTypes, model.pages]);

  /**
   * Placing an ad where it was not ordered asks first (the user, 31/10/2026):
   * a page of another type than the one sold, a page number other than the
   * one asked for, or a page another order asked for too. Allowed — a
   * designer may have a reason — but never silently.
   */
  const [offOrder, setOffOrder] = useState<{
    pageId: string;
    cell: Cell;
    reasons: string[];
  } | null>(null);

  const customerOfPublication = (publicationId: string): string | undefined =>
    model.candidates.find((c) => c.publicationId === publicationId)?.customerId ??
    model.placements.find((p) => p.publicationId === publicationId)?.customerId;

  const offOrderReasons = (pageId: string): string[] => {
    if (!held) return [];
    const page = model.pages.find((p) => p.id === pageId);
    if (!page) return [];
    const reasons: string[] = [];
    const sold = model.soldPageTypes[held.publicationId];
    if (sold && page.pageTypeId !== sold.id) {
      reasons.push(`הפרסום הוזמן לעמוד ${sold.name}, והעמוד כאן הוא ${page.pageTypeName}.`);
    }
    const asked = model.positions[held.publicationId];
    const fixedHere = (id: string) => {
      const pages = model.positions[id]?.pages ?? [];
      return pages.length === 1 && pages[0] === page.number;
    };
    if (asked && asked.pages.length > 0 && !asked.pages.includes(page.number)) {
      reasons.push(`הלקוח ביקש ${asked.label ?? "מיקום אחר"}, וזה עמוד ${page.number}.`);
    }
    if (fixedHere(held.publicationId)) {
      const mine = customerOfPublication(held.publicationId);
      const rivals = model.placements.filter(
        (p) =>
          p.pageId === pageId &&
          p.publicationId !== held.publicationId &&
          fixedHere(p.publicationId) &&
          // Two ads of ONE customer on the page that customer asked for are
          // not competing for it (08/11/2026).
          !(mine && p.customerId === mine),
      );
      for (const r of rivals) {
        reasons.push(`גם ${r.customerName} ביקש את עמוד ${page.number}, והוא כבר משובץ כאן.`);
      }
    }
    return reasons;
  };

  const commit = (pageId: string, cell: Cell) => {
    if (!held || !editable) return;
    const reasons = offOrderReasons(pageId);
    if (reasons.length > 0) {
      setOffOrder({ pageId, cell, reasons });
      return;
    }
    doCommit(pageId, cell);
  };

  const actions: HistoryActions = {
    place: (publicationId, at) =>
      placeAdAction({ issueId: model.issueId, publicationId, ...at }),
    move: (placementId, to) => movePlacementAction({ issueId: model.issueId, placementId, ...to }),
    remove: (placementId) => removePlacementAction(model.issueId, placementId),
    auto: (seed) => autoPlaceIssueAction(model.issueId, seed),
  };

  const spotOf = (placementId: string): Spot | null => {
    const p = model.placements.find((x) => x.id === placementId);
    return p ? { pageId: p.pageId, col: p.col, row: p.row } : null;
  };
  const labelOf = (publicationId: string) =>
    model.candidates.find((c) => c.publicationId === publicationId)?.customerName ??
    model.placements.find((p) => p.publicationId === publicationId)?.customerName ??
    "";

  /** The next ad still waiting, in list order — picked up after a drop (08/11/2026). */
  const nextWaiting = (after: string): Held => {
    const waiting = model.candidates.filter(
      (c) => !c.alreadyPlaced && c.blockedReason === null && c.publicationId !== after,
    );
    const from = model.candidates.findIndex((c) => c.publicationId === after);
    const next =
      waiting.find((c) => model.candidates.indexOf(c) > from) ?? waiting[0] ?? null;
    return next ? { kind: "publication", publicationId: next.publicationId, shape: next.shape } : null;
  };

  const doCommit = (pageId: string, cell: Cell) => {
    if (!held || !editable) return;
    const inHand = held;
    const extras = [...alsoSelected];

    // The previous notice is NOT cleared here: an empty row while the round
    // trip runs reads as a message that was dismissed. Whatever the action
    // returns replaces it, and a success clears it explicitly below.
    startTransition(async () => {
      const at = { pageId, col: cell[0], row: cell[1] };
      if (inHand.kind === "publication") {
        const result = await actions.place(inHand.publicationId, at);
        if (result.ok && result.placementId) {
          setNotice(null);
          record({
            kind: "place",
            label: labelOf(inHand.publicationId),
            publicationId: inHand.publicationId,
            placementId: result.placementId,
            at,
          });
          // Straight on to the next one: ten ads were ~33 clicks, a third of
          // them re-picking from the list (habodek, 08/11/2026).
          setHeld(nextWaiting(inHand.publicationId));
          router.refresh();
          return;
        }
        fail(result.message ?? "לא הצלחנו לשבץ");
        // A refused duplicate is the one rejection with a way forward, and only
        // an admin has it (FR-16).
        if (model.isAdmin && result.message?.includes("כבר משובץ")) {
          setDuplicateFor(
            model.candidates.find((c) => c.publicationId === inHand.publicationId) ?? null,
          );
        }
        return;
      }

      // A move — of the ad in hand, and of any Shift-selected with it, keeping
      // their offsets from it. One gesture, one undo.
      const origin = spotOf(inHand.placementId);
      const result = await actions.move(inHand.placementId, at);
      if (!result.ok || !origin) {
        fail(result.message ?? "לא הצלחנו להעביר");
        return;
      }
      const ops: BoardOp[] = [
        {
          kind: "move",
          label: labelOf(inHand.publicationId),
          placementId: inHand.placementId,
          from: origin,
          to: at,
        },
      ];
      const missed: string[] = [];
      for (const id of extras) {
        const from = spotOf(id);
        if (!from) continue;
        const to = {
          pageId,
          col: at.col + (from.col - origin.col),
          row: at.row + (from.row - origin.row),
        };
        const r = await actions.move(id, to);
        const p = model.placements.find((x) => x.id === id);
        if (r.ok) ops.push({ kind: "move", label: p?.customerName ?? "", placementId: id, from, to });
        else missed.push(p?.customerName ?? "");
      }
      record(
        ops.length === 1
          ? ops[0]!
          : { kind: "group", label: `${ops.length} מודעות`, ops },
      );
      if (missed.length > 0) {
        fail(`לא הייתה כאן מקום ל: ${missed.join(", ")}. הן נשארו במקומן.`);
      } else {
        setNotice(null);
      }
      setHeld(null);
      router.refresh();
    });
  };

  /** Removes what is in hand (and the Shift-selected with it) — undoable, so no dialog. */
  const removeSelected = () => {
    if (!editable || held?.kind !== "placement") return;
    const ids = [held.placementId, ...alsoSelected];
    startTransition(async () => {
      const ops: BoardOp[] = [];
      for (const id of ids) {
        const p = model.placements.find((x) => x.id === id);
        if (!p) continue;
        const r = await actions.remove(id);
        if (!r.ok) {
          fail(r.message ?? "לא הצלחנו להסיר");
          break;
        }
        ops.push({
          kind: "remove",
          label: p.customerName,
          publicationId: p.publicationId,
          placementId: id,
          at: { pageId: p.pageId, col: p.col, row: p.row },
        });
      }
      if (ops.length > 0) {
        record(ops.length === 1 ? ops[0]! : { kind: "group", label: `${ops.length} מודעות`, ops });
        say(
          ops.length === 1
            ? `המודעה של ${ops[0]!.label} הוסרה מהעמוד — Ctrl+Z מחזיר אותה`
            : `${ops.length} מודעות הוסרו מהעמוד — Ctrl+Z מחזיר אותן`,
        );
      }
      setHeld(null);
      router.refresh();
    });
  };

  const undo = () => {
    const op = undoStack[undoStack.length - 1];
    if (!op || !editable || pending) return;
    startTransition(async () => {
      const r = await undoOp(op, actions, remap.current);
      if ("error" in r) {
        fail(r.error);
        return;
      }
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((s) => pushBounded(s, r.redo));
      setHeld(null);
      say(`בוטל: ${describeOp(op)}`);
      router.refresh();
    });
  };

  const redo = () => {
    const op = redoStack[redoStack.length - 1];
    if (!op || !editable || pending) return;
    startTransition(async () => {
      const r = await redoOp(op, actions, remap.current);
      if ("error" in r) {
        fail(r.error);
        return;
      }
      setRedoStack((s) => s.slice(0, -1));
      setUndoStack((s) => pushBounded(s, r.undo));
      setHeld(null);
      say(`בוצע שוב: ${describeOp(op)}`);
      router.refresh();
    });
  };

  /** Auto-placement, recorded so it can be taken back in one step. */
  const runAuto = () =>
    startTransition(async () => {
      const result = await autoPlaceIssueAction(model.issueId, layoutSeed);
      if (!result.ok) {
        fail(result.message ?? "הפעולה נכשלה");
        return;
      }
      if (result.placementIds && result.placementIds.length > 0) {
        record({
          kind: "auto",
          label: "שיבוץ אוטומטי",
          placementIds: result.placementIds,
          seed: layoutSeed,
        });
      }
      setHeld(null);
      if (result.message) say(result.message);
      router.refresh();
    });

  /**
   * The board's keys (08/11/2026). `code` before `key` wherever a letter is
   * involved, so a Hebrew keyboard works the same: Z types "ז", and "/" is on
   * the key that types "." in Hebrew.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftDown(e.type === "keydown");
      if (e.type !== "keydown") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // A dialog owns the keyboard while it is open.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && (e.code === "KeyZ" || e.key.toLowerCase() === "z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (e.code === "KeyY" || e.key.toLowerCase() === "y")) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && (e.code === "Equal" || e.code === "NumpadAdd" || e.key === "+" || e.key === "=")) {
        e.preventDefault();
        zoomBy(1);
        return;
      }
      if (mod && (e.code === "Minus" || e.code === "NumpadSubtract" || e.key === "-")) {
        e.preventDefault();
        zoomBy(-1);
        return;
      }
      if (mod && (e.code === "Digit0" || e.code === "Numpad0")) {
        e.preventDefault();
        setZoom(1);
        return;
      }
      if (mod || e.altKey) return;

      if (e.key === "PageDown") {
        e.preventDefault();
        setViewIndex((i) => Math.min(views.length - 1, i + 1));
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        setViewIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.code === "Slash" || e.key === "/") {
        const search = document.getElementById("board-search");
        if (search) {
          e.preventDefault();
          search.focus();
        }
        return;
      }

      const inHand = heldRef.current;
      if (!inHand) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setHeld(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && inHand.kind === "placement") {
        e.preventDefault();
        removeSelected();
        return;
      }
      const arrows: Record<string, [number, number]> = {
        // RTL: column 0 is on the right, so → walks towards it.
        ArrowRight: [-1, 0],
        ArrowLeft: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const step = arrows[e.key];
      if (step) {
        e.preventDefault();
        const n = e.shiftKey ? 2 : 1;
        setHover((h) => {
          const start =
            h ??
            (inHand.kind === "placement"
              ? (() => {
                  const sp = spotOf(inHand.placementId);
                  return sp ? { pageId: sp.pageId, cell: [sp.col, sp.row] as Cell } : null;
                })()
              : view?.pages[0]
                ? { pageId: view.pages[0].id, cell: [0, 0] as Cell }
                : null);
          if (!start) return h;
          const maxCol = Math.max(0, model.grid.columns - inHand.shape.cols);
          const maxRow = Math.max(0, model.grid.rows - inHand.shape.rows);
          const col = Math.min(maxCol, Math.max(0, start.cell[0] + step[0] * n));
          const row = Math.min(maxRow, Math.max(0, start.cell[1] + step[1] * n));
          return { pageId: start.pageId, cell: [col, row] };
        });
        return;
      }
      if (e.key === "Enter") {
        const h = hoverRef.current;
        if (h) {
          e.preventDefault();
          commit(h.pageId, h.cell);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  });

  const selectedPlacement =
    held?.kind === "placement"
      ? model.placements.find((p) => p.id === held.placementId)
      : undefined;
  const selectedPage =
    model.pages.find((p) => p.id === (selectedPlacement?.pageId ?? selectedPageId)) ??
    view?.pages[0];
  // Which pages "remove" takes from here — a whole sheet (sheetToRemove).
  const removal = selectedPage ? sheetToRemove(totalPages, selectedPage.number) : null;
  const removalFirst = removal?.ok ? removal.pageNumbers[0]! : 0;
  const removalLast = removal?.ok ? removal.pageNumbers[removal.pageNumbers.length - 1]! : 0;

  const run = (action: () => Promise<{ ok?: boolean; message?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setHeld(null);
        router.refresh();
      }
      // A message on success is worth showing too — that is where the packer
      // reports how many ads it placed and how many pages it had to open.
      else if (!result.ok) fail(result.message ?? "הפעולה נכשלה");
      if (result.ok && result.message) say(result.message);
    });

  /**
   * Where this ad would best go (03/11/2026: "המערכת תדע איפה אפשר לשבץ ותנסה
   * לשייך לשם"): the pages it asked for first, then the rest in order — only
   * pages of the type it was sold for and that take its shape — and on each
   * the first place it fits. A suggestion, not a decision: "לשבץ כאן" still
   * goes through every rule a drop does.
   */
  const suggestFor = (publicationId: string, shape: ShapeSpec) => {
    const asked = model.positions[publicationId]?.pages ?? [];
    const sold = model.soldPageTypes[publicationId];
    const rank = (n: number) => {
      const i = asked.indexOf(n);
      return i < 0 ? asked.length : i;
    };
    const ordered = model.pages
      .filter(
        (p) =>
          p.allowedShapes.some((s) => s.id === shape.id) && (!sold || p.pageTypeId === sold.id),
      )
      .sort((a, b) => rank(a.number) - rank(b.number) || a.number - b.number);
    for (const page of ordered) {
      const occupied = [
        ...(placementsByPage.get(page.id) ?? []),
        ...page.reserved.map((area) => area.rect),
      ];
      const rect = firstFit(
        shape,
        {
          pageId: page.id,
          pageNumber: page.number,
          allowedShapes: page.allowedShapes,
          occupied,
        },
        model.grid,
        occupied,
      );
      if (rect) {
        return {
          pageId: page.id,
          pageNumber: page.number,
          rect,
          asAsked: asked.length === 0 || asked.includes(page.number),
        };
      }
    }
    return null;
  };
  const heldIsWaiting =
    held?.kind === "publication" &&
    !model.candidates.find((c) => c.publicationId === held.publicationId)?.alreadyPlaced;
  const suggestion =
    held?.kind === "publication" && heldIsWaiting
      ? suggestFor(held.publicationId, held.shape)
      : null;

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
        {/* "טיוטה" and "בעבודה" are both "open for placing" — the pill beside
            this says that — and the issue moves from one to the other by itself
            on its first placement. Only the states that change what can be
            done are named here (the user, 03/11/2026). */}
        {model.status === "ready_for_print" || model.status === "closed" ? (
          <Badge tone={ISSUE_TONE[model.status]} data-testid="board-status">
            {ISSUE_STATUS_LABELS[model.status]}
          </Badge>
        ) : null}
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
              .filter((to) => to !== "closed" && to !== "draft" && model.status !== "closed")
              // draft → in_layout happens on the first placement.
              .filter((to) => !(model.status === "draft" && to === "in_layout"))
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
                  {to === "in_layout" ? "החזרה לשיבוץ" : ISSUE_STATUS_LABELS[to]}
                </Button>
              ))}
            {/* Its place is kept from the start (08/11/2026): it used to appear
                only after the first placement and push the buttons beside it
                115px along — under the pointer. */}
            {model.status === "draft" ? (
              <Button
                size="sm"
                variant="secondary"
                disabled
                data-testid="set-status-ready-placeholder"
                title="אפשר לסמן מוכן להדפסה אחרי שמשבצים מודעה ראשונה"
              >
                {ISSUE_STATUS_LABELS.ready_for_print}
              </Button>
            ) : null}
            <Button asChild size="sm" data-testid="go-to-check">
              <Link href={`/issues/${model.issueId}/validate`}>
                <ClipboardCheck className="size-4" />
                {model.status === "closed" ? "בדיקה ו־PDF" : "בדיקה וסגירה"}
              </Link>
            </Button>
            {editable && autoReady > 0 ? (
              <Button
                size="sm"
                variant="gold"
                disabled={pending}
                data-testid="auto-place-header"
                title={[
                  `ישובצו ${autoReady} מודעות שמוכנות לשיבוץ, במקום הראשון שמתאים לבקשה שלהן.`,
                  waitingForFile > 0 ? `${waitingForFile} עדיין בלי קובץ — יחכו.` : "",
                  manualOnly > 0 ? `${manualOnly} של לקוחות שמשובצים ביד — יחכו.` : "",
                  "אפשר ללחוץ שוב בכל פעם שמגיעים קבצים חדשים.",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={runAuto}
              >
                <Wand2 className="size-4" aria-hidden />
                שיבוץ אוטומטי
                <span className="rounded-full bg-surface-container-lowest px-1.5 text-xs text-on-surface">
                  <Ltr>{autoReady}</Ltr>
                </span>
              </Button>
            ) : null}
            <DesignerPackage issueId={model.issueId} sharePath={model.packagePath} />
          </>
        ) : null}

        {/* Wraps on a phone: zoom, overview and full screen together are wider
            than 375px, and the whole page scrolled sideways (habodek 08/11). */}
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {overview ? null : (
            <span
              className="flex items-center rounded-lg border border-outline-variant"
              data-testid="board-zoom"
            >
              <button
                type="button"
                aria-label="הקטנה"
                title="הקטנה — Ctrl+−"
                disabled={zoom <= ZOOM_STEPS[0]!}
                onClick={() => zoomBy(-1)}
                className="flex size-8 items-center justify-center hover:bg-surface-container disabled:opacity-40"
              >
                <ZoomOut className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                data-testid="zoom-reset"
                title="חזרה לגודל שנכנס במסך — Ctrl+0"
                onClick={() => {
                  setZoom(1);
                  setFitWidth(false);
                }}
                className="h-8 min-w-12 px-1 text-xs hover:bg-surface-container"
              >
                <Ltr>{Math.round(zoom * 100)}%</Ltr>
              </button>
              <button
                type="button"
                aria-label="הגדלה"
                title="הגדלה — Ctrl+="
                data-testid="zoom-in"
                disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!}
                onClick={() => zoomBy(1)}
                className="flex size-8 items-center justify-center hover:bg-surface-container disabled:opacity-40"
              >
                <ZoomIn className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-pressed={fitWidth}
                data-testid="zoom-fit-width"
                title="התאמה לרוחב: העמוד ממלא את הרוחב, וגוללים למטה"
                onClick={() => setFitWidth((f) => !f)}
                className={cn(
                  "flex h-8 items-center gap-1 border-s border-outline-variant px-2 text-xs hover:bg-surface-container",
                  fitWidth && "bg-surface-container font-semibold",
                )}
              >
                <MoveHorizontal className="size-4" aria-hidden />
                לרוחב
              </button>
            </span>
          )}
          <Button
            size="sm"
            variant={overview ? "primary" : "secondary"}
            data-testid="board-overview"
            aria-pressed={overview}
            onClick={() => setOverview((o) => !o)}
          >
            <LayoutGrid className="size-4" aria-hidden />
            {overview ? "חזרה לעמוד" : "כל הגיליון"}
          </Button>
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
          // One row that fills the screen only where the columns sit side by
          // side. Below xl they stack, and squeezing a stack into one row drew
          // the list over the page (habodek at 375, 08/11/2026) — there the
          // stack scrolls instead.
          "grid min-h-0 flex-1 gap-3 max-xl:auto-rows-max max-xl:overflow-y-auto xl:[grid-template-rows:minmax(0,1fr)]",
          focus
            ? listOpen
              ? "xl:grid-cols-[16rem_1fr_9rem]"
              : "xl:grid-cols-[2.75rem_1fr_9rem]"
            : detailsOpen
              ? listOpen
                ? "xl:grid-cols-[16rem_1fr_9rem_17rem]"
                : "xl:grid-cols-[2.75rem_1fr_9rem_17rem]"
              : listOpen
                ? "xl:grid-cols-[16rem_1fr_9rem_2.75rem]"
                : "xl:grid-cols-[2.75rem_1fr_9rem_2.75rem]",
        )}
      >
        {listOpen ? null : (
          <button
            type="button"
            data-testid="list-expand"
            onClick={() => setListOpen(true)}
            aria-label="פתיחת רשימת הפרסומים"
            className="hidden h-full flex-col items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest py-3 text-xs font-medium text-on-surface-variant hover:bg-surface-container xl:flex"
          >
            <PanelRightOpen className="size-4" aria-hidden />
            {/* Horizontal, short: a rotated label is not read (08/11/2026). */}
            <span className="text-[11px] leading-4">לשיבוץ</span>
            <span className="rounded-full bg-surface-container px-1.5 text-[11px]">
              <Ltr>{unplacedCount}</Ltr>
            </span>
          </button>
        )}
        <div className={cn("relative h-full min-h-0", !listOpen && "xl:hidden")}>
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
            onCollapse={() => setListOpen(false)}
            onPick={(item) => {
              const dropping =
                held?.kind === "publication" && held.publicationId === item.publicationId;
              setHeld(
                dropping
                  ? null
                  : { kind: "publication", publicationId: item.publicationId, shape: item.shape },
              );
              // No jump: the board stays on the page being looked at. The
              // suggestion is marked there when it is there, and the bar
              // below offers "לשבץ כאן" / "הצגה" for anywhere else.
            }}
          />
        </div>

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
          <div
            className={cn(
              "relative mb-2 h-14 shrink-0",
              // The undo button sits over the end of this row; the text leaves
              // it room rather than running under it (08/11/2026).
              undoStack.length + redoStack.length > 0 &&
                !held &&
                editable &&
                "[&>p]:pe-[19rem]",
            )}
          >
            {undoStack.length + redoStack.length > 0 && !held && editable ? (
              /* Pinned to the end of the reserved row, above whatever the row
                 holds: it takes no height, so nothing under it moves. Undo
                 names what it will take back (08/11/2026). */
              <span className="absolute end-2 top-2 z-10 flex items-center gap-1">
                {undoStack.length > 0 ? (
                  <button
                    type="button"
                    data-testid="undo-placement"
                    onClick={undo}
                    disabled={pending}
                    title={`ביטול: ${describeOp(undoStack[undoStack.length - 1]!)}`}
                    className="flex h-9 max-w-72 items-center gap-2 rounded-lg bg-primary-container px-3 text-sm font-medium text-inverse-on-surface shadow-elevation-1 hover:bg-primary disabled:opacity-60"
                  >
                    <Undo2 className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">
                      ביטול {describeOp(undoStack[undoStack.length - 1]!)}
                    </span>
                    <kbd
                      className="rounded bg-inverse-on-surface/15 px-1.5 font-sans text-xs"
                      dir="ltr"
                    >
                      Ctrl+Z
                    </kbd>
                  </button>
                ) : null}
                {redoStack.length > 0 ? (
                  <button
                    type="button"
                    data-testid="redo-placement"
                    onClick={redo}
                    disabled={pending}
                    aria-label={`חזרה על ${describeOp(redoStack[redoStack.length - 1]!)}`}
                    title={`חזרה על ${describeOp(redoStack[redoStack.length - 1]!)} — Ctrl+Shift+Z`}
                    className="flex size-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest shadow-elevation-1 hover:bg-surface-container disabled:opacity-60"
                  >
                    <Redo2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </span>
            ) : null}
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
            ) : held && typeWarning ? (
              <p
                role="status"
                data-testid="board-message"
                data-kind="type-warning"
                className="absolute inset-0 flex items-start gap-2 overflow-y-auto rounded-lg bg-status-warning-bg p-2 text-sm text-status-warning-fg"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{typeWarning}</span>
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
                    className="flex min-w-0 items-center gap-1.5 overflow-hidden text-on-surface-variant"
                  >
                    · עדיין יש מקום למכור ב־<Ltr>{unfinished.length}</Ltr>{" "}
                    {unfinished.length === 1 ? "עמוד" : "עמודים"}
                    <UnfinishedDialog rows={unfinishedRows} onJump={jumpToPage} />
                  </span>
                ) : null}
              </p>
            ) : unfinished.length > 0 ? (
              <p
                data-testid="unfinished-alert"
                className="absolute inset-0 flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg bg-status-warning-bg p-2 text-sm text-status-warning-fg"
              >
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  עדיין יש מקום למכור ב־<Ltr>{unfinished.length}</Ltr>{" "}
                  {unfinished.length === 1 ? "עמוד" : "עמודים"}
                </span>
                <UnfinishedDialog rows={unfinishedRows} onJump={jumpToPage} />
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
            {overview ? (
              <IssueOverview
                views={views}
                grid={model.grid}
                totalPages={totalPages}
                placementsByPage={placementsByPage}
                reservedByPage={new Map(model.pages.map((p) => [p.id, p.reserved]))}
                fills={fills}
                holding={Boolean(held)}
                refusesPage={(pageId) => {
                  const full = model.pages.find((p) => p.id === pageId);
                  return Boolean(
                    held && full && !full.allowedShapes.some((x) => x.id === held.shape.id),
                  );
                }}
                onPageClick={(pageId) => {
                  const full = model.pages.find((p) => p.id === pageId);
                  if (!full) return;
                  if (!held) {
                    jumpToPage(pageId);
                    setOverview(false);
                    return;
                  }
                  // The first place it fits, under the auto-placer's own rules;
                  // the commit then goes through every rule a drop does.
                  const occupied = [
                    ...(placementsByPage.get(pageId) ?? []).filter(
                      (p) => !(held.kind === "placement" && p.id === held.placementId),
                    ),
                    ...full.reserved.map((area) => area.rect),
                  ];
                  const rect = firstFit(
                    held.shape,
                    {
                      pageId,
                      pageNumber: full.number,
                      allowedShapes: full.allowedShapes,
                      occupied,
                    },
                    model.grid,
                    occupied,
                  );
                  if (!rect) {
                    fail(`אין מקום ל${held.shape.name} ב${pageLabel(full.number, totalPages)}`);
                    return;
                  }
                  commit(pageId, [rect.col, rect.row]);
                }}
              />
            ) : (
              <div
                ref={spreadRef}
                dir="rtl"
                data-testid="spread"
                data-zoom={zoom}
                className={cn(
                  "flex h-full w-full items-start gap-2",
                  // Zoomed in, the page is bigger than the room: it scrolls
                  // inside this box, never the board around it.
                  zoom > 1 || fitWidth ? "overflow-auto" : "justify-center",
                )}
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
                      // Anything in hand — a placed ad being moved too. With only
                      // a NEW ad counted, a click meant as "put it here" on
                      // another placed ad picked THAT one up instead, silently
                      // (habodek, 08/11/2026). Shift keeps them clickable, to
                      // add them to the selection.
                      holding={Boolean(held) && !shiftDown}
                      alsoSelectedIds={alsoSelected}
                      refusesHeld={
                        held && !full.allowedShapes.some((s) => s.id === held.shape.id)
                          ? held.shape.name
                          : null
                      }
                      candidate={candidate?.pageId === page.id ? candidate : null}
                      suggested={
                        !candidate && suggestion?.pageId === page.id ? suggestion.rect : null
                      }
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
                      onPlacementPick={(placement, additive) => {
                        // Shift+click: one more ad moved or removed with the one
                        // in hand (08/11/2026).
                        if (additive && held?.kind === "placement" && editable) {
                          if (placement.id === held.placementId) return;
                          setAlsoSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(placement.id)) next.delete(placement.id);
                            else next.add(placement.id);
                            return next;
                          });
                          return;
                        }
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
                      freeSpace={freeSpace.get(page.id) ?? null}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Under the page as well (the user, 31/10/2026): where the eye is
              after looking at the page, next/previous and "go to page N".
              Fixed height, so it never pushes the canvas while aiming. */}
          <nav
            aria-label="מעבר בין עמודים"
            data-testid="board-bottom-nav"
            // Fixed height kept; on a phone the row scrolls inside itself
            // rather than widening the page (habodek at 375, 08/11/2026).
            className="flex h-11 shrink-0 items-center justify-start gap-2 overflow-x-auto pt-2 sm:justify-center"
          >
            {held?.kind === "publication" && heldIsWaiting && editable ? (
              <span
                data-testid="suggestion-bar"
                className="me-auto flex min-w-0 items-center gap-2 rounded-full bg-status-accent-bg px-3 py-1 text-xs"
              >
                {suggestion ? (
                  <>
                    <span className="truncate">
                      מקום מוצע: {pageLabel(suggestion.pageNumber, totalPages)}
                      {suggestion.asAsked ? "" : " (העמוד שביקשו מלא)"}
                    </span>
                    <Button
                      size="sm"
                      className="h-7"
                      disabled={pending}
                      data-testid="suggest-place"
                      onClick={() =>
                        commit(suggestion.pageId, [suggestion.rect.col, suggestion.rect.row])
                      }
                    >
                      לשבץ כאן
                    </Button>
                    <button
                      type="button"
                      className="shrink-0 underline"
                      onClick={() => jumpToPage(suggestion.pageId)}
                    >
                      הצגה
                    </button>
                  </>
                ) : (
                  <span className="truncate" data-testid="suggest-none">
                    {(() => {
                      const sold = model.soldPageTypes[held.publicationId];
                      const hasType = !sold || model.pages.some((p) => p.pageTypeId === sold.id);
                      return hasType
                        ? "אין מקום פנוי לגודל הזה בעמודים המתאימים — אפשר להוסיף עמוד"
                        : `בגיליון אין עמוד מסוג "${sold!.name}" שהמודעה נמכרה אליו — אפשר להוסיף עמוד כזה`;
                    })()}
                  </span>
                )}
              </span>
            ) : null}
            <span
              data-testid="tone-legend"
              className={cn(
                "me-auto hidden items-center gap-3 text-[11px] text-on-surface-variant xl:flex",
                held?.kind === "publication" && "xl:hidden",
              )}
            >
              {(["ready", "attention", "problem"] as const).map((t) => (
                <span key={t} className="flex items-center gap-1">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 rounded-sm border-2",
                      t === "ready"
                        ? "border-status-success-fg"
                        : t === "attention"
                          ? "border-status-warning-fg"
                          : "border-status-error-fg",
                    )}
                  />
                  {TONE_LABELS[t]}
                </span>
              ))}
            </span>
            <Button
              size="sm"
              variant="secondary"
              data-testid="bottom-prev"
              disabled={viewIndex === 0}
              onClick={() => setViewIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronRight className="size-4" aria-hidden />
              הקודם
            </Button>
            <span className="min-w-20 text-center text-xs text-on-surface-variant">
              {view?.label ?? "—"} ·{" "}
              <Ltr>
                {views.length === 0 ? 0 : viewIndex + 1}/{views.length}
              </Ltr>
            </span>
            <Button
              size="sm"
              variant="secondary"
              data-testid="bottom-next"
              disabled={viewIndex >= views.length - 1}
              onClick={() => setViewIndex((i) => Math.min(views.length - 1, i + 1))}
            >
              הבא
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <form
              className="ms-4 hidden items-center gap-1.5 sm:flex"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(new FormData(e.currentTarget).get("page"));
                const target = model.pages.find((p) => p.number === n);
                if (target) {
                  jumpToPage(target.id);
                  setNotice(null);
                } else {
                  setNotice({
                    text: `אין עמוד ${n || ""} בגיליון הזה — יש ${totalPages} עמודים`,
                    ok: false,
                  });
                }
              }}
            >
              <label htmlFor="go-to-page" className="text-xs text-on-surface-variant">
                מעבר לעמוד
              </label>
              <input
                id="go-to-page"
                name="page"
                inputMode="numeric"
                dir="ltr"
                data-testid="go-to-page"
                className="h-8 w-14 rounded-md border border-outline-variant bg-surface-container px-2 text-center text-sm"
              />
              <Button type="submit" size="sm" variant="ghost" data-testid="go-to-page-submit">
                מעבר
              </Button>
            </form>
          </nav>
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

          {editable && (autoReady > 0 || model.placements.length > 0) ? (
            <div className="flex shrink-0 flex-col gap-1.5">
              {autoReady > 0 ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    data-testid="auto-place"
                    className="h-auto w-full whitespace-normal py-1.5 leading-4"
                    // Where it may place, and what it adds, are the newspaper's
                    // settings per page type — no question on every click.
                    onClick={runAuto}
                  >
                    <Wand2 className="size-4" />
                    <span>שיבוץ אוטומטי</span>
                    <span className="rounded-full bg-surface-container-lowest px-1.5 text-xs">
                      <Ltr>{autoReady}</Ltr>
                    </span>
                  </Button>
                  <span
                    className="text-[11px] leading-4 text-on-surface-variant"
                    data-testid="auto-place-scope"
                  >
                    בעמודי {model.autoPlaceTypeNames.join(", ") || "—"}. עמודים יתווספו לפי הצורך.
                    {waitingForFile > 0 ? ` ${waitingForFile} עדיין בלי קובץ ויחכו.` : ""}
                    {manualOnly > 0 ? ` ${manualOnly} לשיבוץ ידני בלבד.` : ""}
                    {model.mayConfigure ? (
                      <>
                        {" "}
                        <Link
                          href={`/settings/newspapers/${model.newspaperId}`}
                          className="underline"
                        >
                          שינוי
                        </Link>
                      </>
                    ) : null}
                  </span>
                </>
              ) : null}

              {/* "Another arrangement" clears what auto-placement put down and
                packs again — the only thing it could honestly mean once
                everything is already placed. Hand-placed ads, and ads a person
                moved, stay where they are (the user, 31/10/2026). */}
              {model.autoPlacedCount > 0 ? (
                <ConfirmDialog
                  testId="reshuffle"
                  trigger={
                    <Button size="sm" variant="ghost" data-testid="auto-place-reshuffle">
                      סידור אחר
                    </Button>
                  }
                  title="לסדר מחדש את מה ששובץ אוטומטית?"
                  body={`${
                    model.autoPlacedCount === 1
                      ? "השיבוץ האוטומטי היחיד יוסר"
                      : `${model.autoPlacedCount} השיבוצים האוטומטיים יוסרו`
                  }, והמערכת תסדר אותם מחדש בפריסה אחרת. ${
                    model.placements.length > model.autoPlacedCount
                      ? "מודעות ששובצו או הוזזו ביד נשארות במקומן."
                      : ""
                  }`}
                  confirmLabel="סדר מחדש"
                  pendingLabel="מסדר…"
                  onConfirm={async () => {
                    const next = layoutSeed + 1;
                    setLayoutSeed(next);
                    const result = await autoPlaceIssueAction(model.issueId, next, true);
                    if (result.ok) {
                      // What the history pointed at was just cleared away.
                      setUndoStack([]);
                      setRedoStack([]);
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
            aria-label="פתיחת פרטים וצורות"
            title="פרטים וצורות מותרות"
            onClick={() => setDetailsOpen(true)}
            className="flex h-full flex-col items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest py-3 text-xs font-medium text-on-surface-variant shadow-elevation-1 hover:bg-surface-container"
          >
            <PanelLeftOpen className="size-4" aria-hidden />
            <span className="text-[11px] leading-4">פרטים</span>
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
                        record({
                          kind: "remove",
                          label: selectedPlacement.customerName,
                          publicationId: selectedPlacement.publicationId,
                          placementId: selectedPlacement.id,
                          at: {
                            pageId: selectedPlacement.pageId,
                            col: selectedPlacement.col,
                            row: selectedPlacement.row,
                          },
                        });
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

            {/* A whole sheet, never one page (user, 08/11/2026): four inner
                pages from the selected one, the cover and the back never.
                The label names the pages so nobody is surprised by four. */}
            {editable && selectedPage && removal && !removal.ok ? (
              <p className="mt-3 text-xs text-on-surface-variant" data-testid="remove-page-refused">
                {removal.message}
              </p>
            ) : null}
            {editable && selectedPage && removal?.ok ? (
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
                {removalFirst === removalLast ? (
                  <>
                    הסרת עמוד <Ltr>{removalFirst}</Ltr>
                  </>
                ) : (
                  <>
                    הסרת עמודים{" "}
                    <Ltr>
                      {removalFirst}–{removalLast}
                    </Ltr>
                  </>
                )}
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

      {offOrder ? (
        <OffOrderDialog
          reasons={offOrder.reasons}
          onCancel={() => setOffOrder(null)}
          onConfirm={() => {
            const { pageId, cell } = offOrder;
            setOffOrder(null);
            doCommit(pageId, cell);
          }}
        />
      ) : null}
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
/** "Not where it was ordered — place anyway?" Focus starts on cancel. */
function OffOrderDialog({
  reasons,
  onConfirm,
  onCancel,
}: {
  reasons: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="שיבוץ שלא לפי ההזמנה"
      data-testid="off-order-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="w-full max-w-[500px] rounded-lg bg-surface-container-lowest p-5 shadow-elevation-2">
        <h2 className="mb-2 flex items-center gap-2 font-serif text-xl font-semibold">
          <AlertTriangle className="size-5 text-status-warning-fg" />
          לשבץ כאן, לא לפי ההזמנה?
        </h2>
        <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-on-surface-variant">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button onClick={onConfirm} data-testid="confirm-off-order">
            כן, לשבץ כאן
          </Button>
          <Button variant="ghost" onClick={onCancel} autoFocus data-testid="cancel-off-order">
            ביטול
          </Button>
        </div>
      </div>
    </div>
  );
}

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

/** How many "room to sell" pages the one-line strip names before "+N" (08/11/2026). */

