import { describe, expect, it } from "vitest";
import {
  availableEvents,
  canDeleteOrder,
  canTransition,
  completionBlockedMessage,
  completionFollows,
  InvalidTransitionError,
  itemsEditable,
  ORDER_EVENTS,
  ORDER_STATUSES,
  orderDeletionBlocked,
  transition,
  type OrderEvent,
  type OrderStatus,
} from "./order-status";

/**
 * The expected matrix is written out independently of the implementation,
 * transcribed from conventions.md §3. If the two disagree one of them is a bug
 * — that is the point of duplicating it.
 */
const EXPECTED: Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>> = {
  draft: { SUBMIT: "pending_approval", CANCEL: "canceled" },
  pending_approval: { APPROVE: "approved", REJECT: "rejected", CANCEL: "canceled" },
  approved: { COMPLETE: "completed", CANCEL: "canceled" },
  rejected: { CANCEL: "canceled" },
  canceled: {},
  completed: { REOPEN: "approved" },
};

describe("every state × event pair is decided, not left to chance", () => {
  for (const from of ORDER_STATUSES) {
    for (const event of ORDER_EVENTS) {
      const expected = EXPECTED[from][event];
      it(`${from} + ${event} → ${expected ?? "refused"}`, () => {
        if (expected) {
          expect(transition(from, event)).toBe(expected);
        } else {
          expect(() => transition(from, event)).toThrow(InvalidTransitionError);
        }
      });
    }
  }
});

describe("approved is one-way (rule 8)", () => {
  it("cannot go back to a draft", () => {
    expect(canTransition("approved", "SUBMIT")).toBe(false);
  });

  it("cannot be re-approved", () => {
    expect(canTransition("approved", "APPROVE")).toBe(false);
  });

  it("cannot be rejected after the fact — publications already exist", () => {
    expect(() => transition("approved", "REJECT")).toThrow(
      "לא ניתן לבצע REJECT על הזמנה במצב approved",
    );
  });

  it("can still be cancelled, which is a forward move", () => {
    expect(transition("approved", "CANCEL")).toBe("canceled");
  });
});

describe("terminal states", () => {
  it("completed accepts nothing but the derived walk-back — not even cancel", () => {
    expect(availableEvents("completed")).toEqual(["REOPEN"]);
  });

  it("canceled accepts nothing", () => {
    expect(availableEvents("canceled")).toEqual([]);
  });
});

describe("the full happy path", () => {
  it("walks draft → pending_approval → approved → completed", () => {
    let status: OrderStatus = "draft";
    status = transition(status, "SUBMIT");
    expect(status).toBe("pending_approval");
    status = transition(status, "APPROVE");
    expect(status).toBe("approved");
    status = transition(status, "COMPLETE");
    expect(status).toBe("completed");
  });
});

describe("line items are editable only before anything binding exists (rule 6)", () => {
  it.each(["draft", "pending_approval"] as const)("%s is editable", (s) => {
    expect(itemsEditable(s)).toBe(true);
  });

  it.each(["approved", "rejected", "canceled", "completed"] as const)("%s is locked", (s) => {
    expect(itemsEditable(s)).toBe(false);
  });
});

describe("completion is blocked while publications are still live (rule 9)", () => {
  it("allows completion when every publication has run or been cancelled", () => {
    expect(completionBlockedMessage(["published", "canceled", "published"])).toBeNull();
  });

  it("allows completion for an order with no publications at all", () => {
    expect(completionBlockedMessage([])).toBeNull();
  });

  it("blocks and counts the ones still in flight", () => {
    const msg = completionBlockedMessage(["published", "placed", "missing_ad"])!;
    expect(msg).toContain("2");
  });

  it.each(["missing_ad", "ad_received", "ready_for_layout", "placed"])(
    "%s counts as still active",
    (s) => {
      expect(completionBlockedMessage([s])).not.toBeNull();
    },
  );
});

describe("orderDeletionBlocked", () => {
  it("allows deleting an order that never produced anything binding", () => {
    for (const status of ["draft", "rejected", "canceled"] as const) {
      expect(orderDeletionBlocked(status, 0)).toBeNull();
      expect(canDeleteOrder(status, 0)).toBe(true);
    }
  });

  it("refuses to delete an order that has publications, whatever its status", () => {
    // The cancelled-after-approval case: status says "cancelled" but real
    // publications exist behind it, possibly already placed in an issue.
    expect(canDeleteOrder("canceled", 3)).toBe(false);
    expect(orderDeletionBlocked("canceled", 3)).toContain("3");
  });

  it("refuses to delete a live order even with no publications yet", () => {
    expect(canDeleteOrder("pending_approval", 0)).toBe(false);
    expect(canDeleteOrder("approved", 0)).toBe(false);
    expect(canDeleteOrder("completed", 0)).toBe(false);
  });
});

describe("completion follows the publications", () => {
  it("completes an approved order once every publication ran or was cancelled", () => {
    expect(completionFollows("approved", ["published", "canceled"])).toBe("completed");
  });
  it("leaves it approved while anything is still in flight", () => {
    expect(completionFollows("approved", ["published", "placed"])).toBeNull();
  });
  it("never completes an order with no publications", () => {
    expect(completionFollows("approved", [])).toBeNull();
  });
  it("walks a completed order back when an issue is reopened", () => {
    expect(completionFollows("completed", ["placed"])).toBe("approved");
  });
  it("does not touch drafts or cancelled orders", () => {
    expect(completionFollows("draft", ["published"])).toBeNull();
    expect(completionFollows("canceled", ["published"])).toBeNull();
  });
});
