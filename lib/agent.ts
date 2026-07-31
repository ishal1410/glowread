// The agent. Design: a DETERMINISTIC core always produces a valid, safe plan
// (guarantees schema + explainability for judges/interviews). An optional LLM
// layer (Gemini free, or Claude) rewrites the wording more naturally. If the LLM
// is absent or returns bad output, we fall back to the deterministic plan (P16).

import type { SkinScores, UserProfile, AgentPlan, TopConcern, RoutineStep, ProductCriterion, Severity } from "./types";
import { CONCERN_INGREDIENTS } from "./products";

const EXPLANATIONS: Record<string, string> = {
  wrinkle: "Fine lines are showing where skin moves and folds most. Consistent moisture and cell-turnover support help soften them over time.",
  firmness: "Skin is looking a little less bouncy than it could. Ingredients that support collagen can help it feel firmer.",
  pore: "Pores look more visible, often tied to oil and buildup. Regular gentle clearing keeps them looking tighter.",
  texture: "Surface feels uneven. Gentle exfoliation smooths and refreshes the look.",
  acne: "There's some breakout activity. Targeted clearing ingredients calm and prevent new spots.",
  spot: "A few darker marks stand out. Brightening ingredients help fade them gradually.",
  pigmentation: "Uneven tone is the main story here. Brightening and daily SPF even things out over weeks.",
  redness: "Skin reads a bit reactive/flushed. Calming, barrier-friendly ingredients settle it down.",
  hydration: "Skin is thirsty. Layering water-binding ingredients restores plumpness and glow.",
  oiliness: "Skin runs oily, especially midday. Oil-balancing ingredients reduce shine without stripping.",
  dark_circle: "The under-eye area looks shadowed/puffy. Depuffing and brightening help it look more rested.",
  radiance: "Skin could look more lit-from-within. Antioxidants and gentle exfoliation bring back glow.",
};

function severityOf(raw: number): Severity {
  if (raw >= 55) return "high";
  if (raw >= 35) return "moderate";
  return "low";
}

// Concern metrics: higher raw = worse. Pick the worst as "top concerns".
export function buildPlanFromScores(scores: SkinScores, profile?: UserProfile): AgentPlan {
  const ranked = [...scores.concerns].sort((a, b) => b.raw_score - a.raw_score);
  const top = ranked.slice(0, 3);

  const top_concerns: TopConcern[] = top.map((c) => ({
    concern: c.key,
    label: c.label,
    severity: severityOf(c.raw_score),
    explanation: EXPLANATIONS[c.key] ?? `${c.label} is worth some focused care.`,
  }));

  // Product criteria: each top concern -> its primary ingredient(s).
  const product_criteria: ProductCriterion[] = [];
  const seen = new Set<string>();
  for (const c of top) {
    const ings = CONCERN_INGREDIENTS[c.key] ?? [];
    for (const ing of ings.slice(0, 2)) {
      const k = `${c.key}:${ing}`;
      if (seen.has(k)) continue;
      seen.add(k);
      product_criteria.push({ concern: c.key, ingredient: ing, category: "Serum", maxPrice: profile?.budget });
    }
  }

  // Build a simple, safe routine from the strongest concern's active.
  const primary = top[0];
  const primaryActive = (CONCERN_INGREDIENTS[primary.key] ?? ["niacinamide"])[0];
  const brightening = top.some((c) => ["spot", "pigmentation", "radiance"].includes(c.key));

  const AM: RoutineStep[] = [
    { order: 1, product_type: "Cleanser", ingredient: "glycerin", why: "Start clean without stripping the barrier." },
    ...(brightening ? [{ order: 2, product_type: "Serum", ingredient: "vitamin c", why: "Antioxidant brightening; pairs well with daytime SPF." }] : []),
    { order: 3, product_type: "Moisturizer", ingredient: "hyaluronic acid", why: "Lock in hydration for a plump, healthy look." },
    { order: 4, product_type: "Sunscreen", ingredient: "spf", why: "Non-negotiable daily protection and anti-aging." },
  ];

  const PM: RoutineStep[] = [
    { order: 1, product_type: "Cleanser", ingredient: "glycerin", why: "Remove the day's buildup and sunscreen." },
    { order: 2, product_type: "Treatment", ingredient: primaryActive, why: `Targets your top concern: ${primary.label.toLowerCase()}.` },
    { order: 3, product_type: "Moisturizer", ingredient: "ceramides", why: "Repair the barrier overnight." },
  ];

  return {
    headline: `Your skin's top focus: ${top.map((c) => c.label.toLowerCase()).join(", ")}.`,
    top_concerns,
    routine: { AM, PM },
    product_criteria,
    cautions: [],
    source: "mock",
  };
}

// Public entry. Uses Gemini/Claude if configured; otherwise deterministic.
export async function getPlan(scores: SkinScores, profile?: UserProfile): Promise<AgentPlan> {
  const base = buildPlanFromScores(scores, profile);

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return base; // mock-first default

  try {
    const enriched = await enrichWithGemini(base, scores, profile, geminiKey);
    return enriched ?? base;
  } catch {
    return base; // P16: fall back on any LLM failure
  }
}

// LLM narration layer: rewrite headline + explanations in a warmer voice.
// Structure (concerns, routine, criteria) stays from the deterministic core,
// so the output schema can never break.
async function enrichWithGemini(
  base: AgentPlan,
  scores: SkinScores,
  profile: UserProfile | undefined,
  apiKey: string
): Promise<AgentPlan | null> {
  const prompt = `You are a warm, encouraging cosmetic skincare coach (NOT a doctor; never diagnose).
Given these top concerns, rewrite ONLY the "headline" and each concern "explanation" in plain, friendly language.
Do NOT mention numeric scores. Return strict JSON: {"headline": string, "explanations": {"<concernKey>": string}}.
Top concerns: ${JSON.stringify(base.top_concerns.map((c) => ({ key: c.concern, label: c.label, severity: c.severity })))}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  const parsed = JSON.parse(text) as { headline?: string; explanations?: Record<string, string> };
  return {
    ...base,
    source: "gemini",
    headline: parsed.headline || base.headline,
    top_concerns: base.top_concerns.map((c) => ({
      ...c,
      explanation: parsed.explanations?.[c.concern] || c.explanation,
    })),
  };
}
