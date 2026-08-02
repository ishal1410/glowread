# Key-Wiring Day Checklist — GlowRead

**Goal:** turn the working mock demo into a real Perfect Corp + LLM integration that satisfies the hackathon mandate ("integrate at least 1 Perfect Corp API").

**When:** after Aug 17, 2026 (hackathon window opens), before the Sep 3 10:00 PDT deadline. Do NOT push the repo before Aug 17 (Path B — commit dates are Jul 31 / Aug 2).

**Source:** items A1–A4 + resize come from the 4-agent deep review (Aug 2, commit `e61937b`). The mock-safe + security fixes are already done (`2c58d90`). Everything below needs a **live key** to verify — the current real-path code was written to a paraphrased spec and has never touched the live API.

**Golden rule:** budget **one free unit** for a single live end-to-end call (Phase 7). That one call flushes A1–A4 at once. Everything downstream of the analysis is already reliable.

---

## Phase 0 — Get credentials (do first)

- [ ] Sign in at `yce.perfectcorp.com/api-console`. Confirm the free tier (40 units) is active.
- [ ] Copy the **API key** AND the **API secret** (the S2S auth handshake needs both — see A1).
- [ ] Find, in the console, the exact values the code currently guesses:
  - [ ] **API host** for S2S calls (A2) — e.g. `yce-api-01.perfectcorp.com`, NOT the console domain.
  - [ ] **Auth endpoint + flow** (A1) — the token-exchange path and request shape.
  - [ ] **Skin-analysis result shape** (A3) — does completion return inline scores, or download URLs to a JSON/zip?
  - [ ] **Supported concern/attribute tokens** (B2) — exact spelling (`spot` vs `dark_spot`, `radiance` vs `glow`, is `pigmentation` a token?).
  - [ ] **Presigned upload requirements** (A4) — which request headers the init step prescribes.
- [ ] Decide the LLM: pay ~$5 for Claude (sponsor alignment) or keep Gemini free. See Phase 8.

> If the console docs answer A1–A4 directly, update the code to match BEFORE the live call — don't burn units discovering what the docs already say.

---

## A1 — Auth handshake (highest risk: "won't work on first key")

**Problem:** `lib/skinClient.ts:32-33` sends the raw `PERFECTCORP_API_KEY` as `Bearer`. S2S almost certainly requires: API key + secret → RSA-signed `id_token` → short-lived `access_token`, obtained from an auth endpoint that does not exist in the code.

- [ ] Add `PERFECTCORP_API_SECRET` to `.env.local` and `.env.local.example` (and Vercel env later).
- [ ] Implement the auth call (e.g. `getAccessToken()` in `skinClient.ts`): POST key+signed payload → parse `access_token` + expiry.
- [ ] Use the `access_token` as `Bearer` on all `/s2s` calls; cache it until it expires (module-level, refresh on 401).
- [ ] **Verify:** the auth call returns a token (not 401). Confirm the signing algorithm/format against the console sample.

## A2 — API host

**Problem:** `lib/skinClient.ts:7` `BASE = "https://yce.perfectcorp.com"` is the web console domain; S2S is served elsewhere.

- [ ] Replace `BASE` with the real S2S API host from the console.
- [ ] Consider making it an env var (`PERFECTCORP_API_BASE`) so it's not hard-coded.
- [ ] **Verify:** step-1 init call returns 200 (not 404/misroute).

## Resize (B1 — real inputs fail without it)

**Problem:** no image resize exists; it's a TODO at `skinClient.ts:30`. `sharp` is only Next's optional dep, not imported. Consequences: `route.ts` rejects >10MB before the API ever sees it; a webcam capture with short side <1080 fails Perfect Corp's minimum; a 48MP phone photo (long >4096) fails the max.

- [ ] `npm i sharp` (add as a real dependency).
- [ ] Before the presigned PUT, resize/compress so **long side ≤ 4096 and short side ≥ 1080**, re-encode as JPEG at reasonable quality (shrinks bytes under the 10MB route cap too).
- [ ] Keep the resize server-side (in `skinClient.ts` or the route before upload).
- [ ] **Verify:** a real 48MP phone selfie and a small webcam frame both pass through to a successful analysis.

## A4 — Presigned PUT headers

**Problem:** `skinClient.ts:53` PUTs with only `Content-Type`. Presigned uploads usually require the exact headers the init response prescribes, and the `Content-Type` to match what step 1 declared.

- [ ] Read the init response's prescribed upload headers (e.g. `file.requests[0].headers`) and replay them on the PUT.
- [ ] Ensure the declared `Content-Type` matches between init and PUT.
- [ ] **Verify:** the PUT returns 200/204, not 403.

## A3 — Result parsing (silent-degrade trap)

