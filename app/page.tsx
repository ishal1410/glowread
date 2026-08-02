"use client";

import { useEffect, useRef, useState } from "react";
import Reveal from "@/components/Reveal";
import type { AnalyzeResult, UserProfile } from "@/lib/types";

type Phase = "idle" | "analyzing" | "done" | "error";

const LOADER_STEPS = [
  "Detecting face…",
  "Scoring your skin concerns…",
  "Reading hydration & texture…",
  "Building your routine…",
  "Matching real products…",
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [loaderStep, setLoaderStep] = useState(0);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({});
  const fileRef = useRef<HTMLInputElement>(null);

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

  // Cycle loader messages
  useEffect(() => {
    if (phase !== "analyzing") return;
    setLoaderStep(0);
    const id = setInterval(() => setLoaderStep((s) => (s + 1) % LOADER_STEPS.length), 900);
    return () => clearInterval(id);
  }, [phase]);

  async function runAnalyze(body: FormData | object) {
    setPhase("analyzing");
    setError("");
    const started = Date.now();
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
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
      // Keep the loader on screen at least ~2.2s so it feels considered.
      const wait = Math.max(0, 2200 - (Date.now() - started));
      setTimeout(() => {
        setResult(data);
        setPhase("done");
      }, wait);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong analyzing your skin. Please try again.");
      setPhase("error");
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    const fd = new FormData();
    fd.append("image", f);
    fd.append("profile", JSON.stringify(profile));
    runAnalyze(fd);
    // Clear so re-selecting the SAME file still fires onChange next time.
    e.target.value = "";
  }

  function runDemo() {
    setPreview(null);
    runAnalyze({ variant: "balanced", profile });
  }

  function reset() {
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
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          </div>

          {/* Optional personalization (scan-first: collapsed by default) */}
          <div className="mt-6">
            <button className="text-sm link-accent" onClick={() => setShowProfile((v) => !v)}>
              {showProfile ? "Hide personalization" : "Personalize (optional)"}
            </button>
            {showProfile && (
              <div className="card p-5 mt-3 text-left grid sm:grid-cols-2 gap-4 rise">
                <label className="text-sm">
                  Skin type
                  <select
                    className="mt-1 w-full rounded-lg p-2 bg-transparent border"
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
                    className="mt-1 w-full rounded-lg p-2 bg-transparent border"
                    style={{ borderColor: "var(--border)" }}
                    value={profile.budget ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, budget: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={!!profile.sensitive}
                    onChange={(e) => setProfile((p) => ({ ...p, sensitive: e.target.checked }))} />
                  Sensitive skin
                </label>
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={!!profile.pregnant}
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
