/**
 * Records the whole silent demo in one continuous Playwright pass.
 *
 *   node scripts/record-demo.mjs
 *
 * Follows docs/DEMO_VIDEO_SILENT.md beat for beat. Costs 40 Perfect Corp units
 * (two real analyses); the beat-6 rejection is free because the local face
 * detector stops it before any metered call.
 *
 * Two things this handles that a naive script does not:
 *
 * 1. Playwright's recorder does NOT draw the mouse cursor, so clicks would look
 *    like they happen by themselves. A synthetic cursor is injected and follows
 *    real mouse events, with a pulse on mousedown.
 * 2. Cutting a silent edit needs exact beat boundaries. Every beat timestamp is
 *    written to beats.json relative to the first frame, so ffmpeg can cut and
 *    place captions without anyone scrubbing a timeline by hand.
 *
 * Env: DEMO_BASE (default https://glowread.vercel.app)
 *      DEMO_FACE, DEMO_NOFACE  (image paths)
 */
import pw from "playwright";
import { mkdir, writeFile, readdir, rename } from "node:fs/promises";
import { join, resolve } from "node:path";

const { chromium } = pw;

// Assets are deliberately NOT in the repo: the demo portrait is a licensed
// stock photo that must not be redistributed. Drop your own into ./demo-assets
// (a close-up, front-facing, unretouched face) or point DEMO_FACE elsewhere.
const BASE = process.env.DEMO_BASE || "https://glowread.vercel.app";
const FACE = process.env.DEMO_FACE || resolve("demo-assets/portrait.jpg");
const NOFACE = process.env.DEMO_NOFACE || resolve("demo-assets/noface.jpg");
const OUT = resolve(process.env.DEMO_OUT || "demo-capture");

const W = 1920;
const H = 1080;

