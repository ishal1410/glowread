// Safety module (P10). Applied AFTER the agent proposes a plan, as hard rules.
// This is cosmetic guidance only, NOT medical advice.

import type { AgentPlan, UserProfile } from "./types";

// Ingredients to avoid for specific states.
const PREGNANCY_AVOID = ["retinol", "retinoid", "salicylic acid", "benzoyl peroxide"];
// Actives that should not be layered together in the same routine slot.
const CONFLICTS: [string, string][] = [
  ["retinol", "glycolic acid"],
  ["retinol", "salicylic acid"],
  ["retinol", "benzoyl peroxide"],
  ["benzoyl peroxide", "vitamin c"],
];

export interface SafetyResult {
  plan: AgentPlan;
  excludeIngredients: string[];
  warnings: string[];
}

export function applySafety(plan: AgentPlan, profile?: UserProfile): SafetyResult {
  const warnings: string[] = [];
  const exclude = new Set<string>();

  if (profile?.pregnant) {
    for (const ing of PREGNANCY_AVOID) exclude.add(ing);
    warnings.push(
      "You indicated pregnancy/breastfeeding: retinoids, salicylic acid, and benzoyl peroxide are excluded. Azelaic acid, niacinamide, and vitamin C are gentler alternatives — confirm with your doctor."
    );
  }

  if (profile?.sensitive || profile?.skinType === "sensitive") {
    warnings.push(
      "Sensitive skin: patch-test any new active on your inner arm for 24h, and introduce one product at a time."
    );
  }

  // Strip excluded ingredients from routine + criteria.
  const clean = (ing: string) => !exclude.has(ing.toLowerCase());
  const safePlan: AgentPlan = {
    ...plan,
    routine: {
      AM: plan.routine.AM.filter((s) => clean(s.ingredient)),
      PM: plan.routine.PM.filter((s) => clean(s.ingredient)),
    },
    product_criteria: plan.product_criteria.filter((c) => clean(c.ingredient)),
  };

  // Detect conflicting actives within the same slot; warn + note to alternate.
  for (const slot of ["AM", "PM"] as const) {
    const ings = safePlan.routine[slot].map((s) => s.ingredient.toLowerCase());
    for (const [a, b] of CONFLICTS) {
      if (ings.includes(a) && ings.includes(b)) {
        warnings.push(
          `Avoid using ${a} and ${b} together (${slot}). Alternate nights or use them in separate routines to prevent irritation.`
        );
      }
    }
  }

  // Always ensure SPF is present in AM.
  const hasSpf = safePlan.routine.AM.some((s) => s.ingredient.toLowerCase() === "spf");
  if (!hasSpf) {
    safePlan.routine.AM.push({
      order: safePlan.routine.AM.length + 1,
      product_type: "Sunscreen",
      ingredient: "spf",
      why: "Daily broad-spectrum SPF is the single most effective anti-aging and protection step.",
    });
    safePlan.product_criteria.push({ concern: "sun", ingredient: "spf", category: "Sunscreen" });
  }

  return { plan: safePlan, excludeIngredients: [...exclude], warnings };
}
