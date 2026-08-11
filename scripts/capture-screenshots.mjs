/**
 * Clean screenshot set for the Devpost image gallery.
 *
 *   node scripts/capture-screenshots.mjs
 *
 * Deliberately NOT frames from the demo video: those carry burned-in captions
 * and the synthetic cursor. This drives the deployed app fresh, with no cursor
 * injected, at 2x device scale so the type stays crisp when Devpost rescales.
 *
 * Costs 40 Perfect Corp units (baseline run + pregnancy run). The landing and
 * rejection shots are free.
 *
 * Env: DEMO_BASE, DEMO_FACE, DEMO_NOFACE
 */
import pw from "playwright";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const { chromium } = pw;
const BASE = process.env.DEMO_BASE || "https://glowread.vercel.app";
const FACE = process.env.DEMO_FACE || resolve("demo-assets/portrait.jpg");
const NOFACE = process.env.DEMO_NOFACE || resolve("demo-assets/noface.jpg");
const OUT = resolve(process.env.SHOTS_OUT || "demo-capture/screenshots");

const W = Number(process.env.SHOT_W) || 1600;
// The safety-gate shot needs a taller frame: at 1000px the Azelaic Acid card
// and the cautions box cannot both fit, and the card's title gets cropped.
// Run that one with SHOT_H=1400 --only=safety.
const H = Number(process.env.SHOT_H) || 1000;
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function analyse(page, file) {
  const btn = page.getByRole("button", { name: /Analyze my selfie/i });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), btn.click()]);
  await chooser.setFiles(file);
}

/** Centre a section in the viewport, let motion settle, then shoot. */
async function shot(page, name, locator) {
  if (locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await wait(900);
  }
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${name}.png`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
const page = await context.newPage();
await mkdir(OUT, { recursive: true });
console.log(`base: ${BASE}\nout : ${OUT}\n`);

console.log(`viewport: ${W}x${H} @2x${ONLY ? `  (only: ${ONLY})` : ""}\n`);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Analyze my selfie/i }).waitFor();
const again = page.getByRole("button", { name: /Analyze again/i });

if (!ONLY) {
  // 01 — the landing page (free)
  await wait(1200);
  await shot(page, "01-landing");

  // 02-04 — the real reveal (20 units)
  console.log("baseline run (20 units)...");
  await analyse(page, FACE);
  await again.waitFor({ timeout: 180_000 });
  await wait(3500); // let the dial count-up and bloom finish
  await shot(page, "02-reveal");
  await shot(page, "03-breakdown", page.getByText(/Full skin breakdown/i).first());
  await shot(page, "04-products", page.getByText(/Matched to your skin/i).first());

  await again.click();
  await page.getByRole("button", { name: /Analyze my selfie/i }).waitFor();
}

// 05 — the pregnancy safety gate (20 units)
console.log("pregnancy run (20 units)...");
await page.getByRole("button", { name: /Personalize \(optional\)/i }).click();
await page.locator("label").filter({ hasText: /Pregnant \/ breastfeeding/i })
  .locator("input[type=checkbox]").check();
await wait(400);
await analyse(page, FACE);
await again.waitFor({ timeout: 180_000 });
await wait(2500);
await shot(page, "05-safety-gate", page.getByText(/pregnant or breastfeeding/i).first());

if (ONLY === "safety") {
  await context.close();
  await browser.close();
  console.log(`\ndone -> ${OUT}`);
  process.exit(0);
}

// 06 — the rejection path (free: local detector stops it before any paid call)
console.log("rejection (0 units)...");
await again.click();
await page.getByRole("button", { name: /Analyze my selfie/i }).waitFor();
await analyse(page, NOFACE);
await page.getByText(/read your face/i).first().waitFor({ timeout: 60_000 });
await wait(800);
await shot(page, "06-rejection");

await context.close();
await browser.close();
console.log(`\ndone -> ${OUT}`);
