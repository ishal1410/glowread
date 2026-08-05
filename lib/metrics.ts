// Metric polarity. Most skin metrics are "concerns" where higher = worse
// (wrinkle, pore, acne...). A few are positive "attributes" where higher = better
// (firmness, hydration, radiance). "Badness" normalizes both to a 0-100 scale
// where higher always means "needs more attention", so ranking, severity, and
// bar coloring all agree.

import type { Severity } from "./types";

export const HIGHER_IS_BETTER = new Set(["firmness", "hydration", "moisture", "radiance"]);

export function isAttribute(key: string): boolean {
  return HIGHER_IS_BETTER.has(key);
}

// 0-100, higher = more of a problem.
export function badness(key: string, score: number): number {
  return HIGHER_IS_BETTER.has(key) ? 100 - score : score;
}

// Single source of truth for the severity scale (was duplicated 3x across
// agent, RadialMap, and Reveal). Input is a 0-100 "badness" value.
export const SEV_HIGH = 55;
export const SEV_MODERATE = 35;

export function severityOf(b: number): Severity {
  if (b >= SEV_HIGH) return "high";
  if (b >= SEV_MODERATE) return "moderate";
  return "low";
}

// Severity -> design token. Shared so map wedges and bars can't drift.
export const SEV_COLOR: Record<Severity, string> = {
  high: "var(--high)",
  moderate: "var(--mid)",
  low: "var(--good)",
};

// What one row of the breakdown renders. The bar used to be sized on badness
// while the label printed ui_score, so an attribute like "Firmness 69" drew a
// 31% bar — the number and the bar disagreed. Now the bar always shows the
// number, and polarity is carried by COLOR (badness-derived) plus an explicit
// higher-is-better marker.
export interface ConcernRow {
  value: number;          // the number printed next to the bar
  fill: number;           // bar width, 0-100 — always equals `value`
  severity: Severity;     // derived from badness, so colour still means good/bad
  higherIsBetter: boolean;
}

// `severityScore` is the field everything else ranks and colours on (raw_score).
// Passing only the display score made the bar derive severity from ui_score
// while the dial and the chips used raw_score, so one concern could render red
// in the map and amber in the breakdown for the same reading.
export function concernRow(key: string, score: number, severityScore: number = score): ConcernRow {
  const value = Math.min(100, Math.max(0, Math.round(score)));
  return {
    value,
    fill: value,
    severity: severityOf(badness(key, severityScore)),
    higherIsBetter: isAttribute(key),
  };
}

// Rank concerns worst-first by badness on the chosen score field. Ranking is
// always done on raw_score (the model's true signal) so chips, the radial map,
// and the breakdown all agree on order; ui_score is display-only.
export function rankByBadness<T extends { key: string; raw_score: number; ui_score: number }>(
  items: T[],
  field: "raw_score" | "ui_score" = "raw_score"
): T[] {
  return [...items].sort((a, b) => badness(b.key, b[field]) - badness(a.key, a[field]));
}
