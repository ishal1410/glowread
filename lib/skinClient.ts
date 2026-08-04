// Perfect Corp Skin Analysis client (verified 4-step flow) with a mock mode.
// Mock is the default (P11) so dev/demo never burns the 40 free units.

import sharp from "sharp";
import type { SkinScores } from "./types";
import { getMockScores, MOCK_VARIANTS } from "./mockSkin";
import { parseInitResponse, buildTaskBody, parseTaskId, readPollState, parseSkinAnalysis, assertUsableScores, faceFillCrop, expandFaceBox, HD_CONCERNS } from "./skinParse";
import { detectFace } from "./faceDetect";

// Thrown when local face detection runs and finds no face — the caller maps this
// to a fast, friendly 400 instead of wasting ~70s + a paid unit on the upstream.
export class NoFaceError extends Error {
  constructor() { super("no_face_detected"); this.name = "NoFaceError"; }
}

// S2S API host (docs.perfectcorp.com/develop/api_server). NOT yce.perfectcorp.com
// (that's the web console — real calls 404). Overridable via env.
const BASE = process.env.PERFECTCORP_BASE_URL || "https://yce-api-01.makeupar.com";

export function isRealMode(): boolean {
  return !!process.env.PERFECTCORP_API_KEY;
}

// Sample scores for the demo path, and for an uploaded photo when no API key is
// configured (a fresh clone). The live path is startRealAnalysis + pollRealAnalysis.
export function mockScoresFor(opts?: { variant?: string; imageBytes?: number }): SkinScores {
  const variant = opts?.variant && MOCK_VARIANTS.includes(opts.variant)
    ? opts.variant
    : MOCK_VARIANTS[opts?.imageBytes ? opts.imageBytes % MOCK_VARIANTS.length : 0];
  return getMockScores(variant);
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

  // Detect the face locally. null => no face (reject fast, before the paid call).
  // A thrown detector error (model/backend unavailable) is non-fatal: fall back
  // to the heuristic center crop rather than rejecting a possibly-valid photo.
  let face: Awaited<ReturnType<typeof detectFace>> | undefined;
  try {
    face = await detectFace(oriented);
  } catch (e) {
    console.error("face detect unavailable, using heuristic crop", e);
    face = undefined;
  }
  if (face === null) throw new NoFaceError();

  let pipeline = sharp(oriented);
  let cw = w;
  let ch = h;
  if (w > 0 && h > 0) {
    const box = face ? expandFaceBox(face, w, h) : faceFillCrop(w, h);
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

// Kick off a live analysis and return the upstream task id, WITHOUT waiting for
// it to finish. The wait is what breaks on serverless: a real analysis has been
// observed taking >55s, and a platform that caps a function at 60s kills it
// mid-poll. Splitting start/poll keeps every request short, so the client can
// wait as long as it likes. Face detection still runs here, so a photo with no
// face is rejected before a paid unit is spent.
export async function startRealAnalysis(imageBuffer: Buffer): Promise<string> {
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
  return parseTaskId(await taskRes.json());
}

// One poll of a running task. Returns immediately in every case, so the caller
// (a serverless function) is never at risk of the platform's time cap. Mapping
// of the success payload -> SkinScores is pinned to a real capture and TDD'd in
// skinParse.test.ts; a "success" carrying an unusable payload is an error, not
// a skin health of 0.
export type AnalysisState =
  | { state: "running" }
  | { state: "success"; scores: SkinScores }
  | { state: "error"; error: string };

export async function pollRealAnalysis(taskId: string): Promise<AnalysisState> {
  const key = process.env.PERFECTCORP_API_KEY!;
  const poll = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!poll.ok) throw new Error(`poll http ${poll.status}`); // transient -> client retries

  const state = readPollState(await poll.json());
  if (state.state === "running") return { state: "running" };
  if (state.state === "error") return { state: "error", error: state.error };
  return { state: "success", scores: assertUsableScores(parseSkinAnalysis(state.results)) };
}
