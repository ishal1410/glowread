import { NextRequest, NextResponse } from "next/server";
import { mockScoresFor } from "@/lib/skinClient";
import { buildAnalyzeResult } from "@/lib/analyzeResult";
import { analyzeErrorResponse } from "@/lib/analyzeError";
import { sanitizeProfile, clientIdentity, demoVariant, RateLimiter } from "@/lib/requestGuards";

export const runtime = "nodejs";
// Demo only: sample data, no upstream call, no waiting. A live analysis goes to
// /api/analyze/start + /api/analyze/status, which the client polls — so no
// single request has to outlive a serverless time cap.
export const maxDuration = 20;

// Best-effort in-memory rate limit (per-instance; a real deploy should front it
// with a shared store, e.g. Upstash). Two ceilings: per-client keeps one user
// polite, and the GLOBAL cap is the actual denial-of-wallet defense, because a
// caller who rotates X-Forwarded-For can mint a fresh per-client bucket on
// every request. Both are generous enough that no real demo user is affected.
// Logic + regression tests live in lib/requestGuards.ts.
const limiter = new RateLimiter({ windowMs: 60_000, perClient: 20, global: 120 });

export async function POST(req: NextRequest) {
  try {
    const verdict = limiter.check(clientIdentity(req.headers), Date.now());
    if (!verdict.allowed) {
      const error = verdict.reason === "global"
        ? "We're handling a lot of scans right now. Please try again in a minute."
        : "Too many requests. Please wait a moment.";
      return NextResponse.json({ error }, { status: 429 });
    }

    // Uploads go to /api/analyze/start (which returns a task to poll), so this
    // route only serves the demo. Require EXPLICIT demo intent: mock scores are
    // fabricated, and a malformed or empty body must never quietly return an
    // invented analysis with a 200.
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Please send photo uploads to /api/analyze/start." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const variant = demoVariant(body);
    if (!variant) {
      return NextResponse.json(
        { error: "Please upload a photo to analyze, or request the demo." },
        { status: 400 }
      );
    }
    const profile = sanitizeProfile((body as { profile?: unknown }).profile);

    // Same plan -> safety -> product chain the live path uses, so the demo and
    // a real analysis can never drift apart.
    return NextResponse.json(buildAnalyzeResult(mockScoresFor({ variant }), profile));
  } catch (err) {
    console.error("analyze error", err);
    const { status, message } = analyzeErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
