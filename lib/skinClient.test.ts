import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pollRealAnalysis } from "./skinClient";

// A poll is one tick of a loop the browser drives. A transient upstream hiccup
// must not end the analysis: the task is still running and the paid unit is
// already spent, so the only correct answer is "keep polling".
describe("pollRealAnalysis transient failures", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.PERFECTCORP_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  for (const status of [429, 500, 502, 503, 504]) {
    it(`reports still-running on an upstream ${status}`, async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status }) as unknown as typeof fetch;
      await expect(pollRealAnalysis("task-1")).resolves.toEqual({ state: "running" });
    });
  }

  it("reports still-running when the poll request times out", async () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    globalThis.fetch = vi.fn().mockRejectedValue(err) as unknown as typeof fetch;
    await expect(pollRealAnalysis("task-1")).resolves.toEqual({ state: "running" });
  });

  it("still fails hard on 404, because that task is genuinely gone", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }) as unknown as typeof fetch;
    await expect(pollRealAnalysis("task-1")).rejects.toThrow(/404/);
  });

  // Upstream reports an expired task as 400 InvalidTaskId. The body carries the
  // only signal that distinguishes it from a real bad request, so it has to
  // reach the error message or the mapper cannot classify it.
  it("carries the upstream body into the error so an expired task is classifiable", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error_code":"InvalidTaskId"}',
    }) as unknown as typeof fetch;
    await expect(pollRealAnalysis("task-1")).rejects.toThrow(/InvalidTaskId/);
  });
});
