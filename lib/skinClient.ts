// Perfect Corp Skin Analysis client (verified 4-step flow) with a mock mode.
// Mock is the default (P11) so dev/demo never burns the 40 free units.

import type { SkinScores, ConcernScore } from "./types";
import { getMockScores, MOCK_VARIANTS, CONCERN_LABELS } from "./mockSkin";

const BASE = "https://yce.perfectcorp.com";
const CONCERNS = ["wrinkle", "pore", "texture", "acne", "spot", "redness", "oiliness", "moisture", "dark_circle", "firmness", "radiance"];

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

// Real Perfect Corp flow. Kept isolated so the mock path is untouched.
// NOTE: before real submission, resize to long<=4096 / short>=1080 (e.g. sharp).
async function analyzeSkinReal(imageBuffer: Buffer, mime: string): Promise<SkinScores> {
  const key = process.env.PERFECTCORP_API_KEY!;
  const auth = { Authorization: `Bearer ${key}` };

  // 1) init file upload -> presigned URL + file_id
  const initRes = await fetch(`${BASE}/s2s/v2.0/file/skin-analysis`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ content_type: mime, file_name: "selfie", file_size: imageBuffer.length }] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!initRes.ok) throw new Error(`file init failed: ${initRes.status}`);
  const init = await initRes.json();
  const file = init?.result?.files?.[0] ?? init?.files?.[0];
  const uploadUrl: string = file?.requests?.[0]?.url ?? file?.url;
  const fileId: string = file?.file_id ?? file?.id;
  if (!uploadUrl || !fileId) throw new Error("file init: missing url/file_id");
  // The presigned URL comes from the upstream response; require https so a
  // spoofed/compromised response can't redirect the image to a plaintext host.
  if (!/^https:\/\//i.test(uploadUrl)) throw new Error("file init: non-https upload url");

  // 2) PUT the image to the presigned URL
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: new Uint8Array(imageBuffer), signal: AbortSignal.timeout(20000) });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);

  // 3) create task -> task_id
  const taskRes = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: 0, payload: { file_sets: { src_ids: [fileId] }, actions: [{ id: 0, params: { dst_actions: CONCERNS } }] } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!taskRes.ok) throw new Error(`task create failed: ${taskRes.status}`);
  const task = await taskRes.json();
  const taskId: string = task?.result?.task_id ?? task?.task_id;
  if (!taskId) throw new Error("task create: missing task_id");

  // 4) poll for result (server-side bounded loop; client also shows progress)
  const started = Date.now();
  while (Date.now() - started < 25000) {
    const poll = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis/${taskId}`, { headers: auth, signal: AbortSignal.timeout(8000) });
    if (poll.ok) {
      const p = await poll.json();
      const status = p?.result?.status ?? p?.status;
      if (status === "success" || status === "done") return parseRealResult(p);
      if (status === "error" || status === "failed") throw new Error("analysis failed");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("analysis timed out");
}

function parseRealResult(p: unknown): SkinScores {
  // Defensive parse; exact shape confirmed against live API before submission.
  const anyP = p as Record<string, unknown>;
  const result = (anyP.result ?? anyP) as Record<string, unknown>;
  const raw = (result.results ?? result.scores ?? {}) as Record<string, { raw_score?: number; ui_score?: number; score?: number } | null>;
  const concerns: ConcernScore[] = Object.entries(raw).map(([key, v]) => {
    const s = v ?? {}; // a null score entry must not throw
    return {
      key,
      label: CONCERN_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      raw_score: s.raw_score ?? s.score ?? 0,
      ui_score: s.ui_score ?? s.raw_score ?? s.score ?? 0,
    };
  });
  return {
    concerns,
    skinAge: (result.skin_age as number) ?? 0,
    healthScore: (result.skin_health as number) ?? (result.health_score as number) ?? 0,
    source: "perfectcorp",
  };
}
