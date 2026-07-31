import { describe, it, expect } from "vitest";
import { badness, isAttribute } from "./metrics";

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
