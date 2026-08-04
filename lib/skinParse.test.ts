import { describe, test, expect } from "vitest";
import {
  parseInitResponse,
  buildTaskBody,
  parseTaskId,
  readPollState,
  mapConcernsToScores,
  parseSkinAnalysis,
  assertUsableScores,
  pollUntilDone,
  faceFillCrop,
  expandFaceBox,
  HD_CONCERNS,
} from "./skinParse";
import { rankByBadness } from "./metrics";

// REAL success payload shape captured live from yce-api-01.makeupar.com on
// 2026-08-03 (scripts/test-perfectcorp-full.mjs, CAPTURE_OUT). mask_urls trimmed
// for brevity but every type/score/region field is verbatim from the live call.
// KEY FACT pinned here: Perfect Corp raw_score/ui_score are HIGHER = BETTER for
// every concern (this clear face scored redness/texture/pore = ~100), the OPPOSITE
// of the app's convention — so parseSkinAnalysis must invert non-attribute keys.
const REAL_SUCCESS = {
  output: [
    { type: "hd_radiance", raw_score: 90, ui_score: 85, url: null },
    { type: "hd_firmness", raw_score: 66, ui_score: 74, url: null },
    { type: "hd_dark_circle", raw_score: 48, ui_score: 64, url: null },
    { type: "hd_redness", raw_score: 100, ui_score: 99, url: null },
    { type: "hd_oiliness", raw_score: 93, ui_score: 90, url: null },
    { type: "hd_age_spot", raw_score: 96, ui_score: 91, url: null },
    { type: "hd_moisture", raw_score: 70, ui_score: 77, url: null },
    { type: "hd_acne", raw_score: 75, ui_score: 85, region: "whole", url: null },
    { type: "hd_texture", raw_score: 100, ui_score: 99, region: "whole", url: null },
    { type: "hd_pore", raw_score: 100, ui_score: 99, region: "forehead", url: null },
    { type: "hd_pore", raw_score: 100, ui_score: 99, region: "nose", url: null },
    { type: "hd_pore", raw_score: 100, ui_score: 99, region: "cheek", url: null },
    { type: "hd_pore", raw_score: 100, ui_score: 99, region: "whole", url: null },
    { type: "hd_wrinkle", raw_score: 76, ui_score: 75, region: "forehead", url: null },
    { type: "hd_wrinkle", raw_score: 90, ui_score: 80, region: "glabellar", url: null },
    { type: "hd_wrinkle", raw_score: 99, ui_score: 96, region: "crowfeet", url: null },
    { type: "hd_wrinkle", raw_score: 94, ui_score: 87, region: "whole", url: null },
    { type: "all", score: 86, url: null },
    { type: "skin_age", score: 32, url: null },
    { type: "resize_image", mask_urls: ["https://x/resize.jpg"], url: null },
  ],
};

// A controllable fake clock so poll timing is deterministic (no real waiting).
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

// Fixtures below are REAL responses captured from the live Perfect Corp S2S API
// (yce-api-01.makeupar.com) via scripts/test-perfectcorp-full.mjs on 2026-08-02.

describe("parseInitResponse", () => {
  // Real step-1 response: payload wrapped in `data`, file under data.files[0],
  // presigned PUT url + prescribed headers under requests[0].
  const REAL_INIT = {
    status: 200,
    data: {
      files: [
        {
          content_type: "image/jpeg",
          file_name: "selfie",
          file_id: "qBJiA5WDTvvucF7yL1gCsk/jDGKlur48",
          requests: [
            {
              method: "PUT",
              url: "https://yce-us.s3-accelerate.amazonaws.com/ttl30/x.jpg?X-Amz-Signature=abc",
              headers: { "Content-Length": "29490", "Content-Type": "image/jpeg" },
            },
          ],
        },
      ],
    },
  };

  test("extracts fileId, https upload url, and prescribed headers", () => {
    const r = parseInitResponse(REAL_INIT);
    expect(r.fileId).toBe("qBJiA5WDTvvucF7yL1gCsk/jDGKlur48");
    expect(r.uploadUrl).toMatch(/^https:\/\/yce-us\.s3-accelerate/);
    expect(r.uploadHeaders).toEqual({ "Content-Length": "29490", "Content-Type": "image/jpeg" });
  });

  test("throws if the file entry is missing", () => {
    expect(() => parseInitResponse({ status: 200, data: { files: [] } })).toThrow();
  });

  test("throws if the upload url is not https", () => {
    const bad = structuredClone(REAL_INIT);
    bad.data.files[0].requests[0].url = "http://evil.example/x";
    expect(() => parseInitResponse(bad)).toThrow(/https/i);
  });
});

