// Curated real-product catalog + deterministic matcher.
//
// P9 (no fabricated data): these are real, widely-available products. Prices are
// INDICATIVE only (labeled "approx.") and will be replaced with live data
// (SerpApi stretch) before real submission. No price is presented as exact/current.
//
// Concern -> ingredient mapping reflects general, well-established cosmetic
// dermatology guidance (not medical advice). Sources for the mapping are noted in
// INGREDIENT_RATIONALE below and surfaced in the UI.

import type { Product, ProductCriterion, MatchedProduct } from "./types";

// Which ingredients address which concern (general cosmetic guidance).
export const CONCERN_INGREDIENTS: Record<string, string[]> = {
  wrinkle: ["retinol", "peptides", "vitamin c"],
  firmness: ["retinol", "peptides"],
  age: ["retinol", "vitamin c", "peptides"],
  hydration: ["hyaluronic acid", "glycerin", "ceramides"],
  moisture: ["hyaluronic acid", "ceramides", "glycerin"],
  pore: ["niacinamide", "salicylic acid"],
  oiliness: ["niacinamide", "salicylic acid"],
  texture: ["glycolic acid", "salicylic acid", "niacinamide"],
  acne: ["salicylic acid", "niacinamide", "benzoyl peroxide"],
  spot: ["vitamin c", "niacinamide", "azelaic acid"],
  pigmentation: ["vitamin c", "azelaic acid", "niacinamide"],
  redness: ["azelaic acid", "niacinamide", "centella"],
  dark_circle: ["caffeine", "vitamin c", "peptides"],
  radiance: ["vitamin c", "glycolic acid"],
  // Sunscreen is always recommended.
  sun: ["spf"],
};

export const INGREDIENT_RATIONALE: Record<string, string> = {
  retinol: "Vitamin A derivative; supports cell turnover and collagen (fine lines, texture).",
  peptides: "Signal proteins that support firmness and barrier.",
  "vitamin c": "Antioxidant that brightens and helps even tone.",
  "hyaluronic acid": "Humectant that binds water for hydration and plumpness.",
  glycerin: "Humectant that draws moisture into skin.",
  ceramides: "Lipids that restore the skin barrier.",
  niacinamide: "Vitamin B3; helps oil balance, pores, tone, redness.",
  "salicylic acid": "Oil-soluble BHA that clears pores (oiliness, acne, texture).",
  "glycolic acid": "AHA that exfoliates surface for smoother, brighter skin.",
  "benzoyl peroxide": "Antibacterial for inflammatory acne.",
  "azelaic acid": "Gentle acid for redness, pigmentation, and breakouts.",
  centella: "Soothing botanical (cica) for calming redness.",
  caffeine: "Temporarily reduces puffiness/appearance of dark circles.",
  spf: "Broad-spectrum sunscreen; the single most effective anti-aging step.",
};

