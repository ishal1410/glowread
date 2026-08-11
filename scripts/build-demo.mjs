/**
 * Cuts the raw capture into the finished silent demo.
 *
 *   node scripts/build-demo.mjs
 *
 * Input : demo-capture/session-*.webm + beats.json  (from record-demo.mjs)
 * Output: demo-capture/glowread-demo.mp4
 *
 * Why a script and not a hand-scrubbed timeline: the recorder drops frames
 * under load, so the webm runs SHORTER than wall-clock (measured 117.52s vs
 * 124.4s). Beat timestamps are wall-clock, so every cut point is rescaled by
 * videoDuration / lastBeatWallTime before use. Scrubbing by hand would mean
 * redoing that after every re-record.
 *
 * Static shots are stretched by cloning the last frame (tpad) rather than by
 * slowing playback, so held frames stay crisp and only the captions carry time.
 */
import { readFile, writeFile, readdir, rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const DIR = resolve(process.env.DEMO_OUT || "demo-capture");
const WORK = join(DIR, "segments");
const OUT = join(DIR, "glowread-demo.mp4");
const FPS = 25;

const ff = (args, cwd = DIR) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
};

const probe = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return parseFloat(r.stdout.trim());
};

const ts = (s) => {
  const cs = Math.round(s * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

const manifest = JSON.parse(await readFile(join(DIR, "beats.json"), "utf8"));
const video = manifest.video || (await readdir(DIR)).find((f) => f.endsWith(".webm"));
const src = join(DIR, video);
const vidDur = probe(src);
const lastWall = manifest.beats[manifest.beats.length - 1].tMs / 1000;
const K = vidDur / lastWall;
console.log(`source   : ${video}`);
console.log(`duration : ${vidDur.toFixed(2)}s video vs ${lastWall.toFixed(2)}s wall`);
console.log(`drift    : x${K.toFixed(4)} applied to every cut point\n`);

const at = (n) => {
  const b = manifest.beats.find((x) => x.beat === n);
  if (!b) throw new Error(`beat ${n} missing from manifest`);
  return (b.tMs / 1000) * K;
};

// ---- The edit -------------------------------------------------------------
// from/to are BEAT NUMBERS (rescaled automatically). speed>1 shortens.
// padTo holds the last frame until the segment reaches that many seconds.
const CARD_BG = "0x0C0D12";
const SERIF = "C\\:/Windows/Fonts/georgia.ttf";
const SANS = "C\\:/Windows/Fonts/segoeui.ttf";

const timeline = [
  { kind: "card", dur: 4.0, lines: [
      { text: "GlowRead", size: 96, font: SERIF, dy: -60, color: "0xF4F4F6" },
      { text: "Read your skin like an instrument.", size: 40, font: SERIF, dy: 40, color: "0x9B8CF7" },
  ] },
  { kind: "clip", from: 1, to: 3, padTo: 15.0, captions: [
      { t: 0.4, d: 6.6, text: "Skincare advice online is a stranger guessing from\\Nyour photo, or a brand quiz that recommends that brand." },
      { t: 7.4, d: 3.6, text: "Neither is measuring anything." },
      { t: 11.4, d: 3.4, text: "GlowRead measures it." },
  ] },
  { kind: "clip", from: 3, to: 3.2, speed: 2.0, captions: [
      { t: 0.3, d: 3.0, text: "One selfie to the Perfect Corp Skin Analysis API.\\N11 concerns scored on a real face." },
      { t: 3.6, d: 3.0, text: "Live API. Not a mock." },
  ] },
  // Hero: the dial fills and settles. No captions, by design.
  { kind: "clip", from: 3.2, to: 4, padTo: 9.0 },
  { kind: "clip", from: 4, to: 4.5, captions: [
      { t: 0.6, d: 5.0, text: "Overall skin health, then a map of where the problems are." },
      { t: 6.6, d: 5.4, text: "Three concerns ranked worst-first, each explained in plain language." },
      { t: 13.0, d: 5.4, text: "An AM and PM routine, in the order you actually apply it." },
      { t: 19.6, d: 6.0, text: "Real products matched to the ingredients the routine calls for." },
  ] },
  // trimEnd: beat 5 fires after the "Analyze again" click, so back off the tail
  // and let the pad hold the footer rather than the landing page.
  { kind: "clip", from: 4.5, to: 5, trimEnd: 1.1, padTo: 5.0, captions: [
      { t: 0.4, d: 4.2, text: "Analysis by Perfect Corp — this run was live, not sample data." },
  ] },
  { kind: "clip", from: 5, to: 5.3, padTo: 9.0, captions: [
      { t: 1.6, d: 6.0, text: "Now tell it you are pregnant." },
  ] },
  { kind: "clip", from: 5.3, to: 5.4, speed: 2.4 },
  // Caption offsets here are pinned to the scroll: beat 5.5 (the azelaic card
  // enters frame) lands ~9.1s in, beat 5.6 (the cautions box) ~16.1s in. The
  // pad holds that final cautions frame so the last two cards have something
  // true to sit over.
  // Ends on 5.6, NOT 6: beat 6 is already past the "Analyze again" click, so
  // running to it would leave the landing page as the final frame — and the
  // freeze-pad clones the final frame, stranding the last two cards over the
  // wrong shot. Ending on 5.6 holds the cautions box instead.
  { kind: "clip", from: 5.4, to: 5.6, padTo: 24.5, captions: [
      { t: 1.4, d: 5.4, text: "Same photo, same scores. Only the recommendations change." },
      { t: 9.4, d: 5.0, text: "Salicylic acid leaves the shelf. Azelaic acid replaces it." },
      { t: 16.4, d: 3.4, text: "Not flagged with a warning — removed." },
      { t: 20.2, d: 4.0, text: "That rule runs in code, where the model cannot reach it." },
  ] },
  // trimEnd: beat 7 fires after the scroll back up, so hold the rejection
  // screen instead of drifting onto the landing page mid-caption.
  { kind: "clip", from: 6, to: 7, trimEnd: 2.6, padTo: 12.0, captions: [
      { t: 1.6, d: 4.4, text: "No face in the photo? Rejected in about a second." },
      { t: 6.4, d: 5.0, text: "Zero API units spent. The metered call only fires\\Nonce a local model confirms there is a face." },
  ] },
  { kind: "clip", from: 7, to: 8, padTo: 16.0, captions: [
      { t: 1.0, d: 5.0, text: "B2B white-label — Perfect Corp's own model." },
      { t: 6.6, d: 8.4, text: "One metered call per scan, not per page view.\\NNext: a re-scan at three weeks." },
  ] },
  { kind: "card", dur: 6.0, lines: [
      { text: "glowread.vercel.app", size: 76, font: SERIF, dy: -40, color: "0xF4F4F6" },
      { text: "Skin analysis by Perfect Corp.", size: 34, font: SANS, dy: 60, color: "0x9AA0AE" },
  ] },
];

await rm(WORK, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });

const parts = [];
const captions = [];
let clock = 0;

for (let i = 0; i < timeline.length; i++) {
  const seg = timeline[i];
  const name = `seg${String(i).padStart(2, "0")}.mp4`;
  const out = join(WORK, name);
  let planned;

  if (seg.kind === "card") {
    const draws = seg.lines.map((l) =>
      `drawtext=fontfile='${l.font}':text='${l.text}':fontsize=${l.size}:fontcolor=${l.color}` +
      `:x=(w-text_w)/2:y=(h-text_h)/2+${l.dy}`
    ).join(",");
    ff(["-f", "lavfi", "-i", `color=c=${CARD_BG}:s=1920x1080:r=${FPS}:d=${seg.dur}`,
        "-vf", `${draws},format=yuv420p`,
        "-c:v", "libx264", "-crf", "18", "-preset", "medium", out]);
    planned = seg.dur;
  } else {
    const a = at(seg.from);
    // trimEnd backs off the tail when the closing beat is fired AFTER the click
    // that leaves the shot. Without it the freeze-pad clones the next screen.
    const b = at(seg.to) - (seg.trimEnd || 0);
    const raw = b - a;
    const speed = seg.speed || 1;
    const filters = [`fps=${FPS}`];
    if (speed !== 1) filters.push(`setpts=PTS/${speed}`);
    let d = raw / speed;
    if (seg.padTo && seg.padTo > d) {
      filters.push(`tpad=stop_mode=clone:stop_duration=${(seg.padTo - d).toFixed(3)}`);
      d = seg.padTo;
    }
    filters.push("format=yuv420p");
    ff(["-ss", a.toFixed(3), "-to", b.toFixed(3), "-i", src,
        "-vf", filters.join(","), "-an",
        "-c:v", "libx264", "-crf", "18", "-preset", "medium", out]);
    planned = d;
  }

  const actual = probe(out);
  console.log(`  ${name}  planned ${planned.toFixed(2)}s  actual ${actual.toFixed(2)}s  ${seg.kind}`);
  for (const c of seg.captions || []) {
    captions.push({ start: clock + c.t, end: clock + c.t + c.d, text: c.text });
  }
  parts.push(name);
  clock += actual;
}

console.log(`\ntimeline: ${clock.toFixed(1)}s (${Math.floor(clock / 60)}:${String(Math.round(clock % 60)).padStart(2, "0")})`);

// ---- Captions -------------------------------------------------------------
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Segoe UI,44,&H00F6F4F4,&H2E120D0C,&H2E120D0C,0,0,3,15,0,2,150,150,86,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${captions.map((c) => `Dialogue: 0,${ts(c.start)},${ts(c.end)},Cap,,0,0,0,,{\\fad(250,250)}${c.text}`).join("\n")}
`;
await writeFile(join(DIR, "captions.ass"), ass);
console.log(`captions: ${captions.length} cards -> captions.ass`);

// ---- Concat, then burn ----------------------------------------------------
await writeFile(join(WORK, "concat.txt"), parts.map((p) => `file '${p}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "joined.mp4"], WORK);
ff(["-i", join(WORK, "joined.mp4"), "-vf", "ass=captions.ass",
    "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", OUT]);

const finalDur = probe(OUT);
console.log(`\nDONE: ${OUT}`);
console.log(`runtime: ${Math.floor(finalDur / 60)}:${String(Math.round(finalDur % 60)).padStart(2, "0")} (${finalDur.toFixed(1)}s)`);
if (finalDur > 180) console.log("WARNING: over the 3:00 hackathon ceiling");
if (finalDur < 60) console.log("WARNING: under the 1:00 hackathon floor");