// Injected before any page script. Draws a cursor the recorder can actually
// see, and pulses it on click.
const CURSOR = () => {
  const install = () => {
    if (document.getElementById("__democursor")) return;
    const el = document.createElement("div");
    el.id = "__democursor";
    el.style.cssText = [
      "position:fixed", "left:0", "top:0", "width:26px", "height:26px",
      "margin:-13px 0 0 -13px", "border-radius:50%",
      "border:2px solid rgba(139,92,246,0.95)",
      "background:rgba(139,92,246,0.22)",
      "box-shadow:0 0 14px rgba(139,92,246,0.55)",
      "pointer-events:none", "z-index:2147483647",
      "transition:transform 90ms linear, width 120ms ease, height 120ms ease",
      "will-change:transform",
    ].join(";");
    document.documentElement.appendChild(el);
    addEventListener("mousemove", (e) => {
      el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }, true);
    addEventListener("mousedown", () => {
      el.style.width = "40px"; el.style.height = "40px";
      el.style.margin = "-20px 0 0 -20px";
      el.style.background = "rgba(139,92,246,0.42)";
    }, true);
    addEventListener("mouseup", () => {
      el.style.width = "26px"; el.style.height = "26px";
      el.style.margin = "-13px 0 0 -13px";
      el.style.background = "rgba(139,92,246,0.22)";
    }, true);
  };
  if (document.readyState === "loading") {
    addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
};

const beats = [];
let t0 = 0;
const now = () => Date.now() - t0;

function beat(n, label) {
  const tMs = now();
  beats.push({ beat: n, label, tMs });
  console.log(`  ${(tMs / 1000).toFixed(1).padStart(6)}s  [${n}] ${label}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Move the pointer in small steps so the recorded cursor glides. */
async function glide(page, x, y, steps = 26) {
  await page.mouse.move(x, y, { steps });
  await wait(120);
}

async function glideToLocator(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box for target");
  await glide(page, box.x + box.width / 2, box.y + box.height / 2);
  return box;
}

/** Human-paced click: glide onto the control, pause, then press. */
async function softClick(page, locator) {
  await glideToLocator(page, locator);
  await wait(260);
  await locator.click();
  await wait(220);
}

/** Smooth wheel scroll — many small deltas instead of one jump. */
async function smoothScroll(page, total, ms = 1200) {
  const ticks = Math.max(8, Math.round(ms / 40));
  const per = total / ticks;
  for (let i = 0; i < ticks; i++) {
    await page.mouse.wheel(0, per);
    await wait(ms / ticks);
  }
}

/** Scroll a section to the vertical middle, gently, then hold on it. */
async function revealSection(page, locator, holdMs) {
  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    const delta = box.y + box.height / 2 - H / 2;
    if (Math.abs(delta) > 12) await smoothScroll(page, delta, 1100);
  }
  await wait(holdMs);
}

async function runAnalysis(page, file) {
  const btn = page.getByRole("button", { name: /Analyze my selfie/i });
  await glideToLocator(page, btn);
  await wait(400);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    btn.click(),
  ]);
  // Intercepted by Playwright, so no OS dialog is ever drawn on camera.
  await chooser.setFiles(file);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`base   : ${BASE}`);
  console.log(`face   : ${FACE}`);
  console.log(`out    : ${OUT}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: W, height: H } },
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await context.addInitScript(CURSOR);

  const page = await context.newPage();
  t0 = Date.now();

  // ---- Beats 1-2: the problem, and what it is -------------------------------
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Analyze my selfie/i }).waitFor();
  await glide(page, W / 2, H / 2, 4);
  beat(1, "landing page settled — problem + what-it-is captions run over this");
  await wait(9000);

  await glide(page, W / 2 - 180, H / 2 + 120);
  beat(2, "cursor drifts toward Analyze my selfie");
  await wait(2500);

  // ---- Beat 3: the live run -------------------------------------------------
  beat(3, "click Analyze my selfie (baseline run) — 20 units");
  await runAnalysis(page, FACE);

  await page.getByText(/analyzing/i).first().waitFor({ timeout: 30_000 });
  beat(3.1, "loader visible — speed-ramp this stretch in the edit");

  const again = page.getByRole("button", { name: /Analyze again/i });
  await again.waitFor({ timeout: 180_000 });
  beat(3.2, "REVEAL LANDS — hero shot, no caption over the dial");
  await wait(5000);

  // ---- Beat 4: reading the result -------------------------------------------
  beat(4, "scroll through the reveal");
  await revealSection(page, page.getByText(/skin health/i).first(), 3200);
  beat(4.1, "dial + skin-health number");

  await smoothScroll(page, 520, 1400);
  await wait(3400);
  beat(4.2, "top three concerns");

  await smoothScroll(page, 560, 1400);
  await wait(3400);
  beat(4.3, "AM / PM routine");

  await smoothScroll(page, 620, 1500);
  await wait(3600);
  beat(4.4, "product cards — 14 on the shelf at baseline");

  await revealSection(page, page.getByText(/Analysis by Perfect Corp/i).first(), 3600);
  beat(4.5, "footer reads 'Analysis by Perfect Corp.' — proof it was live");

  // ---- Beat 5: the safety gate ----------------------------------------------
  await softClick(page, again);
  await page.getByRole("button", { name: /Analyze my selfie/i }).waitFor();
  beat(5, "back on landing");

  await softClick(page, page.getByRole("button", { name: /Personalize \(optional\)/i }));
  await wait(700);
  beat(5.1, "personalization panel open");

  const pregnant = page.locator("label")
    .filter({ hasText: /Pregnant \/ breastfeeding/i })
    .locator("input[type=checkbox]");
  await softClick(page, pregnant);
  beat(5.2, "PREGNANT TICKED — hold here, card 5a runs over this");
  await wait(2600);

  beat(5.3, "second run, pregnancy gate active — 20 units");
  await runAnalysis(page, FACE);
  await page.getByText(/analyzing/i).first().waitFor({ timeout: 30_000 });
  await again.waitFor({ timeout: 180_000 });
  beat(5.4, "gated reveal landed");
  await wait(2500);

  await revealSection(page, page.getByText(/Azelaic/i).first(), 4200);
  beat(5.5, "AZELAIC ACID card — salicylic acid is gone, shelf is 13 not 14");

  await revealSection(page, page.getByText(/pregnant or breastfeeding/i).first(), 5000);
  beat(5.6, "cautions line states the rule in the app's own words");

  // ---- Beat 6: when it goes wrong -------------------------------------------
  await softClick(page, again);
  await page.getByRole("button", { name: /Analyze my selfie/i }).waitFor();
  beat(6, "upload the non-face photo — costs nothing");
  await runAnalysis(page, NOFACE);

  await page.getByText(/read your face/i).first().waitFor({ timeout: 60_000 });
  beat(6.1, "REJECTED — local detector, ~1s, zero units spent");
  await wait(5000);

  // ---- Beat 7: the business case --------------------------------------------
  await smoothScroll(page, -1400, 1500);
  await wait(1000);
  beat(7, "calm static landing page — business-case captions run over this");
  await wait(7000);

  beat(8, "end");

  const video = page.video();
  await context.close();

  // Name the file after the run and drop the manifest beside it.
  const src = video ? await video.path() : null;
  const finalName = `session-${process.pid}.webm`;
  if (src) await rename(src, join(OUT, finalName)).catch(() => {});
  await writeFile(
    join(OUT, "beats.json"),
    JSON.stringify({ base: BASE, face: FACE, width: W, height: H, video: finalName, beats }, null, 2)
  );

  await browser.close();

  console.log(`\ntotal runtime: ${(now() / 1000).toFixed(1)}s`);
  console.log(`video   : ${join(OUT, finalName)}`);
  console.log(`manifest: ${join(OUT, "beats.json")}`);
  console.log(`\nfiles in ${OUT}:`);
  for (const f of await readdir(OUT)) console.log(`  ${f}`);
}

main().catch((err) => {
  console.error("\nRECORDING FAILED:", err?.message || err);
  process.exit(1);
});