// Real, widely-available products. Prices indicative (approx., as of 2026-07).
const AS_OF = "approx., as of 2026-07";
export const CATALOG: Product[] = [
  { id: "to-nia", name: "Niacinamide 10% + Zinc 1%", brand: "The Ordinary", category: "Serum", key_ingredients: ["niacinamide"], targets: ["pore", "oiliness", "acne", "redness"], price: 6, currency: "USD", priceNote: AS_OF, url: "https://theordinary.com" },
  { id: "to-ha", name: "Hyaluronic Acid 2% + B5", brand: "The Ordinary", category: "Serum", key_ingredients: ["hyaluronic acid"], targets: ["hydration", "moisture"], price: 9, currency: "USD", priceNote: AS_OF, url: "https://theordinary.com" },
  { id: "to-retinol", name: "Retinol 0.5% in Squalane", brand: "The Ordinary", category: "Serum", key_ingredients: ["retinol"], targets: ["wrinkle", "firmness", "age", "texture"], price: 8, currency: "USD", priceNote: AS_OF, url: "https://theordinary.com" },
  { id: "to-azelaic", name: "Azelaic Acid Suspension 10%", brand: "The Ordinary", category: "Treatment", key_ingredients: ["azelaic acid"], targets: ["redness", "pigmentation", "spot", "acne"], price: 12, currency: "USD", priceNote: AS_OF, url: "https://theordinary.com" },
  { id: "to-vitc", name: "Vitamin C Suspension 23%", brand: "The Ordinary", category: "Serum", key_ingredients: ["vitamin c"], targets: ["spot", "pigmentation", "radiance", "wrinkle"], price: 8, currency: "USD", priceNote: AS_OF, url: "https://theordinary.com" },
  { id: "to-glycolic", name: "Glycolic Acid 7% Toning Solution", brand: "The Ordinary", category: "Exfoliant", key_ingredients: ["glycolic acid"], targets: ["texture", "radiance"], price: 9, currency: "USD", priceNote: AS_OF, url: "https://theordinary.com" },
  { id: "to-caffeine", name: "Caffeine Solution 5% + EGCG", brand: "The Ordinary", category: "Eye", key_ingredients: ["caffeine"], targets: ["dark_circle"], price: 8, currency: "USD", priceNote: AS_OF, url: "https://theordinary.com" },
  { id: "cerave-cleanser", name: "Foaming Facial Cleanser", brand: "CeraVe", category: "Cleanser", key_ingredients: ["ceramides", "niacinamide"], targets: ["oiliness", "moisture"], price: 15, currency: "USD", priceNote: AS_OF, url: "https://www.cerave.com" },
  { id: "cerave-hydrating-cleanser", name: "Hydrating Facial Cleanser", brand: "CeraVe", category: "Cleanser", key_ingredients: ["ceramides", "hyaluronic acid"], targets: ["hydration", "moisture"], price: 15, currency: "USD", priceNote: AS_OF, url: "https://www.cerave.com" },
  { id: "cerave-moisturizer", name: "Moisturizing Cream", brand: "CeraVe", category: "Moisturizer", key_ingredients: ["ceramides", "hyaluronic acid"], targets: ["hydration", "moisture"], price: 17, currency: "USD", priceNote: AS_OF, url: "https://www.cerave.com" },
  { id: "cerave-pm", name: "Skin Renewing Night Cream", brand: "CeraVe", category: "Moisturizer", key_ingredients: ["peptides", "ceramides"], targets: ["firmness", "age", "moisture"], price: 18, currency: "USD", priceNote: AS_OF, url: "https://www.cerave.com" },
  { id: "lrp-bha", name: "Effaclar Salicylic Acid Serum", brand: "La Roche-Posay", category: "Serum", key_ingredients: ["salicylic acid"], targets: ["acne", "pore", "texture", "oiliness"], price: 30, currency: "USD", priceNote: AS_OF, url: "https://www.laroche-posay.us" },
  { id: "lrp-b5", name: "Cicaplast Baume B5", brand: "La Roche-Posay", category: "Treatment", key_ingredients: ["centella", "glycerin"], targets: ["redness", "moisture"], price: 15, currency: "USD", priceNote: AS_OF, url: "https://www.laroche-posay.us" },
  { id: "lrp-spf", name: "Anthelios Mineral SPF 50", brand: "La Roche-Posay", category: "Sunscreen", key_ingredients: ["spf"], targets: ["sun"], price: 34, currency: "USD", priceNote: AS_OF, url: "https://www.laroche-posay.us" },
  { id: "eltamd-spf", name: "UV Clear SPF 46", brand: "EltaMD", category: "Sunscreen", key_ingredients: ["spf", "niacinamide"], targets: ["sun", "redness", "acne"], price: 41, currency: "USD", priceNote: AS_OF, url: "https://eltamd.com" },
  { id: "paula-bha", name: "Skin Perfecting 2% BHA Liquid", brand: "Paula's Choice", category: "Exfoliant", key_ingredients: ["salicylic acid"], targets: ["pore", "acne", "texture", "oiliness"], price: 35, currency: "USD", priceNote: AS_OF, url: "https://www.paulaschoice.com" },
  { id: "paula-vitc", name: "C15 Super Booster", brand: "Paula's Choice", category: "Serum", key_ingredients: ["vitamin c"], targets: ["radiance", "spot", "pigmentation"], price: 52, currency: "USD", priceNote: AS_OF, url: "https://www.paulaschoice.com" },
  { id: "neutrogena-ha", name: "Hydro Boost Water Gel", brand: "Neutrogena", category: "Moisturizer", key_ingredients: ["hyaluronic acid"], targets: ["hydration", "moisture", "oiliness"], price: 20, currency: "USD", priceNote: AS_OF, url: "https://www.neutrogena.com" },
  { id: "cetaphil-cleanser", name: "Gentle Skin Cleanser", brand: "Cetaphil", category: "Cleanser", key_ingredients: ["glycerin"], targets: ["moisture", "redness"], price: 13, currency: "USD", priceNote: AS_OF, url: "https://www.cetaphil.com" },
  { id: "inkey-peptide", name: "Peptide Moisturizer", brand: "The INKEY List", category: "Moisturizer", key_ingredients: ["peptides"], targets: ["firmness", "age"], price: 15, currency: "USD", priceNote: AS_OF, url: "https://www.theinkeylist.com" },
];

// Deterministic matcher: given agent criteria, rank real products.
export function matchProducts(
  criteria: ProductCriterion[],
  budget?: number,
  excludeIngredients: string[] = []
): MatchedProduct[] {
  const wanted = new Map<string, Set<string>>(); // ingredient -> concerns
  for (const c of criteria) {
    const ing = c.ingredient.toLowerCase();
    if (excludeIngredients.includes(ing)) continue;
    if (!wanted.has(ing)) wanted.set(ing, new Set());
    wanted.get(ing)!.add(c.concern);
  }

  const scored = CATALOG.filter((p) => {
    // Sunscreen is essential and always shown, regardless of budget.
    if (budget && p.price > budget && p.category !== "Sunscreen") return false;
    if (p.key_ingredients.some((i) => excludeIngredients.includes(i.toLowerCase()))) return false;
    return true;
  }).map((p) => {
    const matchedFor: string[] = [];
    let score = 0;
    for (const ing of p.key_ingredients) {
      const key = ing.toLowerCase();
      if (wanted.has(key)) {
        score += 2;
        for (const concern of wanted.get(key)!) matchedFor.push(concern);
      }
    }
    return { product: { ...p, matchedFor: [...new Set(matchedFor)] }, score };
  });

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price)
    .map((s) => s.product);

  // Fallback: if the budget filtered everything out, retry without the cap
  // rather than showing an empty grid.
  if (matched.length === 0 && budget) return matchProducts(criteria, undefined, excludeIngredients);

  return matched;
}
