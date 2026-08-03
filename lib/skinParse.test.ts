import { describe, test, expect } from "vitest";
import {
  parseInitResponse,
  buildTaskBody,
  parseTaskId,
  readPollState,
  mapConcernsToScores,
  pollUntilDone,
  HD_CONCERNS,
} from "./skinParse";

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
