"use client";

import { useEffect, useRef, useState } from "react";
import Reveal from "@/components/Reveal";
import type { AnalyzeResult, UserProfile } from "@/lib/types";

type Phase = "idle" | "analyzing" | "done" | "error";

const LOADER_STEPS = [
  "Detecting face…",
  "Scoring 15 skin concerns…",
  "Reading hydration & texture…",
  "Building your personalized routine…",
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
      if (!res.ok) throw new Error("failed");
      const data: AnalyzeResult = await res.json();
      // Keep the loader on screen at least ~2.2s so it feels considered.
      const wait = Math.max(0, 2200 - (Date.now() - started));
      setTimeout(() => {
        setResult(data);
        setPhase("done");
      }, wait);
    } catch {
      setError("Something went wrong analyzing your skin. Please try again.");
      setPhase("error");
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    const fd = new FormData();
    fd.append("image", f);
    fd.append("profile", JSON.stringify(profile));
    runAnalyze(fd);
  }

  function runDemo() {
    setPreview(null);
    runAnalyze({ variant: "balanced", profile });
  }

  function reset() {
    setResult(null);
    setPreview(null);
    setPhase("idle");
  }

  return (
    <main className="max-w-5xl mx-auto px-5 py-8 w-full">
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
        <section className="text-center max-w-2xl mx-auto rise">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight">
            Your skin, <span style={{ color: "var(--accent)" }}>read in seconds.</span>
          </h1>
          <p className="mt-4 text-lg" style={{ color: "var(--muted)" }}>
            Snap a selfie. Get an instant analysis of 15 skin concerns, a personalized AM/PM routine,
            and real products matched to your skin — powered by dermatologist-grade AI.
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
            Photos are analyzed, not stored. Cosmetic guidance only — not medical advice.
          </p>
        </section>
      )}

      {phase === "analyzing" && (
        <section className="max-w-md mx-auto text-center py-16">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="your selfie" className="w-32 h-32 object-cover rounded-full mx-auto mb-6"
              style={{ boxShadow: "var(--shadow)", animation: "pulseSoft 1.6s ease-in-out infinite" }} />
          ) : (
            <div className="w-32 h-32 rounded-full mx-auto mb-6 skeleton" style={{ animation: "pulseSoft 1.6s ease-in-out infinite" }} />
          )}
          <div className="text-lg font-medium">{LOADER_STEPS[loaderStep]}</div>
          <div className="mt-4 space-y-2">
            {LOADER_STEPS.map((_, i) => (
              <div key={i} className="h-1.5 rounded-full mx-auto" style={{
                width: 180, background: i <= loaderStep ? "var(--accent)" : "var(--border)", transition: "background 0.4s",
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
              ? "Demo mode — sample analysis. Live Perfect Corp analysis activates when the API key is connected."
              : "Powered by Perfect Corp Skin Analysis."}
            {" "}Cosmetic guidance only, not medical advice. Product prices are indicative.
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
