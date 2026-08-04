// Scores -> the response the UI renders. Extracted from the route so BOTH the
// single-shot demo path and the polled live path produce byte-identical results
// (plan, safety gate, product match) instead of each re-implementing the chain.

import { buildPlanFromScores } from "./agent";
import { applySafety } from "./safety";
import { matchProducts } from "./products";
import type { SkinScores, UserProfile, AnalyzeResult } from "./types";

export function buildAnalyzeResult(scores: SkinScores, profile?: UserProfile): AnalyzeResult {
  // 1) Deterministic plan (LLM narration is cosmetic and lives on /api/narrate).
  const rawPlan = buildPlanFromScores(scores);

  // 2) Safety gate — hard rules applied AFTER the plan is proposed.
  const { plan, excludeIngredients, warnings } = applySafety(rawPlan, profile);
  plan.cautions = [...plan.cautions, ...warnings];

  // 3) Deterministic product match against the real catalog.
  const products = matchProducts(plan.product_criteria, profile?.budget, excludeIngredients);

  return { scores, plan, products, profile };
}
