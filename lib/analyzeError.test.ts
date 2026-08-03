import { describe, test, expect } from "vitest";
import { analyzeErrorResponse } from "./analyzeError";

describe("analyzeErrorResponse", () => {
  test("face-too-small -> 400 with an actionable photo message", () => {
    const r = analyzeErrorResponse(new Error("analysis failed: error_src_face_too_small"));
    expect(r.status).toBe(400);
    expect(r.message).toMatch(/face/i);
  });

  test("no-face-detected -> 400 photo message", () => {
    const r = analyzeErrorResponse(new Error("analysis failed: error_no_face"));
    expect(r.status).toBe(400);
    expect(r.message).toMatch(/face/i);
  });

  test("credit exhaustion -> 503 temporarily-unavailable (not a user error)", () => {
    const r = analyzeErrorResponse(
      new Error('task create failed: 400 {"error_code":"CreditInsufficiency"}')
    );
    expect(r.status).toBe(503);
    expect(r.message).toMatch(/temporarily|later/i);
  });

  test("unknown error -> generic 500", () => {
    const r = analyzeErrorResponse(new Error("something weird"));
    expect(r.status).toBe(500);
    expect(r.message).toMatch(/try again/i);
  });

  test("non-Error input is tolerated -> generic 500", () => {
    const r = analyzeErrorResponse("boom");
    expect(r.status).toBe(500);
  });
});
