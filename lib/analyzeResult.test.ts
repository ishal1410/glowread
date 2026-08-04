import { describe, test, expect } from "vitest";
import { buildAnalyzeResult } from "./analyzeResult";
import { getMockScores } from "./mockSkin";

describe("buildAnalyzeResult", () => {
  test("turns scores into a plan, a safe routine and matched products", () => {
    const r = buildAnalyzeResult(getMockScores("balanced"));
    expect(r.scores.concerns.length).toBeGreaterThan(0);
    expect(r.plan.top_concerns).toHaveLength(3);
    expect(r.plan.routine.AM.length).toBeGreaterThan(0);
    expect(r.products.length).toBeGreaterThan(0);
  });

  test("always ends the morning routine with SPF", () => {
    const r = buildAnalyzeResult(getMockScores("mature_dry"));
    expect(r.plan.routine.AM.some((s) => s.ingredient === "spf")).toBe(true);
  });

  test("applies the pregnancy gate to routine, criteria AND products", () => {
    const r = buildAnalyzeResult(getMockScores("mature_dry"), { pregnant: true });
    const banned = ["retinol", "retinoid", "salicylic acid", "benzoyl peroxide"];
    const routine = [...r.plan.routine.AM, ...r.plan.routine.PM].map((s) => s.ingredient);
    expect(routine.filter((i) => banned.includes(i))).toEqual([]);
    expect(r.plan.product_criteria.filter((c) => banned.includes(c.ingredient))).toEqual([]);
    expect(r.products.filter((p) => p.key_ingredients.some((i) => banned.includes(i.toLowerCase())))).toEqual([]);
    expect(r.plan.cautions.join(" ")).toMatch(/pregnan/i);
  });

  test("echoes the profile back so the client can show what was applied", () => {
    const r = buildAnalyzeResult(getMockScores("balanced"), { budget: 12 });
    expect(r.profile).toEqual({ budget: 12 });
  });

  test("is deterministic for the same input", () => {
    const a = buildAnalyzeResult(getMockScores("oily_acne"), { skinType: "oily" });
    const b = buildAnalyzeResult(getMockScores("oily_acne"), { skinType: "oily" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