describe("buildTaskBody", () => {
  // Real API rejected the nested file_sets/actions shape (400 InvalidParameters)
  // and accepted a FLAT { src_file_id, dst_actions } body.
  test("produces the flat shape the live API accepts", () => {
    const body = buildTaskBody("FILE123", HD_CONCERNS);
    expect(body).toEqual({
      src_file_id: "FILE123",
      dst_actions: HD_CONCERNS,
      miniserver_args: { enable_mask_overlay: true },
      format: "json",
    });
  });

  test("uses only HD concern names (SD/HD cannot be mixed)", () => {
    expect(HD_CONCERNS.every((c) => c.startsWith("hd_"))).toBe(true);
  });
});

describe("parseTaskId", () => {
  test("reads task_id from the data envelope", () => {
    expect(parseTaskId({ status: 200, data: { task_id: "TID-abc" } })).toBe("TID-abc");
  });
  test("throws when task_id is absent", () => {
    expect(() => parseTaskId({ status: 200, data: {} })).toThrow();
  });
});

describe("readPollState", () => {
  // Real: state lives in data.task_status ("running" | "success" | "error"),
  // NOT the top-level `status` (which is the HTTP echo = 200).
  test("running", () => {
    expect(readPollState({ status: 200, data: { task_status: "running", results: null } }).state).toBe("running");
  });
  test("error surfaces the API error message", () => {
    const real = { status: 200, data: { error: "error_src_face_too_small", results: null, task_status: "error" } };
    const s = readPollState(real);
    expect(s.state).toBe("error");
    if (s.state !== "error") throw new Error("expected error state");
    expect(s.error).toBe("error_src_face_too_small");
  });
  test("does NOT treat the HTTP status echo (200) as completion", () => {
    // top-level status:200 must not be read as a task state
    expect(readPollState({ status: 200, data: { task_status: "running" } }).state).toBe("running");
  });
});

describe("mapConcernsToScores", () => {
  test("strips hd_ prefix and attaches human labels", () => {
    const s = mapConcernsToScores({ hd_wrinkle: { raw_score: 40 }, hd_pore: { raw_score: 30 } });
    const byKey = Object.fromEntries(s.concerns.map((c) => [c.key, c]));
    expect(byKey.wrinkle.label).toBe("Wrinkles");
    expect(byKey.pore.label).toBe("Pores");
    expect(s.source).toBe("perfectcorp");
  });

  test("normalizes API concern names to app keys", () => {
    const s = mapConcernsToScores({
      hd_moisture: { raw_score: 50 },
      hd_age_spot: { raw_score: 20 },
      dark_circle_v2: { raw_score: 33 },
    });
    const keys = s.concerns.map((c) => c.key).sort();
    expect(keys).toEqual(["dark_circle", "hydration", "spot"]);
  });

  test("ui_score falls back to raw_score, raw_score falls back to score", () => {
    const s = mapConcernsToScores({ hd_acne: { raw_score: 60 }, hd_texture: { score: 45 } });
    const byKey = Object.fromEntries(s.concerns.map((c) => [c.key, c]));
    expect(byKey.acne.ui_score).toBe(60);      // no ui_score -> use raw_score
    expect(byKey.texture.raw_score).toBe(45);  // no raw_score -> use score
    expect(byKey.texture.ui_score).toBe(45);
  });

  test("healthScore is polarity-aware: high firmness raises health, high wrinkle lowers it", () => {
    // firmness is higher-is-better (badness = 100-90 = 10); wrinkle higher-is-worse (badness 10).
    // mean badness = 10 -> health = 90.
    const good = mapConcernsToScores({ hd_firmness: { raw_score: 90 }, hd_wrinkle: { raw_score: 10 } });
    expect(good.healthScore).toBe(90);
    // low firmness (badness 90) + high wrinkle (badness 90) -> health 10.
    const bad = mapConcernsToScores({ hd_firmness: { raw_score: 10 }, hd_wrinkle: { raw_score: 90 } });
    expect(bad.healthScore).toBe(10);
  });

  test("empty results -> no concerns, healthScore 0 (triggers minimalPlan upstream)", () => {
    const s = mapConcernsToScores({});
    expect(s.concerns).toEqual([]);
    expect(s.healthScore).toBe(0);
  });

  test("null concern entries are tolerated (score 0)", () => {
    const s = mapConcernsToScores({ hd_redness: null });
    expect(s.concerns[0]).toMatchObject({ key: "redness", raw_score: 0, ui_score: 0 });
  });

  test("skinAge is passed through when the API provides it", () => {
    const s = mapConcernsToScores({ hd_wrinkle: { raw_score: 40 } }, 34);
    expect(s.skinAge).toBe(34);
  });
});

