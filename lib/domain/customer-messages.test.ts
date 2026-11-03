import { describe, expect, it } from "vitest";
import {
  fillTemplate,
  fileShapeWords,
  misfitAdvice,
  priceDeltaPhrase,
  recommendShape,
  sizeCm,
  type ShapeOption,
} from "./customer-messages";

const quarter: ShapeOption = { id: "q", name: "רבע עמוד", widthMm: 120, heightMm: 170, price: 500 };
const strip: ShapeOption = { id: "s", name: "רצועה", widthMm: 250, heightMm: 60, price: 400 };
const half: ShapeOption = { id: "h", name: "חצי עמוד", widthMm: 250, heightMm: 170, price: 900 };
const noPrice: ShapeOption = { id: "n", name: "מיוחד", widthMm: 250, heightMm: 62, price: null };

describe("the size that fits the file", () => {
  it("picks the closest proportion among the other sizes", () => {
    // A wide file sent for a portrait quarter: the strip fits it.
    expect(recommendShape({ width: 2500, height: 600 }, [quarter, strip, half], "q")?.id).toBe("s");
  });
  it("never recommends a size without a price, or the one already bought", () => {
    expect(recommendShape({ width: 2500, height: 620 }, [noPrice, quarter], "q")).toBeNull();
    expect(recommendShape({ width: 120, height: 170 }, [quarter], "q")).toBeNull();
  });
  it("says nothing when no size fits", () => {
    expect(recommendShape({ width: 100, height: 1000 }, [strip, half], "q")).toBeNull();
  });
});

describe("the message", () => {
  it("fills known fields and leaves typos visible", () => {
    expect(fillTemplate("שלום {לקוח}, {טעות}", { לקוח: "דני" })).toBe("שלום דני, {טעות}");
  });
  it("says sizes in centimetres and the file's shape in words", () => {
    expect(sizeCm({ widthMm: 120, heightMm: 170 })).toBe('12.0 × 17.0 ס"מ');
    expect(fileShapeWords({ width: 3, height: 1 })).toBe("לרוחב");
    expect(fileShapeWords({ width: 1, height: 3 })).toBe("לאורך");
  });
  it("prices the change both ways", () => {
    expect(priceDeltaPhrase(500, 900)).toContain("תוספת של");
    expect(priceDeltaPhrase(500, 400)).toContain("זול ב־");
    expect(priceDeltaPhrase(500, 500)).toBe("באותו מחיר");
  });
  it("offers both ways out when a size fits, and a new file when none does", () => {
    const both = misfitAdvice(quarter, strip, 500);
    expect(both).toContain("לשלוח קובץ חדש במידות 12.0 × 17.0");
    expect(both).toContain("לשנות את ההזמנה לרצועה");
    expect(misfitAdvice(quarter, null, 500)).toBe('נשמח לקבל קובץ חדש במידות 12.0 × 17.0 ס"מ.');
  });
});
