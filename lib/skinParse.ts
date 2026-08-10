// Pure parsing/building helpers for the Perfect Corp S2S skin-analysis flow.
// Extracted from skinClient so the response shapes can be unit-tested without
// the network. Every shape here is pinned to a REAL captured response — see
// skinParse.test.ts for the fixtures.

import type { SkinScores, ConcernScore } from "./types";
import { CONCERN_LABELS } from "./mockSkin";
import { badness, HIGHER_IS_BETTER } from "./metrics";

// HD concern actions accepted by dst_actions. SD and HD MUST NOT be mixed, so we
// commit to HD (the premium set). Chosen to cover the app's UI concerns.
export const HD_CONCERNS = [
  "hd_wrinkle",
  "hd_firmness",
  "hd_pore",
  "hd_texture",
  "hd_acne",
  "hd_age_spot",
  "hd_redness",
  "hd_moisture",
  "hd_oiliness",
  "hd_dark_circle",
  "hd_radiance",
] as const;

export interface InitFile {
  fileId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
}

// Step 1 response: { status, data: { files: [{ file_id, requests:[{url,headers}] }] } }
export function parseInitResponse(json: unknown): InitFile {
  const j = json as Record<string, any>;
  const file = j?.data?.files?.[0] ?? j?.result?.files?.[0] ?? j?.files?.[0];
  const uploadUrl: string | undefined = file?.requests?.[0]?.url ?? file?.url;
  const fileId: string | undefined = file?.file_id ?? file?.id;
  const uploadHeaders = (file?.requests?.[0]?.headers ?? {}) as Record<string, string>;
  if (!uploadUrl || !fileId) throw new Error("file init: missing url/file_id");
  // Require https so a spoofed response can't redirect the image to a plaintext host.
  if (!/^https:\/\//i.test(uploadUrl)) throw new Error("file init: non-https upload url");
  return { fileId, uploadUrl, uploadHeaders };
}

// Step 3 request body. The live API rejects the nested file_sets/actions shape;
// it requires this FLAT body with src_file_id + dst_actions.
export function buildTaskBody(fileId: string, concerns: readonly string[]) {
  return {
    src_file_id: fileId,
    dst_actions: concerns,
    miniserver_args: { enable_mask_overlay: true },
    format: "json",
  };
}

// Step 3 response: { status, data: { task_id } }
export function parseTaskId(json: unknown): string {
  const j = json as Record<string, any>;
  const taskId: string | undefined = j?.data?.task_id ?? j?.result?.task_id ?? j?.task_id;
  if (!taskId) throw new Error("task create: missing task_id");
  return taskId;
}

// Normalize a Perfect Corp concern name to the app's key space. HD actions come
// back with an `hd_` prefix; a couple of names differ from the app's vocabulary.
function normalizeConcernKey(apiKey: string): string {
  const k = apiKey.replace(/^hd_/, "");
  if (k === "age_spot") return "spot";
  if (k === "moisture") return "hydration";
  if (k === "dark_circle_v2") return "dark_circle";
  return k;
}

function prettify(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

type RawConcern = { raw_score?: number; ui_score?: number; score?: number } | null;

// Map a flat { concernName: {scores} } object (the inner result payload) to the
// app's SkinScores. Pure: the network-dependent extraction of WHERE this object
// lives in the poll response is done separately in skinClient once pinned to a
// real success payload. healthScore is derived polarity-aware (badness), so a
// high firmness raises health rather than lowering it.
export function mapConcernsToScores(
  raw: Record<string, RawConcern>,
  skinAge = 0
): SkinScores {
  const concerns: ConcernScore[] = Object.entries(raw).map(([apiKey, v]) => {
    const s = v ?? {};
    const key = normalizeConcernKey(apiKey);
    const raw_score = s.raw_score ?? s.score ?? 0;
    const ui_score = s.ui_score ?? raw_score;
    return { key, label: CONCERN_LABELS[key] ?? prettify(key), raw_score, ui_score };
  });

  let healthScore = 0;
  if (concerns.length) {
    const meanBadness =
      concerns.reduce((sum, c) => sum + badness(c.key, c.raw_score), 0) / concerns.length;
    healthScore = Math.min(100, Math.max(0, Math.round(100 - meanBadness)));
  }

  return { concerns, skinAge, healthScore, source: "perfectcorp" };
}

// --- Real Perfect Corp success payload parsing (pinned to a live capture) ------
// The live success shape is data.results = { output: [ entry, ... ] } where each
// concern entry is { type: "hd_<concern>", raw_score, ui_score, region? } and
// special entries carry a single `score`: { type:"all", score } (overall) and
// { type:"skin_age", score } (age). `resize_image` and other non-scored entries
// are ignored. hd_pore / hd_wrinkle repeat per face region (forehead/nose/... +
// "whole"); we collapse to the "whole" aggregate.
//
// CRITICAL polarity fact (captured 2026-08-03): Perfect Corp scores are HIGHER =
// BETTER for every concern (a clear face scores ~100 on redness/pore/texture),
// which is the OPPOSITE of the app's convention (higher = worse, except the
// HIGHER_IS_BETTER attributes). So we invert every non-attribute key to app
// convention here; attributes (firmness/hydration/radiance) already agree.

interface OutputEntry {
  type?: string;
  raw_score?: number;
  ui_score?: number;
  score?: number;
  region?: string;
}

// Convert one Perfect Corp score (higher = better) to the app's convention for
// the given app key: attributes stay as-is (higher = better), everything else is
// inverted so higher = worse. Clamped + rounded.
function toAppScore(appKey: string, pcScore: number): number {
  const v = HIGHER_IS_BETTER.has(appKey) ? pcScore : 100 - pcScore;
  return Math.min(100, Math.max(0, Math.round(v)));
}

export function parseSkinAnalysis(results: unknown): SkinScores {
  const output = (results as { output?: unknown })?.output;
  if (!Array.isArray(output)) return mapConcernsToScores({});

  const entries = output as OutputEntry[];

  // Collapse concern entries (finite raw_score) by normalized key, preferring the
  // "whole" region; if none is "whole", keep the WORST region (min PC score = most
  // concerning, since PC is higher = better).
  const rep = new Map<string, OutputEntry>();
  for (const e of entries) {
    if (typeof e.type !== "string" || typeof e.raw_score !== "number" || !Number.isFinite(e.raw_score)) continue;
    const key = normalizeConcernKey(e.type);
    const cur = rep.get(key);
    if (!cur) { rep.set(key, e); continue; }
    if (e.region === "whole") { rep.set(key, e); continue; }
    if (cur.region !== "whole" && (e.raw_score ?? 100) < (cur.raw_score ?? 100)) rep.set(key, e);
  }

  const concerns: ConcernScore[] = [...rep.entries()].map(([key, e]) => ({
    key,
    label: CONCERN_LABELS[key] ?? prettify(key),
    raw_score: toAppScore(key, e.raw_score as number),
    ui_score: toAppScore(key, e.ui_score ?? (e.raw_score as number)),
  }));

  // Overall + age come from the special single-`score` entries.
  const overall = entries.find((e) => e.type === "all" && typeof e.score === "number")?.score;
  const ageEntry = entries.find((e) => e.type === "skin_age" && typeof e.score === "number")?.score;
  const skinAge = typeof ageEntry === "number" ? Math.round(ageEntry) : 0;

  // Prefer the API's own overall (higher = better, same as healthScore); else
  // derive from mean badness so the field is never left at 0 on a valid analysis.
  let healthScore: number;
  if (typeof overall === "number") {
    healthScore = Math.min(100, Math.max(0, Math.round(overall)));
  } else if (concerns.length) {
    const meanBadness = concerns.reduce((sum, c) => sum + badness(c.key, c.raw_score), 0) / concerns.length;
    healthScore = Math.min(100, Math.max(0, Math.round(100 - meanBadness)));
  } else {
    healthScore = 0;
  }

  return { concerns, skinAge, healthScore, source: "perfectcorp" };
}

// A task can report "success" while carrying an unusable payload (missing or
// empty results). Parsing that yields zero concerns and healthScore 0, which
// the UI happily renders as "skin health 0" over a generic routine. Treat it as
// a failure so the user gets an honest error instead of an invented reading.
export function assertUsableScores(scores: SkinScores): SkinScores {
  if (!scores.concerns.length) throw new Error("analysis returned no concerns");
  return scores;
}

export interface CropBox { left: number; top: number; width: number; height: number; }

// Heuristic "zoom to the face" crop. We can't detect the face without a heavy ML
// dependency, so we assume the common case — a roughly centered portrait — and
// crop toward the center, biased slightly UP because a face sits in the upper
// middle of a frame (headroom above, shoulders/body below). Combined with the
// upscale in normalizeImage, this enlarges the face region enough to clear
// Perfect Corp's face-size gate for margin-heavy shots (e.g. passport crops).
// Limitation: an off-center or tilted face may be cropped wrong (accepted
// trade-off for zero added dependencies). It only ever ENLARGES the face vs. the
// old no-crop path, so it cannot make the gate harder to pass.
// Tuned against the live face-size gate: an 0.82/0.88 crop left the face ~819px
// in the upscaled output and the API still rejected it (error_src_face_too_small);
// a tighter ~0.6/0.72 crop (matching the manual crop that passed, face ~1100px+)
// clears it. Aggressive on purpose — a margin-heavy shot (e.g. passport) must
// pass; a very tight selfie may lose a little edge (acceptable, user can retake).
const CROP_W = 0.6; // keep 60% of width
const CROP_H = 0.72; // keep 72% of height
const TOP_BIAS = 0.35; // remove 35% of the excess from the top, 65% from the bottom
export function faceFillCrop(w: number, h: number): CropBox {
  const width = Math.max(1, Math.min(w, Math.round(w * CROP_W)));
  const height = Math.max(1, Math.min(h, Math.round(h * CROP_H)));
  const left = Math.round((w - width) / 2);
  const top = Math.round((h - height) * TOP_BIAS);
  return { left, top, width, height };
}

// Given a detected face box, produce a square crop around it for skin analysis.
// The crop is ~1.4x the face's larger dimension (K) so that upscaling the result
// to FACE_FILL_SHORT leaves the face large enough to clear Perfect Corp's
// face-size gate (final face px ≈ FACE_FILL_SHORT / K ≈ 1070). Centered on the
// face but biased slightly up to include the forehead. Clamped to the image; a
// face bigger than the frame just uses the whole frame.
const FACE_CROP_K = 1.4;
export function expandFaceBox(
  box: { x: number; y: number; width: number; height: number },
  imgW: number,
  imgH: number
): CropBox {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2 - box.height * 0.1; // bias up for forehead
  let side = Math.round(Math.max(box.width, box.height) * FACE_CROP_K);
  side = Math.min(side, imgW, imgH);
  let left = Math.round(cx - side / 2);
  let top = Math.round(cy - side / 2);
  left = Math.max(0, Math.min(left, imgW - side));
  top = Math.max(0, Math.min(top, imgH - side));
  return { left, top, width: side, height: side };
}

// Ceiling on how many pixels we will let a decoder allocate for an upload.
// libvips defaults to 0x3FFF^2 = 268 megapixels, and the only inbound bound is a
// 10MB BYTE cap — but bytes are not pixels. A 249KB uniform 16000x16000 PNG
// decodes to a 768MB raw buffer and, once handed to tf.tensor3d as a Uint8Array
// (inferred int32, 4 bytes/element), a further ~3GB. Measured peak RSS for the
// decode alone was 858MB, against a 1-2GB serverless instance. 40MP is far above
// any real phone camera (a 48MP sensor still saves ~12MP images) and far below
// the amount that can OOM the box.
export const MAX_INPUT_PIXELS = 40_000_000;
export const SHARP_INPUT = { limitInputPixels: MAX_INPUT_PIXELS } as const;

// The detector resizes its input to 416px internally, so handing it a full-size
// image only inflates the intermediate raw buffer — the information reaching the
// model is identical. Downscale so the long side is at most DETECTOR_MAX_SIDE
// first, then map the resulting box back to original coordinates. Only ever
// shrinks: a small image is passed through at scale 1.
export const DETECTOR_MAX_SIDE = 1024;
export function detectorScale(w: number, h: number, maxSide: number = DETECTOR_MAX_SIDE): number {
  const longSide = Math.max(w, h);
  if (!(longSide > 0) || longSide <= maxSide) return 1;
  return maxSide / longSide;
}

// Map a box detected on a downscaled image back onto the original.
export function rescaleBox<T extends { x: number; y: number; width: number; height: number }>(
  box: T,
  scale: number
): { x: number; y: number; width: number; height: number } {
  if (scale === 1) return { x: box.x, y: box.y, width: box.width, height: box.height };
  return {
    x: box.x / scale,
    y: box.y / scale,
    width: box.width / scale,
    height: box.height / scale,
  };
}

export type PollState =
  | { state: "running" }
  | { state: "success"; results: unknown }
  | { state: "error"; error: string };

export interface PollDeps {
  pollOnce: () => Promise<PollState>;   // one network poll -> parsed state
  now: () => number;                    // clock (injectable for tests)
  sleep: (ms: number) => Promise<void>; // delay between polls (injectable)
  budgetMs?: number;                    // overall time budget
  intervalMs?: number;                  // delay between polls
}

// Poll until the task succeeds, fails, or the budget elapses. A TRANSIENT poll
// error (network blip, one bad response) is swallowed so a single flaky poll can
// never abort the whole analysis — we just wait and try again within the budget.
// Only a task-reported "error" state or an elapsed budget throws.
export async function pollUntilDone(deps: PollDeps): Promise<unknown> {
  const { pollOnce, now, sleep, budgetMs = 55000, intervalMs = 1500 } = deps;
  const started = now();
  while (now() - started < budgetMs) {
    let state: PollState | null = null;
    try {
      state = await pollOnce();
    } catch {
      // transient — fall through to sleep + retry within the budget
    }
    if (state?.state === "success") return state.results;
    if (state?.state === "error") throw new Error(`analysis failed: ${state.error}`);
    await sleep(intervalMs);
  }
  throw new Error("analysis timed out");
}

// Step 4 response: state is in data.task_status (NOT the top-level status echo).
export function readPollState(json: unknown): PollState {
  const j = json as Record<string, any>;
  const st: string | undefined = j?.data?.task_status;
  if (st === "success" || st === "done") return { state: "success", results: j?.data?.results };
  if (st === "error" || st === "failed") {
    return { state: "error", error: String(j?.data?.error ?? "analysis failed") };
  }
  return { state: "running" };
}
