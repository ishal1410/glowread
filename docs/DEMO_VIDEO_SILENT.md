# GlowRead: silent demo video script (no voiceover, no presenter on camera)

**Supersedes `DEMO_VIDEO.md` for this shoot.** That script puts the entire
argument in spoken narration. With no voice, it says nothing. This one moves
every argument on screen.

**Hard requirement (Perfect Corp challenge):** 1–3 minutes, end to end.
This targets **2:28** — comfortably inside the ceiling.

**Judged on three things only:** Progress, Concept, Feasibility. Every beat
serves one. Nothing here is decoration.

---

## The one rule silent demos live or die by

**Reading is slower than listening.** Subtitle convention is ~17 characters per
second for adults; this script budgets **15 cps** so nothing feels rushed.

Consequence: the narrated script's lines are 45–60 words each. As on-screen
text that is 15–20 seconds of reading per beat — the video would be four
minutes of staring at paragraphs. **Every caption below is cut to roughly 40%
of the spoken word count**, and each one lists its character count and the
minimum time it must stay up.

Second consequence: the narrated script says *"don't let the loader run
silently — fill the ~10s with narration."* There is no narration now, so the
loader is **speed-ramped instead**. Dead air is the enemy; a caption over a
frozen screen is worse than a cut.

---

## Design rules

1. **Text carries the argument, the screen carries the proof.** Never put a
   caption over a moment the viewer needs to look at. The dial fill is the hero
   shot — it plays clean, no text.
2. **One idea per card.** Never two sentences competing.
3. **Title cards between beats, captions over action.** Full-bleed cards mark
   the section; lower-third captions annotate live UI.
4. **Brand voice holds.** Clinical, specific, declarative. No exclamation
   marks, no "Let's", no "glow up" / "shine" / "journey" — the same bans the
   narration prompt already enforces in code.
5. **Cut every idle frame.** Silent video has no reason to wait.

---

## Runtime map

| # | Beat | In | Out | Len |
|---|------|----|-----|-----|
| 0 | Title card | 0:00 | 0:04 | 4s |
| 1 | The problem | 0:04 | 0:15 | 11s |
| 2 | What it is | 0:15 | 0:27 | 12s |
| 3 | Live run | 0:27 | 0:50 | 23s |
| 4 | Reading the result | 0:50 | 1:24 | 34s |
| 5 | The safety gate | 1:24 | 1:50 | 26s |
| 6 | When it goes wrong | 1:50 | 2:05 | 15s |
| 7 | The business case | 2:05 | 2:22 | 17s |
| 8 | End card | 2:22 | 2:28 | 6s |

**Total 2:28.**

---

## Shot list

### 0 — Title card · 0:00–0:04

**Screen:** full-bleed near-black. Centered.

> **GlowRead**
> Read your skin like an instrument.

`53 chars · needs 3.5s · has 4s`

Sets the tone in one frame: an instrument, not a quiz.

---

### 1 — The problem · 0:04–0:15

**Screen:** GlowRead landing page, idle, held still. Light theme, desktop.

**Card 1a** (0:04–0:11, 7s)
> Skincare advice online is a stranger guessing from your photo —
> or a brand quiz that recommends that brand.

`107 chars · needs 7.1s · has 7s`

**Card 1b** (0:11–0:15, 4s)
> Neither is measuring anything.

`30 chars · needs 2.0s · has 4s`

*Serves: Concept. Problem before product.*

---

### 2 — What it is · 0:15–0:27

**Screen:** still the landing page. Slow synthetic cursor drift toward
"📸 Analyze my selfie". Does not click yet.

**Card 2a** (0:15–0:22, 7s)
> GlowRead measures it. One selfie → Perfect Corp Skin Analysis API →
> 11 concerns scored on a real face.

`101 chars · needs 6.7s · has 7s`

**Card 2b** (0:22–0:27, 5s)
> Then the part people actually need: a routine, and products that fit it.

`72 chars · needs 4.8s · has 5s`

*Serves: Concept + the sponsor requirement. Perfect Corp is named early and in
text, so a judge skimming on mute still catches it.*

---

### 3 — The live run · 0:27–0:50 ← **hero beat**

**Screen:** click "📸 Analyze my selfie" → file picker resolves → loader mounts
with the photo in the ring, violet sweep animating, `LOADER_STEPS` advancing
and the progress pips filling.

**Card 3a** (0:28–0:33, 5s) — over the loader
> Live API. Not a mock.

`21 chars · needs 1.4s · has 5s` — deliberately long hold. This is the most
persuasive claim in the video; let it sit.

**Card 3b** (0:34–0:40, 6s)
> The face is detected locally first, then cropped and uploaded.

`61 chars · needs 4.1s · has 6s`

**Speed ramp:** the real analysis takes ~10s. Keep it honest but tight — play
the first 3s at 1×, the middle at 3×, the last 2s back at 1× so the reveal
lands at natural speed. No timer needed; the pips already show progress.