**Problem:** `parseRealResult` (`skinClient.ts:83-103`) assumes scores arrive **inline**. If the API returns **download URLs** instead, `Object.entries` iterates nothing → all-zero scores → `buildPlanFromScores` hits empty → `minimalPlan()` → the generic starter routine every time. No crash, but "real" mode looks worse than mock.

- [ ] Inspect one real completion payload. If it's URL-based, fetch the result artifact (JSON/zip) and parse scores from it.
- [ ] Map API concern keys → internal `ConcernScore` (`raw_score`/`ui_score`).
- [ ] Add a guard: if parsing yields all-zero / no usable scores, throw (so the route 500s honestly) rather than silently producing a blank plan (see review finding #10).
- [ ] **Verify:** a real result produces varied, non-zero scores and a personalized (not minimal) plan.

## B2 — Concern list + copy reconciliation

**Problem:** real `CONCERNS` (`skinClient.ts:8`) omits `pigmentation` and uses `moisture`, but `agent.EXPLANATIONS` / `CONCERN_LABELS` only define `hydration` → real-path moisture concern falls back to generic copy.

- [ ] Confirm the exact supported tokens (Phase 0). Add `pigmentation` if supported.
- [ ] Reconcile `moisture` vs `hydration`: either map `moisture` → `hydration` in `parseRealResult`, or add `moisture` to `EXPLANATIONS` + `CONCERN_LABELS`.
- [ ] **Verify:** every real concern renders a written explanation + label, not a generic auto-string.

## Poll resilience

**Problem:** `skinClient.ts:70` poll loop has no try/catch — one transient poll error propagates → route 500 even with time left.

- [ ] Wrap the poll fetch/parse in `try { … } catch { /* keep polling */ }`; only a real terminal `error`/`failed` status or the deadline ends the loop.
- [ ] Confirm the real terminal status enum (code currently guesses `success`/`done`, `error`/`failed`).
- [ ] Check the timeout budget: init 10s + PUT 20s + poll 25s can exceed `maxDuration = 60` (`route.ts:11`). Tighten per-step timeouts so the sum stays under.
- [ ] **Verify:** a slow analysis completes without a spurious 500.

---

## Phase 7 — One live end-to-end smoke test (spend 1 unit)

- [ ] Set `PERFECTCORP_API_KEY` + `PERFECTCORP_API_SECRET` in `.env.local`.
- [ ] Run `npm run dev`, upload one real selfie.
- [ ] Confirm the full chain: auth → init (A2) → PUT (A4) → poll → parse (A3) → varied scores → personalized plan → products.
- [ ] Fix whatever the one call surfaces (A1–A4 usually fail together on the first try).
- [ ] Re-run once more to confirm green. Keep remaining units for the demo + judging.

## Phase 8 — LLM

- [ ] **If Gemini (free, already wired):** set `GEMINI_API_KEY`. Confirm `source: "gemini"` on the result and the narration reads well. No code change needed.
- [ ] **If Claude (~$5, sponsor alignment):** decide explicitly — the Claude branch is currently an honest stub. Implement the call in `agent.ts` mirroring the Gemini path (header key, timeout, `validateNarration`, one retry, deterministic fallback), then set the key. Update `.env.local.example`.
- [ ] **Verify:** LLM narration appears; killing the key still falls back to the deterministic plan (never breaks the schema).

## Phase 9 — Deploy (Vercel)

- [ ] Add all env vars in Vercel project settings (Perfect Corp key+secret, host, LLM key). Never commit them.
- [ ] Confirm `maxDuration = 60` actually applies on the chosen Vercel plan (Hobby default is 10s).
- [ ] **Real rate limit:** the in-memory limiter is per-instance only. Front `/api/analyze` with Upstash (Redis) keyed on the client IP to make the denial-of-wallet protection real across serverless instances.
- [ ] Verify the deployed site: security headers present (already configured), demo path works, real path works, no secrets in the client bundle.

## Phase 10 — Submission deliverables

- [ ] Fix the README "15 skin concerns" claim → actual count (12 mock / whatever the real token list ends up being).
- [ ] Screenshots (the reveal / radial dial is the hero shot).
- [ ] Demo video 1–3 min: rehearsed-live app + pre-captured backup. Lead with "the reveal."
- [ ] Consider surfacing the concern **mask URLs** (step 4) as image overlays — that's the visual "wow" that sells consumer/retail value. Optional but high-impact.
- [ ] Devpost write-up: concept, consumer/retail value, B2B white-label feasibility story, architecture (deterministic core + validated LLM narration + safety gate).
- [ ] Push the repo (private) to GitHub AFTER Aug 17.
- [ ] Final: submit before **Sep 3, 2026 10:00 AM PDT**.

---

### Demo-day safety
If A1–A4 aren't fully validated end-to-end, **demo on mock** — a polished mock beats a real path that silently degrades to the minimal plan (A3). The mock is submission-grade today; the real path is the mandate, not the demo crutch.
