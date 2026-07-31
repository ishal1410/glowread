import { describe, it, expect } from "vitest";
import { buildPlanFromScores } from "./agent";
import type { SkinScores, ConcernScore } from "./types";

function cs(key: string, raw: number): ConcernScore {
  return { key, label: key, raw_score: raw, ui_score: raw };
}

function scores(concerns: ConcernScore[]): SkinScores {
  return { concerns, skinAge: 30, healthScore: 70, source: "mock" };
}

describe("buildPlanFromScores", () => {
  it("REGRESSION: never flags healthy attributes (high firmness/radiance) as top concerns", () => {
    const s = scores([
      cs("firmness", 85),   // good skin -> must NOT be a top concern
      cs("radiance", 80),   // good skin -> must NOT be a top concern
      cs("texture", 70),    // real concern
      cs("acne", 60),       // real concern
      cs("pore", 50),       // real concern
      cs("redness", 10),
    ]);
    const plan = buildPlanFromScores(s);
    const topKeys = plan.top_concerns.map((c) => c.concern);
    expect(topKeys).toEqual(["texture", "acne", "pore"]);
    expect(topKeys).not.toContain("firmness");
    expect(topKeys).not.toContain("radiance");
  });

  it("surfaces low hydration as a concern (attribute deficit)", () => {
    const s = scores([cs("hydration", 20), cs("acne", 15), cs("pore", 10)]);
    const plan = buildPlanFromScores(s);
    expect(plan.top_concerns[0].concern).toBe("hydration");
  });

  it("returns a safe minimal plan when analysis has no concerns", () => {
    const plan = buildPlanFromScores(scores([]));
    expect(plan.top_concerns).toHaveLength(0);
    expect(plan.headline.length).toBeGreaterThan(0);
    expect(plan.product_criteria.some((c) => c.ingredient === "spf")).toBe(true);
    expect(plan.routine.AM.length).toBeGreaterThan(0);
  });

  it("derives product criteria from the top concerns", () => {
    const plan = buildPlanFromScores(scores([cs("acne", 70), cs("pore", 40)]));
    const ingredients = plan.product_criteria.map((c) => c.ingredient);
    expect(ingredients).toContain("salicylic acid");
  });
});
