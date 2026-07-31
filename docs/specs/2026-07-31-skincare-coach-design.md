# AI Skincare Coach — Design Spec

**Date:** 2026-07-31
**Event:** DevNetwork [API + Cloud + AI] Hackathon 2026 (Devpost)
**Target:** Perfect Corp sponsor challenge ($2,500) + overall grand prize ($12,500)
**Author's goal:** win + portfolio piece for AI/ML engineer role

---

## 1. Problem

Skincare is confusing and expensive. People waste money on products wrong for their skin, guess at routines, and can't read their own skin objectively. Existing help = generic quizzes or costly derm visits.

## 2. Solution

**AI Skincare Coach** — a selfie-driven agentic advisor:

1. User takes/upload a selfie.
2. **Perfect Corp Skin Analysis API** returns quantified scores (15 concerns, 0–100).
3. An **LLM agent** interprets the scores, picks the top 3 concerns, and builds a personalized AM/PM routine — with hard safety rules.
4. A **deterministic product matcher** maps concerns → ingredients → real products (curated catalog, real prices/links).
5. A polished **reveal UI** shows scorecard + routine + products in seconds.

**Hero moment:** "the reveal" — instant expert analysis of *your own face*.

## 3. Judging fit

| Criterion | How this scores |
|---|---|
| **Progress** | Vision API + agent + matcher + polished UI = visibly substantial |
| **Concept** | Universal, relatable real problem; instant 10-sec understanding |
| **Feasibility** | Clear company: B2B white-label to skincare brands/retailers (Perfect Corp's own model); affiliate as secondary consumer revenue |

Novelty is NOT judged — proven-market + depth wins.

## 4. Architecture

```
[Selfie] -> [Frontend] -> [Backend: upload-init + task-create]
                              | (returns task_id)
[Frontend polls task] <-------+
        | scores JSON (raw image NOT stored)
[LLM agent: interpret + top-3 concerns + AM/PM routine, safety-gated]
        |
[Product matcher: attribute-based over curated real catalog]
        |
[Reveal UI: score cards + routine + product cards + disclaimer]
```

Polling is client-side to avoid Vercel's 10s serverless timeout.

## 5. Components (each isolated + testable)

1. **skinClient** — calls Perfect Corp API (4-step). In: image. Out: typed scores JSON. Has a **mock mode** returning realistic fixture data (dev default).
2. **agent** — LLM call, forced structured JSON output (validated + one retry). In: scores + optional profile. Out: `{top_concerns[], routine{AM,PM}, product_criteria[], cautions[]}`. Reads `raw_score`. Mock mode returns a canned plan.
3. **productMatcher** — deterministic. In: product_criteria + budget. Out: ranked real products. Concern→ingredient map is cited.
4. **safety module** — hard rules applied inside/after agent: pregnancy/breastfeeding → no retinoids; sensitive skin → patch-test note; no conflicting actives layered (retinol + AHA/BHA same time).
5. **web UI** — Next.js pages: capture/upload → loading → reveal dashboard.

## 6. Perfect Corp API (verified)

- Auth: `Authorization: Bearer <API_KEY>`. Self-serve free account, 40 free units.
- Flow:
  1. `POST /s2s/v2.0/file/skin-analysis` -> pre-signed URL + file_id
  2. `PUT` image to pre-signed URL (resize: long side <=4096px, short >=1080px)
  3. `POST /s2s/v2.0/task/skin-analysis` (file_id + concerns) -> task_id
  4. `GET /s2s/v2.0/task/skin-analysis/{task_id}` -> poll -> scores + mask URLs
- Response: 15 concerns 0–100, skin age, health score, `ui_score` (consumer) vs `raw_score` (clinical).
- Display `ui_score`; agent reasons on `raw_score`. Mask URLs likely expire — do not store.

## 7. Tech stack ($0)

- Next.js + React + TypeScript + Tailwind
- LLM: Google Gemini free tier (fallback: Claude ~$5 for Perfect Corp sponsor alignment)
- Deploy: Vercel (free)
- No database for MVP (session-only, no login)

## 8. Scope

**MVP (build now, mock-first):** upload → skin analysis → agent routine → product match → polished reveal UI → deploy. Disclaimer + safety + no fabricated prices.

**Stretch (post-MVP):** progress tracking (re-scan deltas, seeded demo history), embeddings RAG, 2nd sponsor stack (SerpApi live prices / Nutrient signed-PDF report), MCP showcase.

## 9. Build order

Mock-first: full polished app on realistic fixtures now; real API keys swapped in before Aug 17 submission.

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Perfect Corp API access gated | Verified self-serve, no gate |
| Async flow / Vercel timeout | Client-side polling |
| 40 free units burn out in dev | Mock mode during all dev; real units only for demo |
| Fabricated product data | Source real products at build time; "as-of" date; no invented prices |
| Unsafe advice / liability | Safety module + cited ingredient map + "cosmetic coach" disclaimer |
| Biometric/PII | Do not store raw images; store scores only; consent |
| LLM breaks output schema | Forced JSON + schema validation + retry |

## 11. Demo

Rehearsed-live deployed app doing the reveal on a real face, with a pre-captured known-good result as backup. Video 1–3 min (Perfect Corp requirement).

## 12. Constraints

- Submissions open Aug 17, 2026; deadline Sep 3, 2026 10:00am PDT.
- Author directs; Claude writes all code. Author owns product reasoning + presentation; explain-notes produced alongside code for judge/interview prep.
