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

  test("REGRESSION: an unrelated error that merely contains 'face' is not a photo error", () => {
    expect(analyzeErrorResponse(new Error("TypeError: iface.surface is not a function")).status).toBe(500);
    expect(analyzeErrorResponse(new Error("upload failed: 403 SignatureDoesNotMatch")).status).toBe(500);
  });

  test("an unknown or expired analysis task -> 404 with an actionable message", () => {
    const r = analyzeErrorResponse(new Error("poll http 404: task not found"));
    expect(r.status).toBe(404);
    expect(r.message).toMatch(/new scan/i); // tells the user what to actually do
  });

  test("REGRESSION: an unrelated error that merely contains 'credential' is not a credit error", () => {
    expect(analyzeErrorResponse(new Error("invalid credentials for gateway")).status).toBe(500);
  });
});

describe("REGRESSION: an undecodable image is a client error, not a server fault", () => {
  test("maps a sharp decode failure to 400", () => {
    for (const msg of [
      "Input buffer contains unsupported image format",
      "VipsJpeg: Premature end of input file",
      "Input file is missing or of an unsupported image format",
    ]) {
      const r = analyzeErrorResponse(new Error(msg));
      expect(r.status).toBe(400);
      expect(r.message).toMatch(/couldn't be read|could not be read/i);
    }
  });
});
