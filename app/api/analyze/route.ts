import { NextRequest, NextResponse } from "next/server";
import { analyzeSkin } from "@/lib/skinClient";
import { getPlan } from "@/lib/agent";
import { applySafety } from "@/lib/safety";
import { matchProducts } from "@/lib/products";
import type { UserProfile, AnalyzeResult } from "@/lib/types";

export const runtime = "nodejs";
// Real Perfect Corp flow polls a few seconds; raise the serverless limit above
// the Vercel Hobby default of 10s. (Mock mode returns instantly.)
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 512 * 1024; // image + room for the profile field

// Best-effort in-memory rate limit. This is per-instance only (a real deploy
// should front it with a shared store, e.g. Upstash) but it still blunts a
// simple denial-of-wallet loop against the paid upstream. Generous enough that
// no real demo user is affected.
const RL_WINDOW_MS = 60_000;
const RL_MAX = 20;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // crude cap so the map can't grow unbounded
  return recent.length > RL_MAX;
}

// Verify real image magic bytes rather than trusting the client-supplied MIME.
// Returns the canonical MIME, or null if the bytes are not a supported image.
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    if (rateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
    }

    let imageBuffer: Buffer | null = null;
    let mime = "image/jpeg";
    let profile: UserProfile | undefined;
    let variant: string | undefined;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      // Reject oversized uploads by declared length BEFORE buffering the body.
      const declaredLen = Number(req.headers.get("content-length") || 0);
      if (declaredLen > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "Image too large (max 10MB)." }, { status: 413 });
      }

      const form = await req.formData();
      const file = form.get("image");
      // Multipart means upload intent: an image is required (so real mode never
      // silently falls back to mock data on a missing file).
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Please upload an image file." }, { status: 400 });
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Image too large (max 10MB)." }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const sniffed = sniffImageMime(buf);
      if (!sniffed) {
        return NextResponse.json({ error: "Please upload a JPEG, PNG, or WebP image." }, { status: 400 });
      }
      mime = sniffed; // trust the bytes, not file.type
      imageBuffer = buf;

      const profileStr = form.get("profile");
      if (typeof profileStr === "string" && profileStr) {
        try {
          profile = JSON.parse(profileStr);
        } catch {
          return NextResponse.json({ error: "Invalid profile data." }, { status: 400 });
        }
      }
    } else {
      const body = await req.json().catch(() => ({}));
      profile = body.profile;
      variant = body.variant;
    }

    // 1) Skin analysis (mock unless PERFECTCORP_API_KEY set)
    const scores = await analyzeSkin(imageBuffer, { variant, mime });

    // 2) Agent plan (deterministic core; LLM narration if configured)
    const rawPlan = await getPlan(scores);

    // 3) Safety gate
    const { plan, excludeIngredients, warnings } = applySafety(rawPlan, profile);
    plan.cautions = [...plan.cautions, ...warnings];

    // 4) Deterministic product match
    const products = matchProducts(plan.product_criteria, profile?.budget, excludeIngredients);

    const result: AnalyzeResult = { scores, plan, products, profile };
    return NextResponse.json(result);
  } catch (err) {
    console.error("analyze error", err);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
