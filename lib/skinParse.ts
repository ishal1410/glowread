// Pure parsing/building helpers for the Perfect Corp S2S skin-analysis flow.
// Extracted from skinClient so the response shapes can be unit-tested without
// the network. Every shape here is pinned to a REAL captured response — see
// skinParse.test.ts for the fixtures.

import type { SkinScores, ConcernScore } from "./types";
import { CONCERN_LABELS } from "./mockSkin";
import { badness } from "./metrics";

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
