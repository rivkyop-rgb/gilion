import { describe, expect, it } from "vitest";

import {
  afterReplace,
  afterRevert,
  canRevert,
  NothingToRevertError,
  orphanedByReplace,
  type AdFileKeys,
} from "./ad-version";

const fresh = (): AdFileKeys => ({
  fileUrl: "biz/ads/ad1/original.pdf",
  originalFileUrl: "biz/ads/ad1/original.pdf",
  previousFileUrl: null,
});

describe("afterReplace", () => {
  it("moves the live file to previous and installs the new one", () => {
    const next = afterReplace(fresh(), "biz/ads/ad1/current-1.pdf");
    expect(next.fileUrl).toBe("biz/ads/ad1/current-1.pdf");
    expect(next.previousFileUrl).toBe("biz/ads/ad1/original.pdf");
  });

  it("keeps exactly ONE previous version across three replacements", () => {
    let keys = fresh();
    keys = afterReplace(keys, "v1");
    keys = afterReplace(keys, "v2");
    keys = afterReplace(keys, "v3");

    expect(keys.fileUrl).toBe("v3");
    // v1 is gone. US-005 AC-5 allows one step back, not a history.
    expect(keys.previousFileUrl).toBe("v2");
  });

  it("never touches the original, however many times the file is replaced", () => {
    let keys = fresh();
    for (const v of ["v1", "v2", "v3", "v4"]) keys = afterReplace(keys, v);
    // AC-3, the rule that outranks every tidiness argument.
    expect(keys.originalFileUrl).toBe("biz/ads/ad1/original.pdf");
  });
});

describe("orphanedByReplace", () => {
  it("has nothing to delete on a first replacement", () => {
    expect(orphanedByReplace(fresh())).toBeNull();
  });

  it("refuses to orphan the original even when it is the previous version", () => {
    const afterOne = afterReplace(fresh(), "v1");
    expect(afterOne.previousFileUrl).toBe("biz/ads/ad1/original.pdf");
    expect(orphanedByReplace(afterOne)).toBeNull();
  });

  it("returns the version that actually falls off the end", () => {
    let keys = fresh();
    keys = afterReplace(keys, "v1");
    keys = afterReplace(keys, "v2");
    // v1 is about to stop being reachable, so it is the one to delete.
    expect(orphanedByReplace(keys)).toBe("v1");
  });
});

describe("afterRevert", () => {
  it("swaps live and previous, so the revert is itself revertible once", () => {
    const keys = afterReplace(fresh(), "v1");
    const reverted = afterRevert(keys);
    expect(reverted.fileUrl).toBe("biz/ads/ad1/original.pdf");
    expect(reverted.previousFileUrl).toBe("v1");
    expect(afterRevert(reverted).fileUrl).toBe("v1");
  });

  it("leaves the original alone", () => {
    const reverted = afterRevert(afterReplace(fresh(), "v1"));
    expect(reverted.originalFileUrl).toBe("biz/ads/ad1/original.pdf");
  });

  it("refuses when there is nothing to go back to", () => {
    expect(() => afterRevert(fresh())).toThrow(NothingToRevertError);
  });
});

describe("canRevert", () => {
  it("is false before the first replacement and true after it", () => {
    expect(canRevert(fresh())).toBe(false);
    expect(canRevert(afterReplace(fresh(), "v1"))).toBe(true);
  });
});
