// Safety module (P10). Applied AFTER the agent proposes a plan, as hard rules.
// This is cosmetic guidance only, NOT medical advice.

import type { AgentPlan, UserProfile } from "./types";

// Ingredients to avoid for specific states.
const PREGNANCY_AVOID = ["retinol", "retinoid", "salicylic acid", "benzoyl peroxide"];
// Safe swaps when an active must be excluded (e.g. pregnancy).
const SAFE_SUBSTITUTE: Record<string, string> = {
  retinol: "azelaic acid",
  retinoid: "azelaic acid",
  "salicylic acid": "azelaic acid",
  "benzoyl peroxide": "azelaic acid",
};
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
      "Since you're pregnant or breastfeeding, we left out retinoids, salicylic acid, and benzoyl peroxide. Azelaic acid, niacinamide, and vitamin C are gentler options. Check with your doctor before starting anything new."
    );
  }

  if (profile?.sensitive || profile?.skinType === "sensitive") {
    warnings.push(
      "Sensitive skin: patch-test any new active on your inner arm for 24h, and introduce one product at a time."
    );
  }

  // For an excluded ingredient, swap in a safe substitute; drop only if none.
  const substitute = (ing: string): string | null => {
    const key = ing.toLowerCase();
    if (!exclude.has(key)) return ing;
    const sub = SAFE_SUBSTITUTE[key];
    return sub && !exclude.has(sub) ? sub : null;
  };

  const fixSteps = (steps: typeof plan.routine.AM) =>
    steps
      .map((s) => {
        const sub = substitute(s.ingredient);
        if (sub === null) return null;
        return sub === s.ingredient
          ? s
          : { ...s, ingredient: sub, why: `${s.why} (pregnancy-safe alternative).` };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

  const safePlan: AgentPlan = {
    ...plan,
    routine: { AM: fixSteps(plan.routine.AM), PM: fixSteps(plan.routine.PM) },
    product_criteria: plan.product_criteria
      .map((c) => {
        const sub = substitute(c.ingredient);
        return sub === null ? null : { ...c, ingredient: sub };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null),
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

  // Re-sequence step numbers so no gaps remain after swaps/filters/SPF append.
  safePlan.routine.AM = safePlan.routine.AM.map((s, i) => ({ ...s, order: i + 1 }));
  safePlan.routine.PM = safePlan.routine.PM.map((s, i) => ({ ...s, order: i + 1 }));

  return { plan: safePlan, excludeIngredients: [...exclude], warnings };
}
