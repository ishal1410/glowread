// Perfect Corp Skin Analysis client (verified 4-step flow) with a mock mode.
// Mock is the default (P11) so dev/demo never burns the 40 free units.

import sharp from "sharp";
import type { SkinScores } from "./types";
import { getMockScores, MOCK_VARIANTS } from "./mockSkin";
import { parseInitResponse, buildTaskBody, parseTaskId, readPollState, pollUntilDone, parseSkinAnalysis, HD_CONCERNS } from "./skinParse";

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
