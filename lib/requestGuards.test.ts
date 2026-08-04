import { describe, test, expect } from "vitest";
import { sanitizeProfile, sniffImageMime, clientIdentity, RateLimiter, demoVariant } from "./requestGuards";

describe("sanitizeProfile", () => {
  test("keeps the four known fields when well-typed", () => {
    expect(sanitizeProfile({ skinType: "oily", budget: 25, pregnant: true, sensitive: false })).toEqual({
      skinType: "oily",
      budget: 25,
      pregnant: true,
      sensitive: false,
    });
  });

  test("drops an unknown skin type instead of trusting it", () => {
    expect(sanitizeProfile({ skinType: "reptile" })).toEqual({});
  });

  test("drops a negative or non-finite budget", () => {
    expect(sanitizeProfile({ budget: -50 })).toEqual({});
    expect(sanitizeProfile({ budget: Number.NaN })).toEqual({});
    expect(sanitizeProfile({ budget: "25" })).toEqual({});
  });

  test("drops non-boolean pregnant (the safety gate must never see a truthy string)", () => {
    expect(sanitizeProfile({ pregnant: "yes" })).toEqual({});
  });

  test("never copies unexpected keys through", () => {
    const p = sanitizeProfile({ skinType: "dry", admin: true, budget: 10 }) as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(["budget", "skinType"]);
  });

  test("non-objects yield undefined", () => {
    expect(sanitizeProfile("hacker")).toBeUndefined();
    expect(sanitizeProfile(null)).toBeUndefined();
    expect(sanitizeProfile(42)).toBeUndefined();
  });
});

describe("sniffImageMime", () => {
  test("recognizes JPEG, PNG and WebP magic bytes", () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
    expect(sniffImageMime(webp)).toBe("image/webp");
  });

  test("rejects a non-image and a truncated header", () => {
    expect(sniffImageMime(Buffer.from("GIF89a not really an image"))).toBeNull();
    expect(sniffImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });
});

// Header bag shaped like the Headers/NextRequest API.
const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

describe("clientIdentity", () => {
  test("REGRESSION: a client-supplied x-forwarded-for cannot override the platform header", () => {
    const id = clientIdentity(
      headers({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 9.9.9.9" })
    );
    expect(id).toBe("203.0.113.7");
  });

  test("uses x-real-ip when no platform-verified header is present", () => {
    expect(clientIdentity(headers({ "x-real-ip": "198.51.100.9", "x-forwarded-for": "1.2.3.4" }))).toBe("198.51.100.9");
  });

  test("falls back to the rightmost x-forwarded-for entry", () => {
    expect(clientIdentity(headers({ "x-forwarded-for": "1.2.3.4, 198.51.100.9" }))).toBe("198.51.100.9");
  });

  test("falls back to a constant when nothing identifies the caller", () => {
    expect(clientIdentity(headers({}))).toBe("local");
  });
});

describe("demoVariant", () => {
  test("returns the requested demo variant", () => {
    expect(demoVariant({ variant: "oily_acne" })).toBe("oily_acne");
  });

  test("an unknown variant name still counts as demo intent (falls back to the default)", () => {
    expect(demoVariant({ variant: "nonsense" })).toBe("nonsense");
  });

  test("REGRESSION: a malformed or empty body is NOT demo intent (never serve fabricated scores)", () => {
    expect(demoVariant({})).toBeNull();
    expect(demoVariant(null)).toBeNull();
    expect(demoVariant("garbage")).toBeNull();
    expect(demoVariant({ profile: { budget: 20 } })).toBeNull();
    expect(demoVariant({ variant: 42 })).toBeNull();
  });

  test("an explicit demo flag also counts", () => {
    expect(demoVariant({ demo: true })).toBe("balanced");
  });
});

describe("RateLimiter", () => {
  test("allows requests under the per-client limit", () => {
    const rl = new RateLimiter({ windowMs: 1000, perClient: 3, global: 100 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 1).allowed).toBe(true);
    expect(rl.check("a", 2).allowed).toBe(true);
  });

  test("blocks a client past its limit", () => {
    const rl = new RateLimiter({ windowMs: 1000, perClient: 2, global: 100 });
    rl.check("a", 0);
    rl.check("a", 1);
    expect(rl.check("a", 2)).toEqual({ allowed: false, reason: "client" });
  });

  test("REGRESSION: rotating the client identity cannot exceed the global cap (denial-of-wallet)", () => {
    const rl = new RateLimiter({ windowMs: 1000, perClient: 2, global: 5 });
    const results = [];
    for (let i = 0; i < 10; i++) results.push(rl.check(`spoofed-${i}`, i));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results[9]).toEqual({ allowed: false, reason: "global" });
  });

  test("the window rolls forward: old hits stop counting", () => {
    const rl = new RateLimiter({ windowMs: 1000, perClient: 2, global: 100 });
    rl.check("a", 0);
    rl.check("a", 1);
    expect(rl.check("a", 2).allowed).toBe(false);
    expect(rl.check("a", 1001).allowed).toBe(true);
  });

  test("REGRESSION: evicting stale clients does not reset an actively-blocked client", () => {
    const rl = new RateLimiter({ windowMs: 1000, perClient: 2, global: 10_000, maxClients: 3 });
    rl.check("attacker", 0);
    rl.check("attacker", 0);
    expect(rl.check("attacker", 0).allowed).toBe(false);
    // Flood with fresh identities to force eviction.
    for (let i = 0; i < 50; i++) rl.check(`flood-${i}`, 1);
    expect(rl.check("attacker", 2).allowed).toBe(false);
  });

  test("keeps memory bounded while flooded with unique identities", () => {
    const rl = new RateLimiter({ windowMs: 1000, perClient: 2, global: 10_000, maxClients: 10 });
    for (let i = 0; i < 500; i++) rl.check(`flood-${i}`, i);
    expect(rl.size()).toBeLessThanOrEqual(10);
  });
});
