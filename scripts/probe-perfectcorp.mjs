// FREE auth/host probe for Perfect Corp S2S. Calls only step 1 (file init),
// which returns a presigned upload URL and does NOT consume analysis units.
// Confirms the key, host, and auth scheme before we spend a real unit.
// Run: node scripts/probe-perfectcorp.mjs
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const key = process.env.PERFECTCORP_API_KEY;
const BASE = process.env.PERFECTCORP_BASE_URL || "https://yce-api-01.makeupar.com";
if (!key) { console.error("no PERFECTCORP_API_KEY"); process.exit(1); }

const body = JSON.stringify({
  files: [{ content_type: "image/jpeg", file_name: "selfie.jpg", file_size: 123456 }],
});

// Try a few plausible auth headers; file-init is free so probing is safe.
const attempts = [
  { label: "Bearer key", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } },
  { label: "x-api-key", headers: { "x-api-key": key, "Content-Type": "application/json" } },
];

for (const a of attempts) {
  try {
    const res = await fetch(`${BASE}/s2s/v2.0/file/skin-analysis`, {
      method: "POST", headers: a.headers, body, signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    console.log(`\n[${a.label}] HTTP ${res.status}`);
    console.log(text.slice(0, 600));
    if (res.ok) { console.log(`\n==> AUTH OK via "${a.label}"`); break; }
  } catch (e) {
    console.log(`\n[${a.label}] ERROR: ${e.name} ${e.message}`);
  }
}
