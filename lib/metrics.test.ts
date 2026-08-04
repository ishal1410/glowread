import { describe, it, expect } from "vitest";
import { badness, isAttribute, concernRow } from "./metrics";

describe("badness (metric polarity)", () => {
  it("treats concern metrics as higher = worse", () => {
    expect(badness("acne", 70)).toBe(70);
    expect(badness("pore", 20)).toBe(20);
  });

  it("inverts positive attributes so high = good = low badness", () => {
    expect(badness("firmness", 80)).toBe(20);
    expect(badness("radiance", 90)).toBe(10);
    expect(badness("hydration", 30)).toBe(70); // dry skin IS a concern
  });

  it("flags the positive attributes", () => {
    expect(isAttribute("firmness")).toBe(true);
    expect(isAttribute("radiance")).toBe(true);
    expect(isAttribute("acne")).toBe(false);
  });
});

describe("concernRow (what the breakdown bar renders)", () => {
  it("REGRESSION: the bar length always equals the number printed next to it", () => {
    // Previously the bar was sized on badness while the label showed ui_score,
    // so "Firmness 69" rendered a 31% bar.
    expect(concernRow("firmness", 69).fill).toBe(69);
    expect(concernRow("firmness", 69).value).toBe(69);
    expect(concernRow("texture", 59).fill).toBe(59);
    expect(concernRow("texture", 59).value).toBe(59);
  });

  it("colors by badness, so a high attribute reads as good and a high concern as bad", () => {
    expect(concernRow("firmness", 80).severity).toBe("low");   // firm skin = good
    expect(concernRow("hydration", 20).severity).toBe("high"); // dry skin = bad
    expect(concernRow("acne", 80).severity).toBe("high");
    expect(concernRow("acne", 10).severity).toBe("low");
  });

  it("marks attributes so a long green bar is not misread as a big problem", () => {
    expect(concernRow("radiance", 61).higherIsBetter).toBe(true);
    expect(concernRow("acne", 61).higherIsBetter).toBe(false);
  });

  it("clamps out-of-range scores to the bar's 0-100 track", () => {
    expect(concernRow("acne", 140).fill).toBe(100);
    expect(concernRow("acne", -20).fill).toBe(0);
  });
});
