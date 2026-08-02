// The agent. Design: a DETERMINISTIC core always produces a valid, safe plan
// (guarantees schema + explainability for judges/interviews). An optional LLM
// layer (Gemini free, or Claude) rewrites the wording more naturally. If the LLM
// is absent or returns bad output, we fall back to the deterministic plan (P16).

import type { SkinScores, AgentPlan, TopConcern, RoutineStep, ProductCriterion } from "./types";
import { CONCERN_INGREDIENTS } from "./products";
import { badness, severityOf, rankByBadness } from "./metrics";

const EXPLANATIONS: Record<string, string> = {
  wrinkle: "Fine lines are starting to show where your face moves most. Moisturizing well and using a retinoid at night softens them over time.",
  firmness: "Your skin looks a little less bouncy than it could. Peptides and retinoids help it firm back up.",
  pore: "Your pores look more visible, usually from oil and buildup. Clearing them regularly keeps them tighter.",
  texture: "Your skin feels uneven to the touch. A gentle exfoliant a few times a week smooths it out.",
  acne: "You've got some active breakouts. Salicylic acid calms them and helps stop new ones.",
  spot: "A few dark marks stand out. Vitamin C and niacinamide fade them over a few weeks.",
  pigmentation: "Your tone is uneven in places. Brightening ingredients and daily sunscreen even it out.",
  redness: "Your skin looks a bit flushed or reactive. Calming ingredients like azelaic acid settle it down.",
  hydration: "Your skin is dry and needs water. Hyaluronic acid under a good moisturizer brings back the plumpness.",
  oiliness: "Your skin gets oily, especially by midday. Niacinamide balances it without drying you out.",
  dark_circle: "The area under your eyes looks shadowed or puffy. Caffeine and a little brightening help it look more rested.",
  radiance: "Your skin looks a little dull. Antioxidants and gentle exfoliation bring the glow back.",
};

// Rank by "badness" (polarity-aware): positive attributes like firmness only
// count as a concern when they're LOW. Pick the worst 3 as "top concerns".
export function buildPlanFromScores(scores: SkinScores): AgentPlan {
  const ranked = rankByBadness(scores.concerns, "raw_score");
  const top = ranked.slice(0, 3);

  // Guard: empty/malformed analysis -> minimal safe plan (SPF + basics).
  if (top.length === 0) return minimalPlan();

  const top_concerns: TopConcern[] = top.map((c) => ({
    concern: c.key,
    label: c.label,
    severity: severityOf(badness(c.key, c.raw_score)),
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
      product_criteria.push({ concern: c.key, ingredient: ing, category: "Serum" });
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
    { order: 4, product_type: "Sunscreen", ingredient: "spf", why: "The best daily habit for protecting your skin and slowing aging." },
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

// Fallback when analysis returns no usable concerns.
function minimalPlan(): AgentPlan {
  return {
    headline: "Here's a gentle, safe starter routine while we get a clearer read on your skin.",
    top_concerns: [],
    routine: {
      AM: [
        { order: 1, product_type: "Cleanser", ingredient: "glycerin", why: "Gentle start without stripping." },
        { order: 2, product_type: "Moisturizer", ingredient: "hyaluronic acid", why: "Baseline hydration." },
        { order: 3, product_type: "Sunscreen", ingredient: "spf", why: "Daily protection is the #1 step for everyone." },
      ],
      PM: [
        { order: 1, product_type: "Cleanser", ingredient: "glycerin", why: "Remove the day's buildup." },
        { order: 2, product_type: "Moisturizer", ingredient: "ceramides", why: "Repair the barrier overnight." },
      ],
    },
    product_criteria: [
      { concern: "hydration", ingredient: "hyaluronic acid", category: "Serum" },
      { concern: "sun", ingredient: "spf", category: "Sunscreen" },
    ],
    cautions: [],
    source: "mock",
  };
}

// Public entry. Uses the LLM narration layer if configured; otherwise
// deterministic. On invalid/failed LLM output we retry once, then fall back to
// the deterministic plan (P16) so the response can never break.
export async function getPlan(scores: SkinScores): Promise<AgentPlan> {
  const base = buildPlanFromScores(scores);

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return base; // mock-first default

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const enriched = await enrichWithGemini(base, geminiKey);
      if (enriched) return enriched;
    } catch {
      // fall through to retry, then to the deterministic base
    }
  }
  return base;
}

// Validate the LLM's narration against the expected schema. Returns null (which
// triggers a retry, then fallback) on any shape mismatch, and bounds string
// lengths so a malfunctioning model can't return unbounded text.
type Narration = { headline?: string; explanations?: Record<string, string> };
function validateNarration(x: unknown): Narration | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const headline = typeof o.headline === "string" ? o.headline.slice(0, 300) : undefined;
  let explanations: Record<string, string> | undefined;
  if (o.explanations && typeof o.explanations === "object") {
    explanations = {};
    for (const [k, v] of Object.entries(o.explanations as Record<string, unknown>)) {
      if (typeof v === "string") explanations[k] = v.slice(0, 600);
    }
  }
  if (headline === undefined && !explanations) return null; // nothing usable
  return { headline, explanations };
}

// LLM narration layer: rewrite headline + explanations in a warmer voice.
// Structure (concerns, routine, criteria) stays from the deterministic core,
// so the output schema can never break.
async function enrichWithGemini(base: AgentPlan, apiKey: string): Promise<AgentPlan | null> {
  const prompt = `You are a warm, encouraging cosmetic skincare coach (NOT a doctor; never diagnose).
Given these top concerns, rewrite ONLY the "headline" and each concern "explanation" in plain, friendly language.
Do NOT mention numeric scores. Return strict JSON: {"headline": string, "explanations": {"<concernKey>": string}}.
Top concerns: ${JSON.stringify(base.top_concerns.map((c) => ({ key: c.concern, label: c.label, severity: c.severity })))}`;

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    {
      method: "POST",
      // Key in a header, never the URL (query strings leak into proxy/access logs).
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  const parsed = validateNarration(JSON.parse(text));
  if (!parsed) return null; // invalid schema -> caller retries, then falls back

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
