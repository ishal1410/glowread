# GlowRead: AI Skincare Coach

Snap a selfie, get an analysis of 11 skin concerns, a personalized AM/PM routine, and real products matched to your skin.

Built for the DevNetwork [API + Cloud + AI] Hackathon 2026, Perfect Corp challenge.

Live at [glowread.vercel.app](https://glowread.vercel.app).

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

You do not need API keys to start. Without `PERFECTCORP_API_KEY` the app serves realistic sample data and labels it as such in the UI. With the key set, an uploaded selfie always runs the live analysis, and only an explicit "Try a demo" returns sample data, so a malformed request cannot pass off a fabricated reading as a real one. To go live, copy `.env.local.example` to `.env.local` and add your keys.

Production build: `npm run build && npm run start`. Tests: `npm test` (Vitest, 103 tests over the pure logic: polarity, safety, matcher, response parsing, request guards).

---

## How it works

```
Selfie ─▶ /api/analyze/start  ─▶ face detect ─▶ upload ─▶ create task ─▶ { taskId }
             (fast, <1s)             (rejects a no-face photo before spending a unit)
             │
             ▼
          /api/analyze/status  ─▶ one upstream poll ─▶ running | success
             (client polls every 2s, so no single request outlives a
              serverless time cap; Vercel Hobby kills a function at 60s)
             │
             └─▶ buildAnalyzeResult: agent (deterministic plan)
                                   ─▶ safety (hard cosmetic-safety rules)
                                   ─▶ productMatcher (real catalog)
                                   ─▶ Reveal UI (scorecard, routine, products)

/api/analyze   demo only, sample data through the same plan/safety/product chain
/api/narrate   optional LLM rewording, fetched after the reveal is already on screen
```

| Module | Responsibility |
|---|---|
| `lib/skinClient.ts` | Perfect Corp Skin Analysis: `startRealAnalysis` (upload + task) and `pollRealAnalysis` (one poll). Sample data when no key is set. |
| `lib/faceDetect.ts` | Local face detection (face-api on a WASM backend). A photo with no detectable face is rejected before any paid unit is spent. |
| `lib/requestGuards.ts` | Client identity, two-ceiling rate limiting, profile coercion, image magic-byte sniffing. |
| `lib/agent.ts` | The deterministic planner builds a valid, safe plan from scores. An optional LLM layer (`/api/narrate`, off the critical path) only rewrites wording. |
| `lib/safety.ts` | Hard rules: pregnancy excludes retinoids, BHA, and BPO; active-conflict warnings; SPF always enforced. |
| `lib/products.ts` | Real, widely available products, a concern-to-ingredient map, and a deterministic matcher. |
| `components/Reveal.tsx` | The reveal: health ring, concern bars, AM/PM routine, product cards. |

### Design decisions, and why

The reasoning is deterministic and only the narration is generated. Ranking concerns, building the routine, and choosing product criteria all happen in code (`buildPlanFromScores`). The LLM rewrites the headline and the per-concern explanations in a warmer voice, nothing else. The output schema therefore cannot break, and every recommendation stays explainable and testable. That is a deliberate choice against an autonomous LLM agent.

Narration never blocks the reveal. Provider latency is unpredictable (measured at 2.7s, 8.4s, and 34.1s on back-to-back calls), so the reveal renders from the deterministic plan and the warmer wording swaps in afterwards via `/api/narrate`. If a provider is slow, over quota, or down, the deterministic copy simply stays. That endpoint accepts concern keys only, and labels are re-derived server-side, so it cannot be used as an injectable LLM proxy.

Code retrieves products, never the LLM. A deterministic matcher maps ingredients to real catalog entries, so no product is ever hallucinated.

The core reasons on `raw_score`, the accurate value, while the UI shows `ui_score`, the gentler consumer-calibrated one.

Your photo goes to Perfect Corp for analysis and is not stored by this app, and there are no accounts in the MVP. Only the resulting concern keys and severities, never the photo and no personal details, are sent to the narration provider.

Safety is not the model's job. Cosmetic-safety rules run in code after the plan is built, independent of the LLM.

### Business model

B2B white-label for skincare brands and retailers, which is Perfect Corp's own model, with affiliate product links as secondary consumer revenue.

---

## Status

Deployed and running against the live Perfect Corp API: analysis, agent, safety, product match, and the reveal all work end to end in production.

The suite covers the deterministic core, response parsing, and the request guards with 103 Vitest tests.

The live analysis is polled from the client rather than held open server-side, so it fits a 60s-capped serverless plan.

Still on the list: progress tracking across re-scans, embeddings RAG, live product prices via SerpApi, and a signed PDF report.

*Cosmetic guidance only, not medical advice. Product prices are indicative and refreshed with live data before launch.*
