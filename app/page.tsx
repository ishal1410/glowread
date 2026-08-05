"use client";

import { useEffect, useRef, useState } from "react";
import Reveal from "@/components/Reveal";
import type { AnalyzeResult, UserProfile } from "@/lib/types";

type Phase = "idle" | "analyzing" | "done" | "error";

// Ordered to match what the server actually does. The list ADVANCES and then
// holds on the last step — it used to loop every 4.5s, so "Detecting face…"
// reappeared after "Matching real products…" and a slow analysis looked stuck.
const LOADER_STEPS = [
  "Detecting face…",
  "Scoring your skin concerns…",
  "Reading hydration & texture…",
  "Building your routine…",
  "Matching real products…",
  "Almost there — the analysis is taking a little longer…",
];

// The image formats the API actually accepts (it verifies magic bytes). Listing
// them explicitly keeps the picker from offering HEIC/AVIF/GIF that would be
// rejected only AFTER the upload — and makes iOS hand over a converted JPEG.
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [loaderStep, setLoaderStep] = useState(0);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({});
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetError, setBudgetError] = useState("");

  // Keep the typed text, but only let a VALID budget reach the request — and
  // tell the user when it won't, rather than silently ignoring it.
  function onBudgetChange(raw: string) {
    setBudgetInput(raw);
    if (raw === "") {
      setBudgetError("");
      setProfile((p) => ({ ...p, budget: undefined }));
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setBudgetError("Enter 0 or more — this budget won't be applied.");
      setProfile((p) => ({ ...p, budget: undefined }));
      return;
    }
    setBudgetError("");
    setProfile((p) => ({ ...p, budget: n }));
  }
  const fileRef = useRef<HTMLInputElement>(null);
  // The minimum-loader timer, tracked so a reset (or unmount) can cancel it —
  // otherwise a late fire flips the app back to "done" after the user left.
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);

  // Theme toggle
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("theme")) as "light" | "dark" | null;
    const initial = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  // Advance the loader messages, then hold on the last one.
  useEffect(() => {
    if (phase !== "analyzing") return;
    setLoaderStep(0);
    const id = setInterval(
      () => setLoaderStep((s) => Math.min(s + 1, LOADER_STEPS.length - 1)),
      1400
    );
    return () => clearInterval(id);
  }, [phase]);

  async function runAnalyze(body: FormData | object) {
    setPhase("analyzing");
    setError("");
    // Start every run with a clean cancel flag. A cancelled run can exit
    // without passing through its own catch (the poll loop returns early on an
    // aborted signal, and a cancel during the reveal hold has no in-flight
    // request at all), leaving the flag stuck true. The next genuine failure
    // then read it as "the user cancelled" and returned the user to the
    // landing page with no error shown at all.
    cancelledRef.current = false;
    const started = Date.now();
    // A real analysis can poll for ~110s. Hold the controller so the user can
    // actually stop waiting instead of being pinned to the loader.
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 150000);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        // Never let the loader spin forever if the route stalls. Must exceed the
        // server budget (poll up to ~110s + init/put/task + narration).
        signal: controller.signal,
        ...(body instanceof FormData
          ? { body }
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
      if (!res.ok) {
        // Surface the route's specific message (413 too large, 429 rate limit,
        // 400 bad file/profile) instead of a generic fallback.
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Something went wrong analyzing your skin. Please try again.");
      }
      const data: AnalyzeResult = await res.json();
      finishAnalyze(data, started);
    } catch (e) {
      // A user-initiated cancel is not an error — go quietly back to the start.
      if (cancelledRef.current) {
        cancelledRef.current = false;
        setPhase("idle");
        return;
      }
      setError(e instanceof Error ? e.message : "Something went wrong analyzing your skin. Please try again.");
      setPhase("error");
    } finally {
      clearTimeout(timeout);
      // Only relinquish the slot if it is still ours. A run that was
      // cancelled can finish its cleanup after a NEWER run has already claimed
      // abortRef, and clearing it blindly left that newer run uncancellable.
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function cancelAnalyze() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    if (revealTimer.current) { clearTimeout(revealTimer.current); revealTimer.current = null; }
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setPhase("idle");
  }

  // Fetch the warmer LLM wording AFTER the reveal is on screen and swap it in.
  // Blocking the analysis on it used to cost up to 35s for copy the
  // deterministic core already had; failure here is silent by design.
  async function narrate(data: AnalyzeResult) {
    if (!data.plan.top_concerns.length) return;
    try {
      const res = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(40000), // exceeds the server's narration budget
        body: JSON.stringify({
          concerns: data.plan.top_concerns.map((c) => ({ concern: c.concern, severity: c.severity })),
        }),
      });
      if (!res.ok) return;
      const n: { headline?: string; explanations?: Record<string, string> } = await res.json();
      if (!n.headline && !n.explanations) return;
      setResult((prev) =>
        prev === data
          ? {
              ...prev,
              plan: {
                ...prev.plan,
                headline: n.headline || prev.plan.headline,
                top_concerns: prev.plan.top_concerns.map((c) => ({
                  ...c,
                  explanation: n.explanations?.[c.concern] || c.explanation,
                })),
              },
            }
          : prev
      );
    } catch {
      // cosmetic only — keep the deterministic wording
    }
  }

  // Upload a photo: /start does the fast work (face detect, upload, task
  // creation) and hands back a task id; we then poll /status ourselves. The wait
  // lives here in the browser rather than inside one long server request, which
  // a serverless platform would kill at its time cap (Vercel Hobby: 60s).
  async function runUpload(file: File) {
    setPhase("analyzing");
    setError("");
    cancelledRef.current = false; // see runAnalyze
    const started = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("profile", JSON.stringify(profile));
      const startRes = await fetch("/api/analyze/start", { method: "POST", body: fd, signal: controller.signal });
      const startData = await startRes.json().catch(() => null);
      if (!startRes.ok) throw new Error(startData?.error || "Something went wrong analyzing your skin. Please try again.");

      // No API key configured: /start already returned sample data.
      if (startData?.state === "success") return finishAnalyze(startData.result, started);

      const taskId = startData?.taskId;
      if (!taskId) throw new Error("Something went wrong analyzing your skin. Please try again.");

      // Poll until it lands. Generous ceiling — a live HD analysis has been seen
      // taking well over a minute, and the user can Cancel at any point.
      const deadline = Date.now() + 4 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        if (controller.signal.aborted) return;
        const res = await fetch("/api/analyze/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ taskId, profile }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Something went wrong analyzing your skin. Please try again.");
        if (data?.state === "success") return finishAnalyze(data.result, started);
      }
      throw new Error("That took longer than expected. Please try again.");
    } catch (e) {
      if (cancelledRef.current) {
        cancelledRef.current = false;
        setPhase("idle");
        return;
      }
      setError(e instanceof Error ? e.message : "Something went wrong analyzing your skin. Please try again.");
      setPhase("error");
    } finally {
      // Only relinquish the slot if it is still ours. A run that was
      // cancelled can finish its cleanup after a NEWER run has already claimed
      // abortRef, and clearing it blindly left that newer run uncancellable.
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // Hold the loader on screen briefly so the reveal doesn't flash past.
  function finishAnalyze(data: AnalyzeResult, started: number) {
    const wait = Math.max(0, 2200 - (Date.now() - started));
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => {
      revealTimer.current = null;
      setResult(data);
      setPhase("done");
      narrate(data);
    }, wait);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    runUpload(f);
    // Clear so re-selecting the SAME file still fires onChange next time.
    e.target.value = "";
  }

  function runDemo() {
    setPreview(null);
    runAnalyze({ variant: "balanced", profile });
  }

  function reset() {
    if (revealTimer.current) { clearTimeout(revealTimer.current); revealTimer.current = null; }
    setResult(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhase("idle");
  }

  return (
    <main className="max-w-6xl mx-auto px-5 py-8 w-full">
      {/* Header */}
      <header className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">✨</span>
          <span className="font-bold text-lg">GlowRead</span>
          <span className="chip ml-1">AI Skincare Coach</span>
        </div>
        <button onClick={toggleTheme} className="btn-ghost" aria-label="Toggle theme">
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>
      </header>

      {phase === "idle" && (
        <section className="text-center max-w-2xl mx-auto rise min-h-[76vh] flex flex-col justify-center">
          <div className="eyebrow mb-5">AI skin analysis · routine · real products</div>
          <h1 className="display" style={{ fontSize: "clamp(2.6rem, 7vw, 4.2rem)" }}>
            Read your skin like<br />
            an <span style={{ color: "var(--violet-2)", fontStyle: "italic" }}>instrument.</span>
          </h1>
          <p className="mt-6 text-lg mx-auto" style={{ color: "var(--muted)", maxWidth: "34rem" }}>
            Take one selfie. In a few seconds you&apos;ll see what your skin needs,
            a simple routine for it, and real products that fit.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button className="btn-primary" onClick={() => fileRef.current?.click()}>📸 Analyze my selfie</button>
            <button className="btn-ghost" onClick={runDemo}>Try a demo</button>
            <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES} className="hidden" onChange={onPickFile} />
          </div>

          {/* Optional personalization (scan-first: collapsed by default) */}
          <div className="mt-6">
            {/* py-2.5 keeps this a >=24px tap target on mobile (it was 20px). */}
            <button className="text-sm link-accent px-2 py-2.5" onClick={() => setShowProfile((v) => !v)}>
              {showProfile ? "Hide personalization" : "Personalize (optional)"}
            </button>
            {showProfile && (
              <div className="card p-5 mt-3 text-left grid sm:grid-cols-2 gap-4 rise">
                <label className="text-sm">
                  Skin type
                  {/* Explicit background/colour, NOT bg-transparent: the native
                      dropdown popup is painted from the control's own used
                      colours, and a transparent one falls back to white — an
                      unreadable light list over the dark UI. */}
                  <select
                    className="mt-1 w-full rounded-lg p-2 border field"
                    style={{ borderColor: "var(--border)" }}
                    value={profile.skinType ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, skinType: (e.target.value || undefined) as UserProfile["skinType"] }))}
                  >
                    <option value="">Not sure</option>
                    <option value="dry">Dry</option>
                    <option value="oily">Oily</option>
                    <option value="combination">Combination</option>
                    <option value="normal">Normal</option>
                    <option value="sensitive">Sensitive</option>
                  </select>
                </label>
                <label className="text-sm">
                  Budget per product (USD)
                  <input
                    type="number" min={0} placeholder="e.g. 25"
                    className="mt-1 w-full rounded-lg p-2 border field"
                    style={{ borderColor: budgetError ? "var(--high)" : "var(--border)" }}
                    aria-invalid={!!budgetError}
                    aria-describedby={budgetError ? "budget-error" : undefined}
                    value={budgetInput}
                    onChange={(e) => onBudgetChange(e.target.value)}
                  />
                  {/* A negative budget used to be accepted by the field, dropped
                      silently by the server, and the user got the full-price
                      catalog believing their cap had applied. Say so instead. */}
                  {budgetError && (
                    <span id="budget-error" className="block mt-1 text-xs" style={{ color: "var(--high)" }}>
                      {budgetError}
                    </span>
                  )}
                </label>
                {/* w-6 h-6 = 24px, the WCAG 2.5.8 minimum (these were 13px). */}
                <label className="text-sm flex items-center gap-2 py-1 cursor-pointer">
                  <input type="checkbox" className="w-6 h-6 shrink-0" checked={!!profile.sensitive}
                    onChange={(e) => setProfile((p) => ({ ...p, sensitive: e.target.checked }))} />
                  Sensitive skin
                </label>
                <label className="text-sm flex items-center gap-2 py-1 cursor-pointer">
                  <input type="checkbox" className="w-6 h-6 shrink-0" checked={!!profile.pregnant}
                    onChange={(e) => setProfile((p) => ({ ...p, pregnant: e.target.checked }))} />
                  Pregnant / breastfeeding
                </label>
              </div>
            )}
          </div>

          <p className="text-xs mt-8" style={{ color: "var(--muted)" }}>
            We analyze your photo and never store it. This is cosmetic guidance, not medical advice.
          </p>
        </section>
      )}

      {phase === "analyzing" && (
        <section className="max-w-md mx-auto text-center py-16">
          <div className="relative w-36 h-36 mx-auto mb-8 rounded-full overflow-hidden"
            style={{ boxShadow: "0 0 0 1px var(--border), 0 0 60px -10px var(--glow)" }}>
            {preview ? (
              <img src={preview} alt="your selfie" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full skeleton" />
            )}
            {/* Scanning sweep */}
            <div className="absolute inset-x-0 h-1/2 pointer-events-none"
              style={{
                background: "linear-gradient(var(--violet), transparent)",
                opacity: 0.5, animation: "scanSweep 1.8s ease-in-out infinite",
              }} />
            <div className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 40px -10px var(--glow)" }} />
          </div>
          <div className="eyebrow" style={{ color: "var(--violet-2)" }}>analyzing</div>
          <div className="text-lg font-medium mt-2">{LOADER_STEPS[loaderStep]}</div>
          <div className="mt-5 flex gap-1.5 justify-center">
            {LOADER_STEPS.map((_, i) => (
              <div key={i} className="h-1 rounded-full" style={{
                width: 34, background: i <= loaderStep ? "var(--violet)" : "var(--border)", transition: "background 0.4s",
              }} />
            ))}
          </div>
          {/* A live analysis can poll for ~110s — let the user out of it. */}
          <button className="btn-ghost mt-7" onClick={cancelAnalyze}>Cancel</button>
        </section>
      )}

      {phase === "done" && result && (
        <section>
          <Reveal result={result} />
          <div className="text-center mt-10">
            <button className="btn-ghost" onClick={reset}>Analyze again</button>
          </div>
          <footer className="text-center text-xs mt-8 pb-4" style={{ color: "var(--muted)" }}>
            {result.scores.source === "mock"
              ? "Demo mode with sample data. Connect the Perfect Corp API key to run a live analysis."
              : "Analysis by Perfect Corp."}
            {" "}This is cosmetic guidance, not medical advice, and prices are rough estimates.
          </footer>
        </section>
      )}

      {phase === "error" && (
        <section className="text-center py-16">
          <p className="text-lg mb-4">{error}</p>
          <button className="btn-primary" onClick={reset}>Try again</button>
        </section>
      )}
    </main>
  );
}
