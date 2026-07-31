// Perfect Corp Skin Analysis client (verified 4-step flow) with a mock mode.
// Mock is the default (P11) so dev/demo never burns the 40 free units.

import type { SkinScores, ConcernScore } from "./types";
import { getMockScores, MOCK_VARIANTS } from "./mockSkin";

const BASE = "https://yce.perfectcorp.com";
const CONCERNS = ["wrinkle", "pore", "texture", "acne", "spot", "redness", "oiliness", "moisture", "dark_circle", "firmness", "radiance"];

export function isRealMode(): boolean {
  return !!process.env.PERFECTCORP_API_KEY;
}

// Entry point used by the API route.
export async function analyzeSkin(imageBuffer: Buffer | null, opts?: { variant?: string }): Promise<SkinScores> {
  if (!isRealMode() || !imageBuffer) {
    // Deterministic-ish variety across demo runs.
    const variant = (opts?.variant && MOCK_VARIANTS.includes(opts.variant)
      ? opts.variant
      : MOCK_VARIANTS[imageBuffer ? imageBuffer.length % MOCK_VARIANTS.length : 0]) as string;
    return getMockScores(variant as never);
  }
  return analyzeSkinReal(imageBuffer);
}

// Real Perfect Corp flow. Kept isolated so the mock path is untouched.
async function analyzeSkinReal(imageBuffer: Buffer): Promise<SkinScores> {
  const key = process.env.PERFECTCORP_API_KEY!;
  const auth = { Authorization: `Bearer ${key}` };

  // 1) init file upload -> presigned URL + file_id
  const initRes = await fetch(`${BASE}/s2s/v2.0/file/skin-analysis`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ content_type: "image/jpeg", file_name: "selfie.jpg", file_size: imageBuffer.length }] }),
  });
  if (!initRes.ok) throw new Error(`file init failed: ${initRes.status}`);
  const init = await initRes.json();
  const file = init?.result?.files?.[0] ?? init?.files?.[0];
  const uploadUrl: string = file?.requests?.[0]?.url ?? file?.url;
  const fileId: string = file?.file_id ?? file?.id;
  if (!uploadUrl || !fileId) throw new Error("file init: missing url/file_id");

  // 2) PUT the image to the presigned URL
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array(imageBuffer) });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);

  // 3) create task -> task_id
  const taskRes = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: 0, payload: { file_sets: { src_ids: [fileId] }, actions: [{ id: 0, params: { dst_actions: CONCERNS } }] } }),
  });
  if (!taskRes.ok) throw new Error(`task create failed: ${taskRes.status}`);
  const task = await taskRes.json();
  const taskId: string = task?.result?.task_id ?? task?.task_id;
  if (!taskId) throw new Error("task create: missing task_id");

  // 4) poll for result (server-side bounded loop; client also shows progress)
  const started = Date.now();
  while (Date.now() - started < 25000) {
    const poll = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis/${taskId}`, { headers: auth });
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
  const raw = (result.results ?? result.scores ?? {}) as Record<string, { raw_score?: number; ui_score?: number; score?: number }>;
  const concerns: ConcernScore[] = Object.entries(raw).map(([key, v]) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    raw_score: v.raw_score ?? v.score ?? 0,
    ui_score: v.ui_score ?? v.raw_score ?? v.score ?? 0,
  }));
  return {
    concerns,
    skinAge: (result.skin_age as number) ?? 0,
    healthScore: (result.skin_health as number) ?? (result.health_score as number) ?? 0,
    source: "perfectcorp",
  };
}
