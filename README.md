# GlowRead — AI Skincare Coach

Snap a selfie → instant AI analysis of 15 skin concerns → a personalized AM/PM routine → real products matched to your skin.

Built for the **DevNetwork [API + Cloud + AI] Hackathon 2026** — Perfect Corp challenge.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No API keys needed to start — without `PERFECTCORP_API_KEY` the app serves realistic sample data,
labeled as such in the UI. With the key set, an uploaded selfie always runs the live analysis; only
an explicit **"Try a demo"** returns sample data, so a malformed request can never pass off a
fabricated reading as a real one. To go live, copy `.env.local.example` → `.env.local` and add keys.

Production build: `npm run build && npm run start`. Tests: `npm test` (Vitest, 103 tests over the pure
logic — polarity, safety, matcher, response parsing, request guards).

---

## How it works (architecture)

```
Selfie ─▶ /api/analyze/start  ─▶ face detect ─▶ upload ─▶ create task ─▶ { taskId }
             (fast, <1s)             (rejects a no-face photo before spending a unit)
             │
             ▼
          /api/analyze/status  ─▶ one upstream poll ─▶ running | success
             (client polls every 2s, so no single request outlives a
              serverless time cap — Vercel Hobby kills a function at 60s)
             │
             └─▶ buildAnalyzeResult: agent (deterministic plan)
                                   ─▶ safety (hard cosmetic-safety rules)
                                   ─▶ productMatcher (real catalog)
                                   ─▶ Reveal UI (scorecard, routine, products)

/api/analyze   demo only — sample data, same plan/safety/product chain
/api/narrate   optional LLM rewording, fetched AFTER the reveal is on screen
```

| Module | Responsibility |
|---|---|
| `lib/skinClient.ts` | Perfect Corp Skin Analysis: `startRealAnalysis` (upload + task) and `pollRealAnalysis` (one poll). Sample data when no key is set. |
| `lib/requestGuards.ts` | Client identity, two-ceiling rate limiting, profile coercion, image magic-byte sniffing. |
| `lib/agent.ts` | **Deterministic planner** builds a valid, safe plan from scores; an optional Claude/Gemini layer (`/api/narrate`, off the critical path) only rewrites wording. |
| `lib/safety.ts` | Hard rules: pregnancy excludes retinoids/BHA/BPO; active-conflict warnings; SPF always enforced. |
| `lib/products.ts` | Real, widely-available products + concern→ingredient map + deterministic matcher. |
| `components/Reveal.tsx` | The "reveal": health ring, concern bars, AM/PM routine, product cards. |

### Key design decisions (the "why" — interview/judge prep)

- **Deterministic reasoning, LLM narration.** All reasoning — ranking concerns, building the routine, choosing product criteria — happens in code (`buildPlanFromScores`). The LLM only rewrites the headline and explanations in a warmer voice. So the output schema can never break, and every recommendation is explainable and testable. (This is a deliberate, safer choice than an autonomous LLM agent.)
- **Narration never blocks the reveal.** The gateway's latency is unpredictable (measured 2.7s / 8.4s / 34.1s back-to-back), so the reveal renders from the deterministic plan and the warmer wording swaps in afterwards via `/api/narrate`. That endpoint accepts only concern *keys* — labels are re-derived server-side, so it can't be used as an injectable LLM proxy.
- **Code retrieves products, never the LLM.** A deterministic matcher maps ingredients → real catalog products, so no product is ever hallucinated.
- **`raw_score` vs `ui_score`.** The deterministic core reasons on the accurate raw score; the UI shows the gentler consumer-calibrated score.
- **Privacy by default.** Selfies are analyzed, not stored. No accounts in the MVP.
- **Safety is not the model's job.** Cosmetic-safety rules are enforced in code after the plan, independent of the LLM.

### Business model (Feasibility)

B2B white-label for skincare brands and retailers (Perfect Corp's own model), with affiliate product links as secondary consumer revenue.

---

## Status

- ✅ MVP: analysis → agent → safety → product match → polished reveal, deploy-ready (Vercel).
- ✅ 103 unit tests (Vitest) over the deterministic core, response parsing, and the request guards.
- ✅ Deploys to a 60s-capped serverless plan: the live analysis is polled from the client, not held open server-side.
- ⏭️ Stretch: progress tracking (re-scan deltas), embeddings RAG, live product prices (SerpApi), Nutrient signed-PDF report.

*Cosmetic guidance only — not medical advice. Product prices are indicative and refreshed with live data before launch.*
