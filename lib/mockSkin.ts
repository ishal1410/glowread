// Realistic mock skin-analysis fixtures (P11: save the 40 free units for demo).
// Shape mirrors what Perfect Corp Skin Analysis returns (ui_score vs raw_score).

import type { SkinScores } from "./types";

const CONCERN_LABELS: Record<string, string> = {
  wrinkle: "Wrinkles",
  firmness: "Firmness",
  pore: "Pores",
  texture: "Texture",
  acne: "Acne",
  spot: "Spots",
  pigmentation: "Pigmentation",
  redness: "Redness",
  hydration: "Hydration",
  oiliness: "Oiliness",
  dark_circle: "Dark Circles",
  radiance: "Radiance",
};

// A few distinct profiles so repeated demos don't look identical.
const PROFILES: Record<string, { raw: Record<string, number>; skinAge: number; health: number }> = {
  balanced: {
    raw: { wrinkle: 28, firmness: 72, pore: 45, texture: 60, acne: 15, spot: 30, pigmentation: 35, redness: 25, hydration: 55, oiliness: 40, dark_circle: 48, radiance: 62 },
    skinAge: 27,
    health: 74,
  },
  oily_acne: {
    raw: { wrinkle: 12, firmness: 80, pore: 68, texture: 52, acne: 58, spot: 40, pigmentation: 30, redness: 45, hydration: 48, oiliness: 72, dark_circle: 35, radiance: 55 },
    skinAge: 24,
    health: 66,
  },
  mature_dry: {
    raw: { wrinkle: 62, firmness: 44, pore: 30, texture: 48, acne: 8, spot: 55, pigmentation: 58, redness: 30, hydration: 32, oiliness: 20, dark_circle: 60, radiance: 45 },
    skinAge: 41,
    health: 58,
  },
};

// ui_score is a consumer-friendly (gentler) calibration of raw_score.
function toUi(raw: number): number {
  // For "concern" metrics higher raw = worse; soften toward the middle a bit.
  return Math.round(Math.min(100, Math.max(0, raw * 0.85 + 8)));
}

export function getMockScores(variant: keyof typeof PROFILES = "balanced"): SkinScores {
  const p = PROFILES[variant] ?? PROFILES.balanced;
  const concerns = Object.entries(p.raw).map(([key, raw]) => ({
    key,
    label: CONCERN_LABELS[key] ?? key,
    raw_score: raw,
    ui_score: toUi(raw),
  }));
  return { concerns, skinAge: p.skinAge, healthScore: p.health, source: "mock" };
}

export const MOCK_VARIANTS = Object.keys(PROFILES);
