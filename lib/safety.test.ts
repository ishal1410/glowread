import { describe, it, expect } from "vitest";
import { applySafety } from "./safety";
import { buildPlanFromScores } from "./agent";
import { buildAnalyzeResult } from "./analyzeResult";
import type { SkinScores, ConcernScore, AgentPlan } from "./types";

function cs(key: string, raw: number): ConcernScore {
  return { key, label: key, raw_score: raw, ui_score: raw };
}
function scores(concerns: ConcernScore[]): SkinScores {
  return { concerns, skinAge: 40, healthScore: 60, source: "mock" };
}

describe("applySafety", () => {
  it("excludes retinoids for pregnancy and substitutes a safe active (no empty treatment)", () => {
    // wrinkle worst -> primary PM active is retinol
    const base = buildPlanFromScores(scores([cs("wrinkle", 80), cs("spot", 40), cs("pore", 30)]));
    const { plan, excludeIngredients } = applySafety(base, { pregnant: true });

    const allIngredients = [...plan.routine.AM, ...plan.routine.PM].map((s) => s.ingredient.toLowerCase());
    expect(allIngredients).not.toContain("retinol");
    expect(excludeIngredients).toContain("retinol");
    // The PM treatment is swapped, not dropped: there is still a treatment step.
    expect(plan.routine.PM.some((s) => s.product_type === "Treatment")).toBe(true);
  });

  it("always guarantees SPF in the morning routine", () => {
    const base = buildPlanFromScores(scores([cs("acne", 60)]));
    const { plan } = applySafety(base, {});
    expect(plan.routine.AM.some((s) => s.ingredient.toLowerCase() === "spf")).toBe(true);
  });

  it("re-sequences step numbers with no gaps after filtering/append", () => {
    const base = buildPlanFromScores(scores([cs("wrinkle", 75), cs("acne", 55)]));
    const { plan } = applySafety(base, { pregnant: true });
    const amOrders = plan.routine.AM.map((s) => s.order);
    const pmOrders = plan.routine.PM.map((s) => s.order);
    expect(amOrders).toEqual([...Array(amOrders.length).keys()].map((i) => i + 1));
    expect(pmOrders).toEqual([...Array(pmOrders.length).keys()].map((i) => i + 1));
  });

  it("warns when conflicting actives land in the same slot", () => {
    const plan: AgentPlan = {
      headline: "x",
      top_concerns: [],
      routine: {
        AM: [],
        PM: [
          { order: 1, product_type: "Treatment", ingredient: "retinol", why: "" },
          { order: 2, product_type: "Exfoliant", ingredient: "glycolic acid", why: "" },
        ],
      },
      product_criteria: [],
      cautions: [],
      source: "mock",
    };
    const { warnings } = applySafety(plan, {});
    expect(warnings.some((w) => w.includes("retinol") && w.includes("glycolic acid"))).toBe(true);
  });
});

describe("REGRESSION: pregnancy substitution must not duplicate an ingredient", () => {
  it("collapses two actives that share one safe substitute into a single step", () => {
    // retinol (wrinkle) and salicylic acid (acne) both map to azelaic acid.
    const result = buildAnalyzeResult(
      { concerns: [
          { key: "wrinkle", label: "wrinkle", raw_score: 75, ui_score: 75 },
          { key: "acne", label: "acne", raw_score: 55, ui_score: 55 },
        ], skinAge: 30, healthScore: 70, source: "mock" },
      { pregnant: true }
    );
    const pm = result.plan.routine.PM.map((s) => s.ingredient);
    expect(pm).toEqual([...new Set(pm)]);

    const crit = result.plan.product_criteria.map((c) => c.ingredient);
    expect(crit).toEqual([...new Set(crit)]);
  });
});
