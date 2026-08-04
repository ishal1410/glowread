import { NextRequest, NextResponse } from "next/server";
import { isRealMode, pollRealAnalysis } from "@/lib/skinClient";
import { buildAnalyzeResult } from "@/lib/analyzeResult";
import { analyzeErrorResponse } from "@/lib/analyzeError";
import { sanitizeProfile, clientIdentity, RateLimiter } from "@/lib/requestGuards";

export const runtime = "nodejs";
// A single upstream poll. Returns in ~1s whatever happens.
export const maxDuration = 20;

// Polling is cheap (no paid unit) and happens every ~2s for up to a few
// minutes, so the ceiling is far higher than /start's — but still bounded, and
// still globally capped so it can't be used to hammer the upstream.
const limiter = new RateLimiter({ windowMs: 60_000, perClient: 120, global: 1200 });

export async function POST(req: NextRequest) {
  try {
    if (!limiter.check(clientIdentity(req.headers), Date.now()).allowed) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const taskId = (body as { taskId?: unknown })?.taskId;
    if (typeof taskId !== "string" || !taskId || taskId.length > 200) {
      return NextResponse.json({ error: "Unknown analysis." }, { status: 400 });
    }
    if (!isRealMode()) {
      return NextResponse.json({ error: "Unknown analysis." }, { status: 400 });
    }

    // The profile rides along with each poll: the task lives upstream, so this
    // route holds no server-side session state (it works on any instance).
    const profile = sanitizeProfile((body as { profile?: unknown }).profile);

    const state = await pollRealAnalysis(taskId);
    if (state.state === "running") return NextResponse.json({ state: "running" });
    if (state.state === "error") {
      const { status, message } = analyzeErrorResponse(new Error(state.error));
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ state: "success", result: buildAnalyzeResult(state.scores, profile) });
  } catch (err) {
    console.error("analyze status error", err);
    const { status, message } = analyzeErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