describe("parseSkinAnalysis (real live shape)", () => {
  const s = parseSkinAnalysis(REAL_SUCCESS);
  const byKey = Object.fromEntries(s.concerns.map((c) => [c.key, c]));

  test("produces exactly the 11 app concern keys (specials dropped, regions collapsed)", () => {
    expect(s.concerns.map((c) => c.key).sort()).toEqual(
      ["acne", "dark_circle", "firmness", "hydration", "oiliness", "pore", "radiance", "redness", "spot", "texture", "wrinkle"]
    );
  });

  test("INVERTS higher-is-worse concerns (PC higher=better) into app convention", () => {
    // redness PC raw 100 (=perfect/clear) -> app raw 0 (no concern); ui 99 -> 1.
    expect(byKey.redness.raw_score).toBe(0);
    expect(byKey.redness.ui_score).toBe(1);
    // texture/pore PC 100 -> app 0 (clear).
    expect(byKey.texture.raw_score).toBe(0);
    expect(byKey.pore.raw_score).toBe(0);
    // dark_circle PC raw 48 -> app 52 (his worst concern, matches the photo).
    expect(byKey.dark_circle.raw_score).toBe(52);
    expect(byKey.dark_circle.ui_score).toBe(36); // 100-64
  });

  test("does NOT invert attribute concerns (firmness/hydration/radiance already higher=better)", () => {
    expect(byKey.firmness.raw_score).toBe(66);
    expect(byKey.radiance.raw_score).toBe(90);
    expect(byKey.hydration.raw_score).toBe(70); // from hd_moisture
  });

  test("collapses multi-region concerns using the 'whole' region", () => {
    // wrinkle whole PC raw 94 -> app raw 6 (ignores the higher per-region values).
    expect(byKey.wrinkle.raw_score).toBe(6);
    expect(byKey.wrinkle.ui_score).toBe(13); // 100-87
  });

  test("uses the API's 'all' overall as healthScore and 'skin_age' as skinAge", () => {
    expect(s.healthScore).toBe(86);
    expect(s.skinAge).toBe(32);
    expect(s.source).toBe("perfectcorp");
  });

  test("dark_circle is ranked the top concern (highest badness) for this face", () => {
    // sanity: the parser's output, ranked by the app's badness, surfaces the
    // concern that visibly matches the photo — proves polarity is correct.
    const top = rankByBadness(s.concerns, "raw_score")[0];
    expect(top.key).toBe("dark_circle");
  });
});

describe("faceFillCrop", () => {
  const sizes: [number, number][] = [[600, 600], [1000, 1000], [2000, 1000], [1000, 2000], [1290, 1600]];

  test("crop box is strictly inside the image bounds for every aspect", () => {
    for (const [w, h] of sizes) {
      const b = faceFillCrop(w, h);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.left + b.width).toBeLessThanOrEqual(w);
      expect(b.top + b.height).toBeLessThanOrEqual(h);
    }
  });

  test("box is smaller than the source (it zooms in) and integer-valued", () => {
    const b = faceFillCrop(1000, 1000);
    expect(b.width).toBeLessThan(1000);
    expect(b.height).toBeLessThan(1000);
    for (const v of [b.left, b.top, b.width, b.height]) expect(Number.isInteger(v)).toBe(true);
  });

  test("horizontally centered", () => {
    const b = faceFillCrop(1000, 800);
    expect(b.left).toBe(Math.round((1000 - b.width) / 2));
  });

  test("biased upward: keeps more of the top than the bottom (face sits upper-middle)", () => {
    const b = faceFillCrop(1000, 1000);
    const removedTop = b.top;
    const removedBottom = 1000 - (b.top + b.height);
    expect(removedTop).toBeLessThan(removedBottom);
  });
});

