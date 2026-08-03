# Perfect Corp Go-Live — Design

Date: 2026-08-03
Scope: Make the skin-analysis path **real end-to-end** (not mock), verified against the
live Perfect Corp S2S API on localhost. Vercel deploy is an explicit follow-up, not
in scope here.

## Goal

Replace the mock skin-analysis dependency with a working live Perfect Corp call so a
real selfie produces real ML scores → real routine → real Claude (AgentRouter)
narration, verified running on `npm run dev`. LLM narration is already live; this
closes the last mock.

## Chosen approach

**A — Local live first.** Write the auth + fixes blind against docs, then make ONE
live call with a real front-face selfie to pin the two things only reality can
settle (auth crypto, result shape), TDD the parser against the captured fixture,
then verify the full pipeline locally. Deploy is a separate clean step afterward.

Rejected **B (everything + Vercel now)**: more failure surface at once, burns free
units while plumbing deploy, harder to debug when the live result shape surprises us.

## Constraints / facts

- Free units: 40 total. This work spends the **minimum** — ideally 1–2 successful
  analyses. Every burned unit is logged.
- Console: `business.perfectcorp.com`. Credentials: `PERFECTCORP_API_KEY` (set) +
  `PERFECTCORP_API_SECRET` (user regenerating now — secret shown once at creation).
- S2S host: `yce-api-01.perfectcorp.com` per docs; current code default is
  `yce-api-01.makeupar.com`. **Pin by live call.** Env-overridable
  (`PERFECTCORP_BASE_URL`).
- AGENTS.md: this Next.js has breaking changes — read `node_modules/next/dist/docs/`
  before touching any Next-specific API. Most work here is in `lib/` (framework-free).
- Mock path stays fully intact and default when no key is set (protects units).

## Auth — UPDATED 2026-08-03: raw key already works

**Empirical finding (supersedes the A1 docs guess):** `scripts/test-perfectcorp-full.mjs`
authenticated with `Authorization: Bearer <PERFECTCORP_API_KEY>` (raw key, NO
handshake) and successfully captured real init/task/poll responses on 2026-08-02
from `yce-api-01.makeupar.com`. So the RSA handshake below is **NOT needed** for this
host/account. `pcAuth.ts` is **deferred** — build it only if today's live call returns
401 (e.g. if the 67-char value was actually a ~2h access_token that has since expired).

Host is likewise confirmed: `yce-api-01.makeupar.com` (do NOT switch to the docs'
`.perfectcorp.com`). Concern coverage is also confirmed fine: all 11 HD keys map to
existing `CONCERN_LABELS` + agent `EXPLANATIONS` after the `hd_` / `age_spot→spot` /
`moisture→hydration` normalization. A6 is a non-issue.

### Deferred handshake (only if 401) — `lib/pcAuth.ts`

Docs-described flow:

1. `payload = "client_id=<KEY>&timestamp=<now_ms>"`
2. `id_token = base64( RSA_encrypt(payload, publicKeyFrom(SECRET)) )`
   - `SECRET` is a Base64-encoded RSA **public** key. Decode it; if the bytes start
     with `-----BEGIN`, use as PEM directly; else treat as DER SPKI and wrap into a
     PEM. Padding: PKCS#1 v1.5 (`crypto.constants.RSA_PKCS1_PADDING`).
     **Exact key format + padding is unverified — confirm on first live call; be
     ready to try OAEP if PKCS1 is rejected.**
3. `POST {BASE}/s2s/v1.0/client/auth` body `{ client_id, id_token }`
   → `{ ...access_token, ... }` valid ~2h.
4. Cache the token in-module with its expiry; refresh when within a safety margin
   (e.g. 5 min) of expiry. All skin-analysis calls send `Authorization: Bearer
   <access_token>` instead of the raw key.

Module surface:
- `getAccessToken(): Promise<string>` — returns a cached-or-fresh token.
- Pure helper `buildIdToken(key, secret, timestampMs)` — unit-testable with a
  throwaway RSA keypair (no network, no real secret).

`crypto` is Node built-in — `runtime = "nodejs"` already set on the route.

## Changes to `lib/skinClient.ts`

- `analyzeSkinReal`: replace `auth = { Authorization: Bearer <key> }` with
  `Authorization: Bearer <await getAccessToken()>`.
- Poll loop: wrap each poll `fetch` in try/catch → on transient error, `continue`
  (don't propagate; a single flaky poll must not 500 the request). Keep the overall
  time budget.
- Keep the TEMP `console.log("PC_RESULTS_SHAPE>>>", ...)` for the capture run; remove
  it once the parser is pinned.

## Result parsing — `lib/skinParse.ts` + `skinParse.test.ts` (A3)

Unknown until captured. Two possible shapes:
- **Inline scores** in `data.results` → map keys → `ConcernScore[]`.
- **Download URL(s)** (json/zip) in `data.results` → fetch the JSON, then map.

Plan: capture the real success payload via the TEMP log, save it as a fixture, TDD
`parseRealResult` (move it out of skinClient into skinParse) against that fixture.
Map the 11 HD concern keys → app keys (existing `hd_` strip + `moisture→hydration`,
`age_spot→spot`), attach labels from `CONCERN_LABELS`. Derive:
- `healthScore` = 100 − mean(badness across concerns), clamped 0–100.
- `skinAge` = from the API's age field if present; else omit/leave 0 and hide in UI
  (decide once shape is known).

## Concern coverage check (A6)

Verify all 11 HD concerns resolve to a label AND an agent explanation
(`agent.EXPLANATIONS` / `CONCERN_LABELS`). Fill any gap (memory flags `moisture`
vs `hydration`, missing `oiliness`/`radiance`/`redness` copy) so no real concern
renders generic fallback text.

## Verification (the live call)

1. User pastes fresh `PERFECTCORP_API_KEY` + `PERFECTCORP_API_SECRET` into
   `.env.local`; provides a real front-face selfie path (short side ≥1080px).
2. `scripts/smoke-perfectcorp.mjs` (new, fetch-based, kept as diagnostic): run auth
   → init → put → task → poll → dump raw success JSON. Confirms host + auth crypto +
   captures result shape in one unit.
3. TDD `parseRealResult` against the captured fixture; `npx tsc --noEmit` + `vitest`
   green.
4. Drive the real app (`npm run dev`) with the same selfie through the UI → confirm
   real scores render in the radial map, real routine, real narration, no console
   errors (Playwright or manual).
5. Remove TEMP log. Commit.

Success = a real selfie yields real Perfect Corp scores through the full UI on
localhost, tests green, ≤2 units spent.

## Out of scope (follow-up)

Vercel deploy, Upstash shared rate-limit, client-side polling refactor (for
analyses exceeding the serverless budget), demo video. Tracked in
`docs/KEY_WIRING_CHECKLIST.md`.

## Risks

- **Auth crypto format** (key encoding / padding) is the highest-uncertainty item;
  first live call may need a padding/format retry. Mitigated by isolating it in
  `pcAuth.ts` with a pure, testable `buildIdToken`.
- **Result shape** may be download-URL indirection → one extra fetch; handled in the
  parser once captured.
- **Host** may be `.makeupar.com` not `.perfectcorp.com`; env override lets us flip
  without a code change during the smoke run.
