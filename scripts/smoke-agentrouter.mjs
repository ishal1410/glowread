// One-shot smoke test for the AgentRouter (Anthropic-compatible) gateway.
// Confirms base URL, key, CLI-shaped headers, and model name work BEFORE demo
// day — the app's silent fallback would otherwise mask a broken gateway as
// "just using mock".
//
// Uses plain fetch (NOT the Anthropic SDK): AgentRouter wraps its response in a
// non-standard `billing` object that breaks the SDK's response typing, and its
// WAF only accepts Claude-Code-shaped traffic. fetch lets us set the exact
// headers and parse content[0].text ourselves.
//
// Run:  node scripts/smoke-agentrouter.mjs
// Reads AGENTROUTER_API_KEY / _BASE_URL / _MODEL from .env.local (or real env).

import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      if (!(k in process.env)) process.env[k] = v.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local — rely on real env */
  }
}

loadEnvLocal();

const apiKey = process.env.AGENTROUTER_API_KEY;
const baseURL = process.env.AGENTROUTER_BASE_URL || "https://agentrouter.org";
const model = process.env.AGENTROUTER_MODEL || "claude-opus-5";

if (!apiKey) {
  console.error("MISSING AGENTROUTER_API_KEY. Add it to .env.local first.");
  process.exit(1);
}

console.log(`base=${baseURL}\nmodel=${model}\n---`);

try {
  const res = await fetch(`${baseURL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // AgentRouter's WAF only accepts Claude-Code-shaped traffic; present the
      // CLI's client identity or it returns 401 unauthorized_client_error.
      "User-Agent": "claude-cli/1.0.0 (external, cli)",
      "x-app": "cli",
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      system: "Respond with strict JSON only.",
      messages: [
        {
          role: "user",
          content:
            'Return exactly this JSON, no prose: {"ok": true, "who": "<the model name answering>"}',
        },
      ],
    }),
    signal: AbortSignal.timeout(40000),
  });

  if (!res.ok) {
    console.log("STATUS: FAIL");
    console.log("HTTP STATUS:", res.status);
    console.log("BODY:", (await res.text()).slice(0, 800));
    process.exit(2);
  }

  const data = await res.json();
  const text = data?.content?.find((b) => b.type === "text")?.text ?? "(no text block)";
  console.log("STATUS: OK");
  console.log("RAW TEXT:", text);
  console.log("USAGE:", JSON.stringify(data?.usage));
  console.log("STOP_REASON:", data?.stop_reason);
} catch (err) {
  console.log("STATUS: FAIL");
  console.log("NAME:", err?.name);
  console.log("MESSAGE:", err?.message);
  process.exit(2);
}
