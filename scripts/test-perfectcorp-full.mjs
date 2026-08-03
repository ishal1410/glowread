// Full end-to-end Perfect Corp S2S test. SPENDS 1 ANALYSIS UNIT.
// Dumps the raw response at every step so we can fix parsing to the real shapes.
// Run: node scripts/test-perfectcorp-full.mjs "C:\\path\\to\\your\\selfie.jpg"
import { readFileSync } from "node:fs";
import sharp from "sharp";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const key = process.env.PERFECTCORP_API_KEY;
const BASE = process.env.PERFECTCORP_BASE_URL || "https://yce-api-01.makeupar.com";
const imgPath = process.argv[2];
if (!key) { console.error("no PERFECTCORP_API_KEY"); process.exit(1); }
if (!imgPath) { console.error('pass an image path: node scripts/test-perfectcorp-full.mjs "C:\\\\...\\\\selfie.jpg"'); process.exit(1); }

let img = readFileSync(imgPath);
// HD skin analysis requires short side >= 1080 (and long <= 4096). Upscale if needed.
const meta = await sharp(img).metadata();
console.log(`orig ${meta.width}x${meta.height}`);
const shortSide = Math.min(meta.width, meta.height);
if (shortSide < 1080) {
  const scale = 1080 / shortSide;
  img = await sharp(img).resize(Math.round(meta.width * scale), Math.round(meta.height * scale)).jpeg({ quality: 92 }).toBuffer();
  const m2 = await sharp(img).metadata();
  console.log(`upscaled -> ${m2.width}x${m2.height} (${img.length} bytes)`);
}
const mime = "image/jpeg";
const auth = { Authorization: `Bearer ${key}` };
const CONCERNS = ["wrinkle", "pore", "texture", "acne", "spot", "redness", "oiliness", "moisture", "dark_circle", "firmness", "radiance"];
console.log(`image=${imgPath} bytes=${img.length} mime=${mime}\nBASE=${BASE}\n`);

// 1) init
const initRes = await fetch(`${BASE}/s2s/v2.0/file/skin-analysis`, {
  method: "POST", headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ files: [{ content_type: mime, file_name: "selfie", file_size: img.length }] }),
});
const init = await initRes.json();
console.log("STEP1 init", initRes.status, JSON.stringify(init).slice(0, 700), "\n");
const file = init?.data?.files?.[0] ?? init?.result?.files?.[0] ?? init?.files?.[0];
const uploadUrl = file?.requests?.[0]?.url ?? file?.url;
const fileId = file?.file_id ?? file?.id;
const uploadHeaders = file?.requests?.[0]?.headers;
console.log("  fileId=", fileId, "\n  uploadHeaders(prescribed)=", JSON.stringify(uploadHeaders), "\n");

// 2) PUT — honor prescribed headers if given, else content-type
const putHeaders = uploadHeaders && typeof uploadHeaders === "object"
  ? uploadHeaders : { "Content-Type": mime };
const put = await fetch(uploadUrl, { method: "PUT", headers: putHeaders, body: new Uint8Array(img) });
console.log("STEP2 PUT", put.status, put.ok ? "(uploaded)" : await put.text().then((t) => t.slice(0, 300)), "\n");

// 3) task — confirmed flat shape. Toggle SD/HD via env CONCERN_SET=sd|hd.
const HD = ["hd_wrinkle", "hd_firmness", "hd_pore", "hd_texture", "hd_acne", "hd_age_spot", "hd_redness", "hd_moisture", "hd_oiliness", "hd_dark_circle", "hd_radiance"];
const SD = ["wrinkle", "firmness", "pore", "texture", "acne", "age_spot", "redness", "moisture", "oiliness", "dark_circle_v2", "radiance"];
const set = (process.env.CONCERN_SET || "hd").toLowerCase() === "sd" ? SD : HD;
console.log(`concern set = ${process.env.CONCERN_SET || "hd"}`);
const taskRes = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis`, {
  method: "POST", headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ src_file_id: fileId, dst_actions: set, miniserver_args: { enable_mask_overlay: true }, format: "json" }),
});
const task = await taskRes.json();
console.log("STEP3 task", taskRes.status, JSON.stringify(task).slice(0, 400), "\n");
const taskId = task?.data?.task_id ?? task?.result?.task_id ?? task?.task_id;
console.log("  taskId=", taskId, "\n");

// 4) poll — real state field is data.task_status ("running"/"success"/"error").
const t0 = Date.now();
for (let i = 0; i < 45 && taskId; i++) {
  const poll = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis/${taskId}`, { headers: auth });
  const p = await poll.json();
  const st = p?.data?.task_status ?? p?.data?.status;
  console.log(`STEP4 poll#${i} t=${((Date.now() - t0) / 1000).toFixed(0)}s http=${poll.status} task_status=${st}`);
  if (st === "success" || st === "done") {
    const out = process.env.CAPTURE_OUT;
    if (out) { const { writeFileSync } = await import("node:fs"); writeFileSync(out, JSON.stringify(p, null, 2)); console.log(`\n==== SUCCESS after ${((Date.now() - t0) / 1000).toFixed(0)}s -> wrote ${out} ====`); }
    else console.log(`\n==== SUCCESS after ${((Date.now() - t0) / 1000).toFixed(0)}s ====\n`, JSON.stringify(p, null, 2).slice(0, 6000));
    break;
  }
  if (st === "error" || st === "failed") {
    console.log("FAILED:", JSON.stringify(p).slice(0, 700)); break;
  }
  await new Promise((r) => setTimeout(r, 2000));
}
