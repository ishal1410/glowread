// Perfect Corp Skin Analysis client (verified 4-step flow) with a mock mode.
// Mock is the default (P11) so dev/demo never burns the 40 free units.

import sharp from "sharp";
import type { SkinScores } from "./types";
import { getMockScores, MOCK_VARIANTS } from "./mockSkin";
import { parseInitResponse, buildTaskBody, parseTaskId, readPollState, pollUntilDone, mapConcernsToScores, HD_CONCERNS } from "./skinParse";

// S2S API host (docs.perfectcorp.com/develop/api_server). NOT yce.perfectcorp.com
// (that's the web console — real calls 404). Overridable via env.
const BASE = process.env.PERFECTCORP_BASE_URL || "https://yce-api-01.makeupar.com";

export function isRealMode(): boolean {
  return !!process.env.PERFECTCORP_API_KEY;
}

// Entry point used by the API route.
export async function analyzeSkin(
  imageBuffer: Buffer | null,
  opts?: { variant?: string; mime?: string }
): Promise<SkinScores> {
  if (!isRealMode() || !imageBuffer) {
    // Deterministic-ish variety across demo runs.
    const variant = opts?.variant && MOCK_VARIANTS.includes(opts.variant)
      ? opts.variant
      : MOCK_VARIANTS[imageBuffer ? imageBuffer.length % MOCK_VARIANTS.length : 0];
    return getMockScores(variant);
  }
  return analyzeSkinReal(imageBuffer, opts?.mime ?? "image/jpeg");
}

// Ensure the image satisfies HD skin analysis: short side >= 1080, long <= 4096.
// The API rejects smaller images ("error_below_min_image_size"). Returns JPEG.
async function normalizeImage(imageBuffer: Buffer): Promise<{ buffer: Buffer; mime: string }> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  let pipeline = sharp(imageBuffer).rotate(); // honor EXIF orientation
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);
  if (shortSide > 0 && shortSide < 1080) {
    const scale = 1080 / shortSide;
    pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale));
  } else if (longSide > 4096) {
    pipeline = pipeline.resize(w >= h ? 4096 : undefined, h > w ? 4096 : undefined, { fit: "inside" });
  }
  const buffer = await pipeline.jpeg({ quality: 92 }).toBuffer();
  return { buffer, mime: "image/jpeg" };
}

// Real Perfect Corp flow. Kept isolated so the mock path is untouched.
async function analyzeSkinReal(imageBuffer: Buffer, _mime: string): Promise<SkinScores> {
  const key = process.env.PERFECTCORP_API_KEY!;
  const auth = { Authorization: `Bearer ${key}` };

  const { buffer: img, mime } = await normalizeImage(imageBuffer);

  // 1) init file upload -> presigned URL + file_id (+ prescribed upload headers)
  const initRes = await fetch(`${BASE}/s2s/v2.0/file/skin-analysis`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ content_type: mime, file_name: "selfie", file_size: img.length }] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!initRes.ok) throw new Error(`file init failed: ${initRes.status}`);
  const { fileId, uploadUrl, uploadHeaders } = parseInitResponse(await initRes.json());

  // 2) PUT the image to the presigned URL, honoring the init-prescribed headers
  // (the S3 signature covers content-length + content-type — omit them and it 403s).
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: Object.keys(uploadHeaders).length ? uploadHeaders : { "Content-Type": mime },
    body: new Uint8Array(img),
    signal: AbortSignal.timeout(20000),
  });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);

  // 3) create task -> task_id (flat body, HD concerns)
  const taskRes = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(buildTaskBody(fileId, HD_CONCERNS)),
    signal: AbortSignal.timeout(10000),
  });
  if (!taskRes.ok) throw new Error(`task create failed: ${taskRes.status}`);
  const taskId = parseTaskId(await taskRes.json());

  // 4) poll for result. Real HD/SD analysis observed taking >25s, so the window
  // is generous. Transient poll errors are tolerated (pollUntilDone). NOTE: on
  // Vercel Hobby (maxDuration cap) very slow analyses may still exceed the
  // function budget — client-side polling is the durable fix (follow-up).
  const results = await pollUntilDone({
    pollOnce: async () => {
      const poll = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis/${taskId}`, {
        headers: auth,
        signal: AbortSignal.timeout(8000),
      });
      if (!poll.ok) throw new Error(`poll http ${poll.status}`); // transient -> retried
      return readPollState(await poll.json());
    },
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    budgetMs: 55000,
    intervalMs: 1500,
  });

  // TEMP (remove after capture): dump the real success shape so parseRealResult's
  // extractor can be pinned + TDD'd against a real fixture in skinParse.test.ts.
  console.log("PC_RESULTS_SHAPE>>>", JSON.stringify(results));
  return parseRealResult(results);
}

// Extract the concern-score map from the poll `results` container, then map to
// SkinScores via the tested mapConcernsToScores. The EXACT container shape (flat
// map vs. wrapped vs. a download URL) is the one thing not yet pinned to a live
// SUCCESS payload — the console.log above captures it on the first real call, and
// this extractor is finalized + TDD'd then. The heuristic below covers the
// plausible shapes so the app degrades gracefully rather than crashing.
function parseRealResult(results: unknown): SkinScores {
  const { concernMap, skinAge } = extractConcernContainer(results);
  return mapConcernsToScores(concernMap, skinAge);
}

type RawConcern = { raw_score?: number; ui_score?: number; score?: number } | null;

// Heuristic container extraction (PENDING live pin — see parseRealResult note).
function extractConcernContainer(results: unknown): {
  concernMap: Record<string, RawConcern>;
  skinAge: number;
} {
  const r = (results ?? {}) as Record<string, unknown>;
  // A value that looks like a concern entry ({raw_score|ui_score|score}).
  const looksLikeScore = (v: unknown): boolean =>
    !!v && typeof v === "object" && ["raw_score", "ui_score", "score"].some((k) => k in (v as object));

  // Prefer results itself if it's already a flat concern map; else common wrappers.
  let concernMap: Record<string, RawConcern> = {};
  const candidates: unknown[] = [r, r.scores, r.skin_analysis, r.result, r.results];
  for (const c of candidates) {
    if (c && typeof c === "object" && Object.values(c as object).some(looksLikeScore)) {
      concernMap = c as Record<string, RawConcern>;
      break;
    }
  }

  const skinAgeRaw = r.skin_age ?? r.age ?? (r.result as Record<string, unknown>)?.skin_age;
  const skinAge = typeof skinAgeRaw === "number" ? Math.round(skinAgeRaw) : 0;
  return { concernMap, skinAge };
}
