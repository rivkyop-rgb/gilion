import { describe, expect, it } from "vitest";

import {
  CURRENT_REQUIRED,
  NO_MATCH,
  SAME_AS_OLD,
  TOO_SHORT,
  validateNewPassword,
  validatePasswordChange,
} from "./password";

const fields = (errors: { field: string }[]) => errors.map((e) => e.field);
const messages = (errors: { message: string }[]) => errors.map((e) => e.message);

describe("validateNewPassword", () => {
  it("accepts a long enough password that was typed twice", () => {
    expect(validateNewPassword("gilion1234", "gilion1234")).toEqual([]);
  });

  it("refuses one that is too short", () => {
    expect(messages(validateNewPassword("short", "short"))).toEqual([TOO_SHORT]);
  });

  it("refuses a confirmation that does not match", () => {
    expect(messages(validateNewPassword("gilion1234", "gilion12345"))).toEqual([NO_MATCH]);
  });

  it("says one thing about a short password, not two", () => {
    // The confirmation of a value that was already refused would be a second
    // red line about the same typing.
    expect(fields(validateNewPassword("abc", "xyz"))).toEqual(["next"]);
  });

  it("refuses an empty password", () => {
    expect(messages(validateNewPassword("", ""))).toEqual([TOO_SHORT]);
  });
});

describe("validatePasswordChange", () => {
  const ok = { current: "gilion1234", next: "gilion5678", confirm: "gilion5678" };

  it("accepts a real change", () => {
    expect(validatePasswordChange(ok)).toEqual([]);
  });

  it("requires the current password", () => {
    expect(messages(validatePasswordChange({ ...ok, current: "" }))).toContain(CURRENT_REQUIRED);
  });

  it("refuses a new password identical to the current one", () => {
    const same = { current: "gilion1234", next: "gilion1234", confirm: "gilion1234" };
    expect(messages(validatePasswordChange(same))).toEqual([SAME_AS_OLD]);
  });

  it("does not add 'same as old' on top of 'too short'", () => {
    const short = { current: "abc", next: "abc", confirm: "abc" };
    expect(messages(validatePasswordChange(short))).toEqual([TOO_SHORT]);
  });

  it("reports the missing current password and the mismatch together", () => {
    // Two different fields, two different problems — both are real, and the
    // person should not have to fix them one round trip at a time.
    const bad = { current: "", next: "gilion5678", confirm: "gilion9999" };
    expect(fields(validatePasswordChange(bad))).toEqual(["current", "confirm"]);
  });
});
