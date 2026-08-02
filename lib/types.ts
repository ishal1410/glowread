// Shared types for the AI Skincare Coach.

export type Severity = "low" | "moderate" | "high";

export interface ConcernScore {
  key: string;        // e.g. "wrinkle", "pore", "hydration"
  label: string;      // human label
  ui_score: number;   // 0-100, consumer-calibrated (shown in UI)
  raw_score: number;  // 0-100, model raw (agent reasons on this)
}

export interface SkinScores {
  concerns: ConcernScore[];
  skinAge: number;
  healthScore: number; // 0-100 overall
  source: "mock" | "perfectcorp";
}

export interface UserProfile {
  skinType?: "dry" | "oily" | "combination" | "normal" | "sensitive";
  budget?: number;         // max per product, USD
  pregnant?: boolean;
  sensitive?: boolean;
}

export interface TopConcern {
  concern: string;         // matches a ConcernScore.key or a friendly grouping
  label: string;
  severity: Severity;
  explanation: string;     // plain language, no numbers
}

export interface RoutineStep {
  order: number;
  product_type: string;    // e.g. "Cleanser", "Serum"
  ingredient: string;      // key active
  why: string;
}

export interface ProductCriterion {
  concern: string;
  ingredient: string;
  category: string;
}

export interface AgentPlan {
  headline: string;
  top_concerns: TopConcern[];
  routine: { AM: RoutineStep[]; PM: RoutineStep[] };
  product_criteria: ProductCriterion[];
  cautions: string[];
  source: "mock" | "gemini";
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  key_ingredients: string[];
  price: number;           // indicative USD
  priceNote: string;       // e.g. "approx., as of 2026-07"
  url: string;
}

export interface MatchedProduct extends Product {
  matchedFor: string[];    // which criteria it satisfied
}

export interface AnalyzeResult {
  scores: SkinScores;
  plan: AgentPlan;
  products: MatchedProduct[];
  profile?: UserProfile;
}
