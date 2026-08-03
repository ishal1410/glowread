import type { NextConfig } from "next";

// Content-Security-Policy scoped to what the app actually uses in the browser.
// 'unsafe-inline' is required for Next's inline hydration bootstrap and the
// inline style props used throughout the UI (removing it needs nonce plumbing).
// Perfect Corp and Gemini are called server-side, so they need no connect-src.
//
// 'unsafe-eval' is added in DEVELOPMENT ONLY: Next's dev runtime (Turbopack /
// React Refresh / the error overlay) evaluates code via eval(), so without it
// the browser logs a CSP violation on every page and Next shows a "1 Issue"
// badge. Production React never uses eval(), so the prod CSP stays strict.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Face detection + image libs load native/wasm/model files from node_modules at
  // runtime; keep them out of the bundler so those assets resolve correctly.
  serverExternalPackages: [
    "@vladmandic/face-api",
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-backend-wasm",
    "sharp",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
