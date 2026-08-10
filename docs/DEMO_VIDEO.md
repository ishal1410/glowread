# GlowRead: demo video script

**Hard requirement (Perfect Corp challenge):** 1–3 minutes, showing the experience
end to end. This script targets **2:40**, which leaves room to breathe without
risking the 3:00 ceiling.

**Judged on three things only** — Progress ("how much did you make?"), Concept
("does it solve a real problem?"), Feasibility ("could this be a company?").
Every beat below is there to serve one of them. Nothing in this video is
decoration.

**Record on the laptop, desktop viewport, light theme.** The layout was tuned for
that view and it is the one judges see. Do a dark-theme beat only if the take
runs short.

---

## Before you hit record

- [ ] Check the unit balance first — **every real analysis costs 20 units**:
      `curl -H "Authorization: Bearer $PERFECTCORP_API_KEY" https://yce-api-01.makeupar.com/s2s/v1.0/client/credit`
      Budget ~6 takes = ~120 units. You had 760.
- [ ] Warm the site once (`https://glowread.vercel.app`) so the first real take
      isn't a cold serverless start.
- [ ] Have two files on the desktop: the **passport selfie** that is known to
      pass, and a **non-face photo** (the NYC building shot) for the rejection beat.
- [ ] Close every other tab. Hide bookmarks. Full-screen the browser.
- [ ] **Capture a full successful run as backup footage before you narrate.** If
      the live API is down on recording day you still have a video.
- [ ] Narration quota: Gemini free tier is **20 requests/day**. Don't burn it on
      rehearsals — the reveal still works without it, but the warmer headline is
      a nicer beat if it fires.

---

## Shot list

### 1 — The problem (0:00–0:18)

**On screen:** the GlowRead landing page, idle. Hold still on the headline
"Read your skin like an instrument."

**Say:**
> Skincare advice online comes in two flavours. A stranger guessing from your
> photo in a Reddit thread, or a brand's quiz that recommends that brand no
> matter what you answer. Neither one is measuring anything.

*Serves: Concept. State the problem before the product.*

---

### 2 — What it is (0:18–0:32)

**On screen:** still on the landing page. Cursor drifts toward "Analyze my selfie"
but does not click yet.

**Say:**
> GlowRead measures it. One selfie goes to Perfect Corp's Skin Analysis API,
> which scores eleven concerns on your actual face. Then it builds the part
> people actually need — a routine, and real products that fit it.

*Serves: Concept + the sponsor requirement. Name Perfect Corp out loud and early.*

---

### 3 — The live run (0:32–1:05)

**On screen:** click "Analyze my selfie" → pick the passport photo → the loader
appears with your face in the ring and the sweep animation → steps advance
("Detecting face…", "Scoring your skin concerns…") → reveal lands.

**Say, over the loader:**
> This is live, not a mock. The face gets detected before anything is uploaded,
> cropped, and sent up. About ten seconds.

**Then, the moment the dial fills — stop talking. Let it land for two full
seconds.** This is the hero shot of the whole video.

*Serves: Progress. The single most persuasive thing you have is that it is real
and it works.*

---

### 4 — Reading the result (1:05–1:35)

**On screen:** slow scroll through the reveal. Pause on each: the radial skin map,
the skin-health number, the three top concerns with explanations, the AM/PM
routine, the product cards.

**Say:**
> Overall skin health, then a map of where the problems are. My top concern is
> dark circles, which matches my face. Three concerns explained in plain
> language, an AM and PM routine in order, and real products matched to the
> ingredients that routine calls for — filtered to a budget if you set one.

*Serves: Progress + Concept. This is the "measurement is useless without the
routine" thesis, made visible.*

---

### 5 — The safety gate (1:35–2:00)

**On screen:** click "Analyze again" → open "Personalize (optional)" → tick
**Pregnant / breastfeeding** → run the same photo again → on the reveal, scroll
to the PM routine and point at where the retinoid used to be.

**Say:**
> If you tell it you're pregnant, retinoids, salicylic acid, and benzoyl peroxide
> come out of the routine. Not flagged with a warning — removed. That rule runs
> in code, after the plan is built, where the language model can't reach it. A
> disclaimer under an LLM's output isn't a safety feature.

*Serves: Concept + Feasibility. This is the beat that separates you from every
other "AI recommends skincare" demo in the room.*

---

### 6 — When it goes wrong (2:00–2:18)

**On screen:** "Analyze again" → upload the **non-face photo** → the 400 lands in
about a second with "We couldn't read your face clearly…".

**Say:**
> Face detection runs locally before anything is uploaded, so a photo with no
> face in it is rejected in about a second and costs nothing. The metered API
> call only happens once a local model confirms there's a face there.

*Serves: Feasibility. Cost per call is the whole unit economics story, told in
one shot.*

---

### 7 — The business case (2:18–2:40)

**On screen:** back to the reveal (or the landing page). Calm, static.

**Say:**
> The model is B2B white-label, which is Perfect Corp's own model. A retailer
> gets a recommendation engine that maps measured concerns to their catalogue,
> and the expensive call happens once per scan, not once per page view. The next
> thing I'd build is a re-scan in three weeks — one reading is a novelty, the
> second one is a reason to keep the routine.

**End card:** `glowread.vercel.app`

*Serves: Feasibility, explicitly. The judges are asking "could this be a
company?" — answer it in words, don't make them infer it.*

---

## Things to NOT do

- **Don't tour the codebase.** There is no code-quality criterion. Tests,
  architecture, and the polarity bug are Devpost write-up material, not video
  material.
- **Don't apologise for anything.** No "this part is still rough."
- **Don't demo the "Try a demo" button.** It renders a footer reading *"Demo mode
  with sample data"* — on camera that reads as "nothing here is real," which is
  the opposite of the point. Every take uses a real analysis.
- **Don't show the theme toggle** unless you're short. It's polish, not evidence.
- **Don't let the loader run silently.** Fill the ~10s with the narration in
  beat 3 or it feels like a hang.

## If the live API fails on recording day

Cut to the backup footage from the pre-flight checklist and narrate over it. Do
not switch to demo mode on camera — the sample-data footer is visible in the
reveal and undoes beat 3.
