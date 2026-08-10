# GlowRead: Devpost submission draft

Written in first person singular for a solo entry. Swap to "we" if anyone joins.

---

## Elevator pitch (200 char limit)

Snap a selfie. Perfect Corp's Skin Analysis API measures 11 concerns on your actual face, and GlowRead turns that reading into an AM/PM routine built from real products you can buy.

---

## Inspiration

Skincare advice online is either a stranger guessing from a photo in a Reddit thread, or a quiz on a brand's website that recommends that brand's products no matter what you answer. Both have the same problem: nothing is actually measuring your skin.

Perfect Corp's Skin Analysis API measures it. That was the part I could not build myself and the part that makes the rest honest, so I built everything around it.

The other half of the idea came from watching people bounce off skincare entirely. They get a result, then a wall of ingredient names, and no idea what to buy on Tuesday. The measurement is useless without the routine on the other side.

## What it does

You upload a selfie. The app finds your face, crops to it, and sends it to Perfect Corp for analysis across 11 concerns: wrinkles, firmness, pores, texture, acne, age spots, redness, moisture, oiliness, dark circles, and radiance.

What comes back is a scorecard, your three biggest concerns explained in plain language, an AM and PM routine ordered step by step, and real products matched to the ingredients that routine calls for, filtered by your budget.

There is a safety gate between the plan and you. If you tell it you are pregnant, retinoids, BHA, and benzoyl peroxide are removed from the routine, not just flagged with a warning. Sunscreen is always enforced. Those rules run in code, after the plan is built, where a language model cannot reach them.

A real run takes about ten seconds end to end.

## How I built it

Next.js 16 and React 19 on Vercel, TypeScript throughout, Tailwind v4 for the interface.

The core architecture decision: reasoning is deterministic, only the wording is generated. Ranking concerns, choosing actives, ordering the routine, and matching products all happen in ordinary code. A language model rewrites the headline and the three concern explanations in a warmer voice and does nothing else. The output schema cannot break, no product can be hallucinated, and every recommendation can be traced back to a rule I can point at. I would rather demo something explainable than something impressive that occasionally invents a moisturizer.

The pipeline is split so nothing outlives a serverless time cap. `/api/analyze/start` does face detection, upload, and task creation, then hands back a task id. The browser polls `/api/analyze/status` every two seconds. Narration is a third endpoint that fires after the reveal is already on screen.

Face detection runs locally on face-api with a TensorFlow.js WASM backend before anything is uploaded. A photo with no face in it is rejected in about a second, on my machine, for free.

120 Vitest tests cover the parsing, the polarity math, the safety rules, the matcher, and the request guards. Everything security-relevant lives in pure functions so it can be tested instead of buried in a route handler.

## Challenges I ran into

The polarity was inverted and it was nearly invisible. Perfect Corp returns higher-is-better for every concern. My app's internal convention was higher-is-worse for most of them. A clear face came back scoring near 100 on redness and texture, which my code would have rendered as severe redness and severe texture problems. It would not have crashed. It would have confidently told someone with good skin that they had a serious problem. I only caught it because I checked a result against the actual photo instead of trusting that the numbers looked reasonable.

The face-size gate cost me an afternoon. Perfect Corp rejects images where the face is too small in frame, and a 600x600 passport photo failed even after I upscaled the whole image to 1080. The face bounding box is what matters, not the image. The fix was to detect the face, crop tight around it with room for the forehead, then upscale that. My first crop ratio still left the face around 819 pixels and still failed. It works now, and I found the real threshold by burning units against the live API rather than by reading documentation.

Sending a photo of a building, on purpose, taught me the most. The old flow shipped it straight upstream, where the backend retried for 73 seconds before giving up with a message about a list index. The user would have watched a spinner for over a minute and then hit a generic error, and I would have paid for it. That is why face detection moved local and runs first.

Narration latency was wildly unpredictable. I measured the same call at 2.7 seconds, 8.4 seconds, and 34.1 seconds back to back. Blocking the reveal on it made the whole experience take 35 seconds for wording the deterministic core already had. So it stopped blocking. The reveal renders immediately and the warmer copy swaps in if and when it arrives.

Deployment broke things that worked locally in ways that took real digging. The face detector loads its model weights by runtime path string, so Next's bundler could not see them and shipped a serverless function without them. Detection then failed open to a fallback crop, which is the worst possible failure: it would have sent faceless photos upstream and spent money on them. Separately, my LLM gateway sits behind a bot filter that answers datacenter IPs with an HTML page carrying a 200 status, so parsing it as JSON threw instead of falling through to the next provider. Neither failure was visible from my laptop. I found both by adding logging and reading production logs.

## Accomplishments that I'm proud of

The failure modes are boring, which took work. No face gets a clear message in about a second and costs nothing. An oversized upload is rejected on declared length before the body is buffered. Non-image bytes are caught by magic-byte sniffing rather than a trusted MIME header. When every narration provider is slow or out of quota, the app serves its deterministic copy and the user cannot tell anything went wrong.

I also like that the safety rules are unfalsifiable by the model. Plenty of demos put a disclaimer under an LLM's output. This one removes contraindicated actives in code, after generation, where prompt wording cannot affect them.

And it is genuinely deployed and genuinely live. The numbers in the screenshots are a real analysis of a real face.

## What I learned

Verify integrations against reality, not against the documentation. The auth handshake I was warned I would need turned out to be unnecessary. The API host in the docs was wrong. The result payload was shaped differently than I expected. One live call answered all three questions faster than a day of careful reading.

A silent degradation is worse than a crash. Twice, the dangerous outcome was code that kept returning 200 while doing the wrong thing: inverted scores that looked plausible, and a detector that failed open. A crash gets fixed. A plausible wrong answer ships.

Cost is a design constraint when your API is metered. Deciding to spend a paid unit only after a local model confirms there is a face in the photo shaped the architecture more than any performance concern did.

## What's next for GlowRead

Progress tracking is the obvious one. Re-scan in three weeks and see the delta on your top concern. A single reading is a novelty. A second one is a reason to keep the routine.

The business case is B2B white-label to skincare brands and retailers, which is Perfect Corp's own model. A retailer gets an analysis-driven recommendation engine that maps measured concerns to their catalog, and affiliate links are a secondary consumer revenue path. The unit economics work because the expensive call happens once per scan, not once per page view.

Nearer term: overlaying Perfect Corp's concern masks on the photo, live pricing, and a shareable report.

## Built with

Next.js 16, React 19, TypeScript, Tailwind CSS v4, Perfect Corp YouCam Skin Analysis API, face-api.js, TensorFlow.js WASM, sharp, Google Gemini, Vitest, Vercel.