describe("expandFaceBox", () => {
  // face-api tinyFaceDetector returned this box for the passport (600x600).
  const faceBox = { x: 177, y: 168, width: 244, height: 206 };

  test("expands around the face, stays square and inside the image", () => {
    const b = expandFaceBox(faceBox, 600, 600);
    expect(b.width).toBe(b.height); // square
    expect(b.width).toBeGreaterThan(faceBox.width); // padded beyond the tight face
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.top).toBeGreaterThanOrEqual(0);
    expect(b.left + b.width).toBeLessThanOrEqual(600);
    expect(b.top + b.height).toBeLessThanOrEqual(600);
  });

  test("crop side is ~1.4x the face (so upscaling makes the face large enough for the gate)", () => {
    const b = expandFaceBox(faceBox, 600, 600);
    const maxDim = Math.max(faceBox.width, faceBox.height);
    // Not clamped here, so it should be right around 1.4x.
    expect(b.width).toBeGreaterThanOrEqual(Math.round(maxDim * 1.3));
    expect(b.width).toBeLessThanOrEqual(Math.round(maxDim * 1.5));
  });

  test("biases the crop upward to include the forehead (center above the face-box center)", () => {
    const b = expandFaceBox(faceBox, 600, 600);
    const cropCenterY = b.top + b.height / 2;
    const faceCenterY = faceBox.y + faceBox.height / 2;
    expect(cropCenterY).toBeLessThan(faceCenterY);
  });

  test("clamps to bounds when the face sits near an edge", () => {
    const edge = { x: 10, y: 10, width: 200, height: 200 };
    const b = expandFaceBox(edge, 400, 400);
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.top).toBeGreaterThanOrEqual(0);
    expect(b.left + b.width).toBeLessThanOrEqual(400);
  });

  test("never exceeds the image (huge face in a small image)", () => {
    const b = expandFaceBox({ x: 0, y: 0, width: 500, height: 500 }, 512, 512);
    expect(b.width).toBeLessThanOrEqual(512);
    expect(b.height).toBeLessThanOrEqual(512);
    expect(b.left + b.width).toBeLessThanOrEqual(512);
  });
});

describe("assertUsableScores", () => {
  test("REGRESSION: a 'success' payload with no concerns is an error, not a skin health of 0", () => {
    const empty = parseSkinAnalysis({ output: [] });
    expect(() => assertUsableScores(empty)).toThrow(/no concerns|empty/i);
  });

  test("passes a real analysis through unchanged", () => {
    const scores = parseSkinAnalysis({
      output: [
        { type: "hd_acne", raw_score: 40, ui_score: 40 },
        { type: "all", score: 70 },
      ],
    });
    expect(assertUsableScores(scores)).toBe(scores);
  });
});

describe("pollUntilDone", () => {
  test("returns results once the task reports success", async () => {
    const clock = fakeClock();
    let calls = 0;
    const pollOnce = async () => {
      calls++;
      return calls < 3
        ? ({ state: "running" } as const)
        : ({ state: "success", results: { hd_wrinkle: { raw_score: 40 } } } as const);
    };
    const results = await pollUntilDone({ pollOnce, ...clock, budgetMs: 60000, intervalMs: 1500 });
    expect(results).toEqual({ hd_wrinkle: { raw_score: 40 } });
    expect(calls).toBe(3);
  });

  test("a transient poll error is swallowed and polling continues (does NOT propagate)", async () => {
    const clock = fakeClock();
    let calls = 0;
    const pollOnce = async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET"); // one flaky poll
      return { state: "success", results: { ok: true } } as const;
    };
    const results = await pollUntilDone({ pollOnce, ...clock, budgetMs: 60000, intervalMs: 1500 });
    expect(results).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  test("throws with the API error message when the task fails", async () => {
    const clock = fakeClock();
    const pollOnce = async () => ({ state: "error", error: "error_src_face_too_small" } as const);
    await expect(
      pollUntilDone({ pollOnce, ...clock, budgetMs: 60000, intervalMs: 1500 })
    ).rejects.toThrow(/error_src_face_too_small/);
  });

  test("throws a timeout when the budget elapses while still running", async () => {
    const clock = fakeClock();
    const pollOnce = async () => ({ state: "running" } as const);
    await expect(
      pollUntilDone({ pollOnce, ...clock, budgetMs: 5000, intervalMs: 1500 })
    ).rejects.toThrow(/timed out/i);
  });
});