**0:41–0:50 — THE DIAL. No text. No cursor. Nothing.**
Hold on the radial map filling and the skin-health number counting up. Let the
animation finish, then sit on the settled frame for **two extra seconds**.

*Serves: Progress. The most convincing thing you have is that it is real and it
works. Do not talk over it — here that means do not caption over it.*

---

### 4 — Reading the result · 0:50–1:24

**Screen:** slow, even scroll through the reveal, pausing at each section long
enough to read it. No fast scrolling — motion sickness reads as sloppiness.

**Card 4a** (0:51–0:56) over the dial + score
> Overall skin health, then a map of where the problems are.

`58 chars · needs 3.9s · has 5s`

**Card 4b** (0:58–1:04) over the top-3 concerns
> Three concerns ranked worst-first, each explained in plain language.

`67 chars · needs 4.5s · has 6s`

**Card 4c** (1:06–1:12) over the AM/PM routine
> An AM and PM routine, in the order you actually apply it.

`56 chars · needs 3.7s · has 6s`

**Card 4d** (1:14–1:20) over the product cards
> Real products matched to the ingredients the routine calls for.

`62 chars · needs 4.1s · has 6s`

**1:20–1:24 — hold on the footer.** It reads **"Analysis by Perfect Corp."**
That line is on-screen proof the run was live rather than sample data. Frame it.

*Serves: Progress + Concept. The "a measurement is useless without the routine"
thesis, made visible.*

---

### 5 — The safety gate · 1:24–1:50 ← **the differentiator**

**Screen:** "Analyze again" → "Personalize (optional)" expands → tick
**Pregnant / breastfeeding** → run the same photo → on the reveal, scroll to
the **product cards and the cautions line**.

> **Point the camera at the right thing.** Verified live on the demo portrait
> (two real runs, baseline vs pregnant): **the PM routine does not change.** For
> this face both versions are already pregnancy-safe — glycerin, niacinamide,
> hyaluronic acid, ceramides. Filming the routine would show the viewer nothing.
>
> What *does* change, measured:
>
> | | baseline | pregnant |
> |---|---|---|
> | criterion | salicylic acid | **azelaic acid** |
> | shelf | 14 products | **13** |
> | removed | — | Effaclar Salicylic Acid Serum · Skin Perfecting 2% BHA Liquid |
> | added | — | Azelaic Acid Suspension 10% |
> | cautions | *(empty)* | the full rule, printed on screen |

**Card 5a** (1:25–1:31, 6s) — over the checkbox tick
> Tell it you are pregnant.

`25 chars · needs 1.7s · has 6s` — held long on purpose. The tick is the
action; the card is the setup.

**Card 5b** (1:34–1:41, 7s) — over the product shelf as the two salicylic acid
cards vanish and the azelaic acid card takes their place
> Salicylic acid leaves the shelf. Azelaic acid replaces it.

`57 chars · needs 3.8s · has 7s`

**Card 5c** (1:43–1:50, 7s) — over the cautions line, which now reads in the
app's own words: *"Since you're pregnant or breastfeeding, we left out
retinoids, salicylic acid, and benzoyl peroxide…"*
> Not flagged with a warning — removed. That rule runs in code, where the
> language model cannot reach it.

`104 chars · needs 6.9s · has 7s`

**Strongest single frame in the video, and it is nearly free:** a 2-second
side-by-side freeze of the product shelf before vs after, with the two
salicylic acid cards struck through. The scores are **deterministic on the same
photo** (verified: identical across both runs), so the two shelves differ in
exactly one respect and the diff is unambiguous on camera.

*Serves: Concept + Feasibility. Separates this from every other "AI recommends
skincare" project in the room. A disclaimer under an LLM's output is not a
safety feature; a code-level gate is.*

---

### 6 — When it goes wrong · 1:50–2:05

**Screen:** "Analyze again" → upload the **non-face photo** → the 400 lands in
about a second: *"We couldn't read your face clearly…"*.

**Card 6a** (1:51–1:57, 6s)
> No face in the photo? Rejected in about a second.

`49 chars · needs 3.3s · has 6s`

**Card 6b** (1:58–2:05, 7s)
> Zero API units spent. The metered call only fires once a local model confirms
> there is a face.

`95 chars · needs 6.3s · has 7s`

*Serves: Feasibility. Cost per call is the entire unit-economics story told in
one shot — and it is the beat most demos skip.*

---

### 7 — The business case · 2:05–2:22

**Screen:** calm and static. Back on the settled reveal, or the landing page.
Nothing moves; let the text be the content.

**Card 7a** (2:06–2:12, 6s)
> B2B white-label — Perfect Corp's own model.

`43 chars · needs 2.9s · has 6s`

**Card 7b** (2:13–2:22, 9s)
> One metered call per scan, not per page view. Next: a re-scan at three weeks —
> one reading is a novelty, the second is a reason to stay.

