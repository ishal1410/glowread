import { NextRequest, NextResponse } from "next/server";
import { isRealMode, mockScoresFor, startRealAnalysis } from "@/lib/skinClient";
import { buildAnalyzeResult } from "@/lib/analyzeResult";
import { analyzeErrorResponse } from "@/lib/analyzeError";
import { sanitizeProfile, sniffImageMime, clientIdentity, RateLimiter } from "@/lib/requestGuards";
import type { UserProfile } from "@/lib/types";

export const runtime = "nodejs";
// Upload + face detect + task creation only — the WAIT happens on the client,
// so this stays comfortably inside any serverless time cap (Hobby is 60s).
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 512 * 1024;

// Starting an analysis is the expensive action (a paid unit), so it keeps the
// strict limits. Per-client blunts one loop; the global cap is what a caller
// rotating X-Forwarded-For cannot dodge.
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

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Please upload an image file." }, { status: 400 });
    }

    // Reject oversized uploads by declared length BEFORE buffering the body. A
    // chunked request without one would otherwise let formData() buffer
    // unbounded; browsers always set it for FormData, so real uploads are fine.
    const declaredLen = Number(req.headers.get("content-length"));
    if (!Number.isFinite(declaredLen) || declaredLen <= 0 || declaredLen > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Image too large (max 10MB)." }, { status: 413 });
    }

    // The content-type check above is a substring test, so a header with no
    // boundary, a boundary that doesn't match the body, and a mobile upload
    // truncated mid-part all reach here and reject with "Failed to parse body
    // as FormData." That matches nothing in analyzeErrorResponse and became a
    // 500 — telling the user to retry a request that can never succeed, and
    // counting their malformed upload as our outage.
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "That upload was incomplete. Please try again." }, { status: 400 });
    }
    const file = form.get("image");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Please upload an image file." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image too large (max 10MB)." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    // Trust the bytes, not the client-supplied MIME.
    if (!sniffImageMime(buf)) {
      return NextResponse.json({ error: "Please upload a JPEG, PNG, or WebP image." }, { status: 400 });
    }

    let profile: UserProfile | undefined;
    const profileStr = form.get("profile");
    if (typeof profileStr === "string" && profileStr) {
      try {
        profile = sanitizeProfile(JSON.parse(profileStr));
      } catch {
        return NextResponse.json({ error: "Invalid profile data." }, { status: 400 });
      }
    }

    // No API key (fresh clone): serve sample data immediately, clearly labeled
    // as such by `scores.source` so the UI can say so.
    if (!isRealMode()) {
      return NextResponse.json({
        state: "success",
        result: buildAnalyzeResult(mockScoresFor({ imageBytes: buf.length }), profile),
      });
    }

    // Live: face detection runs inside this call, so a photo with no face is
    // rejected here — before a paid unit is spent.
    const taskId = await startRealAnalysis(buf);
    return NextResponse.json({ state: "pending", taskId }, { status: 202 });
  } catch (err) {
    console.error("analyze start error", err);
    const { status, message } = analyzeErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
