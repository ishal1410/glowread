// Perfect Corp Skin Analysis client (verified 4-step flow) with a mock mode.
// Mock is the default (P11) so dev/demo never burns the 40 free units.

import sharp from "sharp";
import type { SkinScores } from "./types";
import { getMockScores, MOCK_VARIANTS } from "./mockSkin";
import { parseInitResponse, buildTaskBody, parseTaskId, readPollState, pollUntilDone, parseSkinAnalysis, faceFillCrop, HD_CONCERNS } from "./skinParse";

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

// Prepare the image for HD skin analysis. Perfect Corp gates on the FACE region
// size (rejects "error_src_face_too_small") not just image size, so we (1) zoom
// toward the face via a centered heuristic crop, then (2) upscale so the short
// side is >= FACE_FILL_SHORT (long capped at 4096). Returns JPEG. EXIF rotation
// is applied first so the crop geometry matches what the model sees.
const FACE_FILL_SHORT = 1500;
const MAX_LONG = 4096;
async function normalizeImage(imageBuffer: Buffer): Promise<{ buffer: Buffer; mime: string }> {
  // Bake in EXIF orientation first so crop coordinates are on the upright image.
  const oriented = await sharp(imageBuffer).rotate().toBuffer();
  const meta = await sharp(oriented).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  let pipeline = sharp(oriented);
  let cw = w;
  let ch = h;
  if (w > 0 && h > 0) {
    const box = faceFillCrop(w, h);
    pipeline = pipeline.extract(box);
    cw = box.width;
    ch = box.height;
  }

  // Upscale so the (cropped) short side reaches FACE_FILL_SHORT, but never
  // downscale below native detail; cap the long side at MAX_LONG.
  if (cw > 0 && ch > 0) {
    const shortSide = Math.min(cw, ch);
    const longSide = Math.max(cw, ch);
    let scale = Math.max(1, FACE_FILL_SHORT / shortSide);
    if (longSide * scale > MAX_LONG) scale = MAX_LONG / longSide;
    if (scale !== 1) pipeline = pipeline.resize(Math.round(cw * scale), Math.round(ch * scale));
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
  if (!taskRes.ok) throw new Error(`task create failed: ${taskRes.status} ${await taskRes.text().catch(() => "")}`);
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

  // Map the live success payload -> app SkinScores. Shape + polarity are pinned to
  // a real capture and TDD'd in skinParse.test.ts (parseSkinAnalysis).
  return parseSkinAnalysis(results);
}
