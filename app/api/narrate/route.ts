import { NextRequest, NextResponse } from "next/server";
import { narrate, sanitizeNarrationConcerns } from "@/lib/agent";
import { clientIdentity, RateLimiter } from "@/lib/requestGuards";

export const runtime = "nodejs";
// Narration is bounded by NARRATION_BUDGET_MS (30s) inside narrate().
export const maxDuration = 45;

// Narration is cosmetic, so it runs here instead of blocking /api/analyze:
// gateway latency was measured at 2.7s / 8.4s / 34.1s on back-to-back calls, and
// waiting on it made the whole reveal take 35.3s end-to-end. The reveal now
// renders from the deterministic plan immediately and the warmer wording swaps
// in when (and only if) it arrives.
const limiter = new RateLimiter({ windowMs: 60_000, perClient: 20, global: 120 });

export async function POST(req: NextRequest) {
  if (!limiter.check(clientIdentity(req.headers), Date.now()).allowed) {
    return NextResponse.json({}, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  // Only concern KEYS and severities are taken from the client; labels are
  // re-derived from our own vocabulary, so no caller text reaches the prompt.
  const concerns = sanitizeNarrationConcerns((body as { concerns?: unknown })?.concerns);
  if (!concerns.length) return NextResponse.json({}, { status: 400 });

  try {
    const narration = await narrate(concerns);
    return NextResponse.json(narration ?? {});
  } catch (err) {
    console.error("narrate error", err);
    return NextResponse.json({}); // cosmetic: never surface a failure to the user
  }
}
