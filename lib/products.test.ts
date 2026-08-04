import { describe, it, expect } from "vitest";
import { matchProducts } from "./products";
import type { ProductCriterion } from "./types";

const crit = (concern: string, ingredient: string): ProductCriterion => ({ concern, ingredient, category: "Serum" });

describe("matchProducts", () => {
  it("matches products by ingredient and reports what they target", () => {
    const out = matchProducts([crit("acne", "salicylic acid")]);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => p.key_ingredients.map((i) => i.toLowerCase()).includes("salicylic acid"))).toBe(true);
    expect(out[0].matchedFor).toContain("acne");
  });

  it("never drops sunscreen for being over budget", () => {
    const out = matchProducts([crit("sun", "spf")], 5); // cheapest SPF is well over $5
    expect(out.some((p) => p.key_ingredients.includes("spf"))).toBe(true);
  });

  it("falls back to unbudgeted results instead of an empty grid", () => {
    const out = matchProducts([crit("firmness", "peptides")], 1);
    expect(out.length).toBeGreaterThan(0);
  });

  it("respects excluded ingredients (e.g. pregnancy)", () => {
    const out = matchProducts(
      [crit("wrinkle", "retinol"), crit("acne", "salicylic acid")],
      undefined,
      ["retinol", "salicylic acid", "benzoyl peroxide"]
    );
    const banned = ["retinol", "salicylic acid", "benzoyl peroxide"];
    expect(out.every((p) => !p.key_ingredients.some((i) => banned.includes(i.toLowerCase())))).toBe(true);
  });

  it("REGRESSION: a budget that only leaves the always-shown sunscreen falls back to the full catalog", () => {
    // $1 budget: every real match is filtered out, and only the SPF bypass
    // survives — which is itself over budget. Showing that alone is worse than
    // showing the (clearly priced) unbudgeted list.
    const out = matchProducts([crit("oiliness", "niacinamide"), crit("acne", "salicylic acid")], 1);
    const nonSunscreen = out.filter((p) => p.category !== "Sunscreen");
    expect(nonSunscreen.length).toBeGreaterThan(0);
  });

  it("keeps a real budget working when affordable matches exist", () => {
    const out = matchProducts([crit("oiliness", "niacinamide")], 10);
    const overBudget = out.filter((p) => p.category !== "Sunscreen" && p.price > 10);
    expect(overBudget).toHaveLength(0);
    expect(out.length).toBeGreaterThan(0);
  });

  it("is deterministic (stable order across calls)", () => {
    const a = matchProducts([crit("oiliness", "niacinamide")]).map((p) => p.id);
    const b = matchProducts([crit("oiliness", "niacinamide")]).map((p) => p.id);
    expect(a).toEqual(b);
  });
});
