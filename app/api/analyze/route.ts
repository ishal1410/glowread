import { NextRequest, NextResponse } from "next/server";
import { analyzeSkin } from "@/lib/skinClient";
import { getPlan } from "@/lib/agent";
import { applySafety } from "@/lib/safety";
import { matchProducts } from "@/lib/products";
import type { UserProfile, AnalyzeResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    let imageBuffer: Buffer | null = null;
    let profile: UserProfile | undefined;
    let variant: string | undefined;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("image");
      if (file && typeof file !== "string") {
        imageBuffer = Buffer.from(await file.arrayBuffer());
      }
      const profileStr = form.get("profile");
      if (typeof profileStr === "string" && profileStr) profile = JSON.parse(profileStr);
    } else {
      const body = await req.json().catch(() => ({}));
      profile = body.profile;
      variant = body.variant;
    }

    // 1) Skin analysis (mock unless PERFECTCORP_API_KEY set)
    const scores = await analyzeSkin(imageBuffer, { variant });

    // 2) Agent plan (deterministic core; LLM narration if configured)
    const rawPlan = await getPlan(scores, profile);

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
