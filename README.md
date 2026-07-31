# GlowRead — AI Skincare Coach

Snap a selfie → instant AI analysis of 15 skin concerns → a personalized AM/PM routine → real products matched to your skin.

Built for the **DevNetwork [API + Cloud + AI] Hackathon 2026** — Perfect Corp challenge.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No API keys needed — the app ships in **mock-first mode** with realistic sample data.
Click **"Try a demo"** or upload a selfie. To go live, copy `.env.local.example` → `.env.local` and add keys.

Production build: `npm run build && npm run start`.

---

## How it works (architecture)

```
Selfie ─▶ /api/analyze ─▶ skinClient (Perfect Corp, 4-step async)  ─┐
                          agent (deterministic core + LLM narration) │
                          safety (hard cosmetic-safety rules)        │
                          productMatcher (real catalog, deterministic)
                                             └─▶ Reveal UI (scorecard, routine, products)
```

| Module | Responsibility |
|---|---|
| `lib/skinClient.ts` | Perfect Corp Skin Analysis (upload → task → poll). Mock mode by default. |
| `lib/agent.ts` | **Deterministic planner** builds a valid, safe plan from scores; optional Gemini/Claude layer only rewrites wording. |
| `lib/safety.ts` | Hard rules: pregnancy excludes retinoids/BHA/BPO; active-conflict warnings; SPF always enforced. |
| `lib/products.ts` | Real, widely-available products + concern→ingredient map + deterministic matcher. |
| `components/Reveal.tsx` | The "reveal": health ring, concern bars, AM/PM routine, product cards. |

### Key design decisions (the "why" — interview/judge prep)

- **Deterministic reasoning, LLM narration.** All reasoning — ranking concerns, building the routine, choosing product criteria — happens in code (`buildPlanFromScores`). The LLM only rewrites the headline and explanations in a warmer voice. So the output schema can never break, and every recommendation is explainable and testable. (This is a deliberate, safer choice than an autonomous LLM agent.)
- **Code retrieves products, never the LLM.** A deterministic matcher maps ingredients → real catalog products, so no product is ever hallucinated.
- **`raw_score` vs `ui_score`.** The deterministic core reasons on the accurate raw score; the UI shows the gentler consumer-calibrated score.
- **Privacy by default.** Selfies are analyzed, not stored. No accounts in the MVP.
- **Safety is not the model's job.** Cosmetic-safety rules are enforced in code after the plan, independent of the LLM.

### Business model (Feasibility)

B2B white-label for skincare brands and retailers (Perfect Corp's own model), with affiliate product links as secondary consumer revenue.

---

## Status

- ✅ MVP: analysis → agent → safety → product match → polished reveal, deploy-ready (Vercel).
- ⏭️ Stretch: progress tracking (re-scan deltas), embeddings RAG, live product prices (SerpApi), Nutrient signed-PDF report.

*Cosmetic guidance only — not medical advice. Product prices are indicative and refreshed with live data before launch.*
