/**
 * The board's undo and redo (08/11/2026).
 *
 * Until now Ctrl+Z took back only the last NEW placement, and a move, a
 * removal or an auto-placement could not be taken back at all — the habodek
 * run moved an ad, pressed Ctrl+Z, and nothing happened. Every competitor's
 * flat plan has a real history (Naviga Plan: Ctrl+Z / Ctrl+Shift+Z).
 *
 * The history lives in the browser and replays through the SAME server
 * actions a person's own clicks use, so every rule a drop checks is checked
 * again on the way back. It is per board visit, not stored: undoing yesterday's
 * work is not what anybody means by Ctrl+Z.
 *
 * Placement ids are not stable across an undo — taking back a removal places
 * the ad again under a NEW id — so every op names placements by the id they
 * had when recorded, and `remap` follows them to whatever they are now.
 */

export type Spot = { pageId: string; col: number; row: number };

export type BoardOp =
  | { kind: "place"; label: string; publicationId: string; placementId: string; at: Spot }
  | { kind: "move"; label: string; placementId: string; from: Spot; to: Spot }
  | { kind: "remove"; label: string; publicationId: string; placementId: string; at: Spot }
  | { kind: "auto"; label: string; placementIds: string[]; seed: number }
  /** Several placements moved or removed in one gesture (multi-select). */
  | { kind: "group"; label: string; ops: BoardOp[] };

export const HISTORY_LIMIT = 20;

export type HistoryActions = {
  place: (publicationId: string, at: Spot) => Promise<{ ok?: boolean; message?: string; placementId?: string }>;
  move: (placementId: string, to: Spot) => Promise<{ ok?: boolean; message?: string }>;
  remove: (placementId: string) => Promise<{ ok?: boolean; message?: string }>;
  auto: (seed: number) => Promise<{ ok?: boolean; message?: string; placementIds?: string[] }>;
};

/** Ids that changed under an undo or redo, old → new. */
export type Remap = Map<string, string>;

const follow = (remap: Remap, id: string) => {
  let current = id;
  for (let i = 0; i < 50 && remap.has(current); i++) current = remap.get(current)!;
  return current;
};

/**
 * Runs the inverse of `op`. Returns the op as it must be recorded for REDO —
 * with any new ids the server handed back — or an error message.
 */
export async function undoOp(
  op: BoardOp,
  run: HistoryActions,
  remap: Remap,
): Promise<{ redo: BoardOp } | { error: string }> {
  switch (op.kind) {
    case "place": {
      const r = await run.remove(follow(remap, op.placementId));
      return r.ok ? { redo: op } : { error: r.message ?? "לא הצלחנו לבטל" };
    }
    case "move": {
      const r = await run.move(follow(remap, op.placementId), op.from);
      return r.ok ? { redo: op } : { error: r.message ?? "לא הצלחנו לבטל" };
    }
    case "remove": {
      const r = await run.place(op.publicationId, op.at);
      if (!r.ok || !r.placementId) return { error: r.message ?? "לא הצלחנו לבטל" };
      remap.set(follow(remap, op.placementId), r.placementId);
      return { redo: op };
    }
    case "auto": {
      for (const id of op.placementIds) {
        const r = await run.remove(follow(remap, id));
        if (!r.ok) return { error: r.message ?? "לא הצלחנו לבטל את השיבוץ האוטומטי" };
      }
      return { redo: op };
    }
    case "group": {
      // Backwards: the last thing done is the first undone.
      for (const inner of [...op.ops].reverse()) {
        const r = await undoOp(inner, run, remap);
        if ("error" in r) return r;
      }
      return { redo: op };
    }
  }
}

/** Runs `op` again. Returns the op as it must be recorded for UNDO. */
export async function redoOp(
  op: BoardOp,
  run: HistoryActions,
  remap: Remap,
): Promise<{ undo: BoardOp } | { error: string }> {
  switch (op.kind) {
    case "place": {
      const r = await run.place(op.publicationId, op.at);
      if (!r.ok || !r.placementId) return { error: r.message ?? "לא הצלחנו לחזור על הפעולה" };
      remap.set(follow(remap, op.placementId), r.placementId);
      return { undo: op };
    }
    case "move": {
      const r = await run.move(follow(remap, op.placementId), op.to);
      return r.ok ? { undo: op } : { error: r.message ?? "לא הצלחנו לחזור על הפעולה" };
    }
    case "remove": {
      const r = await run.remove(follow(remap, op.placementId));
      return r.ok ? { undo: op } : { error: r.message ?? "לא הצלחנו לחזור על הפעולה" };
    }
    case "auto": {
      // The same seed gives the same arrangement, so this is the same run.
      const r = await run.auto(op.seed);
      if (!r.ok) return { error: r.message ?? "לא הצלחנו לחזור על הפעולה" };
      return { undo: { ...op, placementIds: r.placementIds ?? [] } };
    }
    case "group": {
      for (const inner of op.ops) {
        const r = await redoOp(inner, run, remap);
        if ("error" in r) return r;
      }
      return { undo: op };
    }
  }
}

/** Pushes onto a bounded stack. */
export function pushBounded<T>(stack: T[], item: T): T[] {
  const next = [...stack, item];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/** "הזזה של מאפיית הלחם" — what the notice says was undone or redone. */
export function describeOp(op: BoardOp): string {
  switch (op.kind) {
    case "place":
      return `שיבוץ ${op.label}`;
    case "move":
      return `הזזה של ${op.label}`;
    case "remove":
      return `הסרה של ${op.label}`;
    case "auto":
      return "השיבוץ האוטומטי";
    case "group":
      return op.label;
  }
}
