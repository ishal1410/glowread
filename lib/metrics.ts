// Metric polarity. Most skin metrics are "concerns" where higher = worse
// (wrinkle, pore, acne...). A few are positive "attributes" where higher = better
// (firmness, hydration, radiance). "Badness" normalizes both to a 0-100 scale
// where higher always means "needs more attention", so ranking, severity, and
// bar coloring all agree.

export const HIGHER_IS_BETTER = new Set(["firmness", "hydration", "moisture", "radiance"]);

export function isAttribute(key: string): boolean {
  return HIGHER_IS_BETTER.has(key);
}

// 0-100, higher = more of a problem.
export function badness(key: string, score: number): number {
  return HIGHER_IS_BETTER.has(key) ? 100 - score : score;
}