`137 chars · needs 9.1s · has 9s` — if it feels dense in the cut, split it
after "page view."

*Serves: Feasibility, explicitly. The judges literally ask "could this become a
company?" — answer it in words rather than making them infer it.*

---

### 8 — End card · 2:22–2:28

> **glowread.vercel.app**
> Skin analysis by Perfect Corp.

Hold 6s — long enough for a judge to type it.

---

## Caption + title card style

Match the app so the video and the product read as one thing.

| Element | Spec |
|---|---|
| Ground (title cards) | `#0C0D12` — the app's dark body background |
| Primary text | `#F4F4F6` |
| Accent word | violet `--violet-2` |
| Display face | Instrument Serif (title + end cards) |
| Caption face | Geist / Segoe UI, 34–40px at 1080p |
| Caption plate | bottom third, `rgba(12,13,18,0.82)`, 12px radius, 28px padding |
| Safe margins | 6% on all sides |
| Transitions | 250ms fade in/out. Nothing else — no slides, no wipes |

**Font gotcha:** libass burns captions using **system-installed** fonts. Geist
and Instrument Serif are loaded by `next/font` as bundled woff2 — they exist in
the app, not in Windows. Two options:

- **Easy:** caption in Segoe UI (installed, neutral, fine).
- **Brand-exact (recommended):** render the title and end cards as a local HTML
  page using the app's own CSS, screenshot them with Playwright, and cut those
  PNGs in as still frames. Costs nothing, and the type then matches the product
  exactly.

---

## Audio

There is no voiceover. Two acceptable answers:

- **Silence.** Legitimate; many judges watch on mute anyway. Zero risk.
- **A quiet music bed** at about −22 LUFS so it never competes with reading.
  Free, no attribution required: YouTube Audio Library, Pixabay Music.
  **Never** a commercial track — a copyright claim on a submission video is an
  avoidable own goal.

Recommendation: a sparse ambient bed. Total silence across 2.5 minutes reads as
"unfinished" to some viewers.

---

## Assets required before shooting

- [x] **Face photo — chosen and validated live.**
      `C:\Users\vp141\demo-assets\man-30513783.jpg` (Pexels 30513783, "Young
      Man's Portrait with Neutral Expression", 3972×5546, 2.5MB). Pexels licence
      permits commercial use with no attribution. The user's own
      `digital-passport.jpg` is ruled out for this shoot.

      **Verified against the deployed app, twice:** clears the Perfect Corp
      face-size gate, `source=perfectcorp`, health **79**, skin age **21**,
      ~14–17s end to end. Bare face, flat studio light, unretouched — so it
      returns a *varied* profile rather than the flat high 90s a retouched
      beauty shot gives. Worst-first: **pores 56 · hydration 44 · dark circles
      41**, which is exactly three distinct, explainable concerns.

      Deterministic: both runs returned identical scores, so a re-shoot matches
      the footage you already have.
- [ ] **A non-face photo** for beat 6. One already exists at
      `AppData\Local\Temp\claude\C--Users-vp141\6222e076-…\scratchpad\noface.jpg`
      — copy it somewhere permanent before the temp directory is cleaned.
- [ ] Warm `https://glowread.vercel.app` once so take 1 is not a cold start.
- [ ] Check the balance — **every real analysis costs 20 units**:
      `curl -H "Authorization: Bearer $PERFECTCORP_API_KEY" https://yce-api-01.makeupar.com/s2s/v1.0/client/credit`

---

## Unit budget

A complete take needs **two** real analyses — beat 3 (baseline) and beat 5
(pregnancy re-run). That is **40 units per take**.

Balance measured **2026-08-11: 680 units ≈ 34 analyses ≈ 17 full takes**
(720 before validating the portrait; the two verification runs cost 40).
Comfortable, but not unlimited — never leave a loop rehearsing.

Read it any time, free:
`GET https://yce-api-01.makeupar.com/s2s/v1.0/client/credit` with the bearer key.

**Capture the successful run once and reuse the footage.** Beats 3 and 4 are
the same run; there is no reason to re-scan in order to re-scroll.

---

## Things to NOT do

- **Don't demo "Try a demo".** Its reveal footer reads *"Demo mode with sample
  data"* — on camera that says "nothing here is real", which kills beat 3.
- **Don't tour the codebase.** There is no code-quality criterion.
- **Don't caption over the dial fill.** It is the one shot that argues for
  itself.
- **Don't show the theme toggle.** Polish, not evidence.
- **Don't apologise on screen.** No "still rough", no "work in progress".
- **Don't use the user's face.** Explicit constraint for this shoot.

---

## If the live API fails on shoot day

Cut to the backup footage captured in pre-flight and finish the edit from it.
Do **not** switch to demo mode on camera — the sample-data footer is visible in
the reveal and undoes beat 3.
