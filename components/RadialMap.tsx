"use client";

import { useEffect, useState } from "react";
import type { ConcernScore } from "@/lib/types";
import { badness, severityOf, SEV_COLOR, rankByBadness } from "@/lib/metrics";

const SIZE = 340;
const C = SIZE / 2;
const R_IN = 66;
const R_MAX = 150;
const PAD = 3; // degrees between wedges

function point(r: number, deg: number) {
  const t = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(t), y: C - r * Math.cos(t) };
}

function sectorPath(rIn: number, rOut: number, a0: number, a1: number) {
  const p0 = point(rOut, a0);
  const p1 = point(rOut, a1);
  const p2 = point(rIn, a1);
  const p3 = point(rIn, a0);
  // Pick the correct arc side: a single-concern wedge spans ~357°, which needs
  // the large-arc-flag set or the SVG draws a thin sliver instead.
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${rOut} ${rOut} 0 ${large} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${rIn} ${rIn} 0 ${large} 0 ${p3.x} ${p3.y} Z`;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return reduced;
}

export default function RadialMap({ concerns, healthScore }: { concerns: ConcernScore[]; healthScore: number }) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? healthScore : 0);

  // Count-up for the central skin-health readout.
  useEffect(() => {
    if (reduced) { setCount(healthScore); return; }
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * healthScore));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [healthScore, reduced]);

  // Worst-first, arranged clockwise from the top. Ranked on raw_score so the
  // order matches the top-concern chips and the breakdown list.
  const ranked = rankByBadness(concerns, "raw_score");
  const n = Math.max(ranked.length, 1);
  const step = 360 / n;
  const healthColor = healthScore >= 70 ? "var(--good)" : healthScore >= 50 ? "var(--mid)" : "var(--high)";

  return (
    <div className="relative" style={{ width: SIZE, maxWidth: "100%", aspectRatio: "1 / 1" }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
        aria-label={`Skin health ${healthScore} of 100 with ${concerns.length} measured concerns`}>
        <defs>
          <radialGradient id="lens" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--violet)" stopOpacity="0.35" />
            <stop offset="70%" stopColor="var(--violet)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--violet)" stopOpacity="0" />
          </radialGradient>
          <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {/* Ambient violet lens glow */}
        <circle cx={C} cy={C} r={R_MAX} fill="url(#lens)" className="bloom" />

        {/* Rotating scan ring (ambient) */}
        <circle cx={C} cy={C} r={R_MAX + 6} fill="none" stroke="var(--violet)" strokeOpacity="0.22"
          strokeWidth="1" strokeDasharray="2 10" className="spin-slow"
          style={{ transformOrigin: `${C}px ${C}px` }} />

        {/* Concern wedges (the skin map) */}
        <g className="bloom" style={{ transformOrigin: `${C}px ${C}px` }} filter="url(#soft)">
          {ranked.map((c, i) => {
            // Size on raw_score, the same field the wedges are ordered by, so a
            // lower-ranked wedge can never render longer than a higher one.
            const b = badness(c.key, c.raw_score);
            const rOut = R_IN + (b / 100) * (R_MAX - R_IN);
            const a0 = i * step + PAD / 2;
            const a1 = (i + 1) * step - PAD / 2;
            return (
              <path key={c.key} d={sectorPath(R_IN, Math.max(R_IN + 3, rOut), a0, a1)}
                fill={SEV_COLOR[severityOf(b)]} fillOpacity="0.9" />
            );
          })}
        </g>

        {/* Inner lens ring */}
        <circle cx={C} cy={C} r={R_IN - 4} fill="var(--surface)" stroke="var(--border)" strokeWidth="1" />
        <circle cx={C} cy={C} r={R_IN - 4} fill="none" stroke={healthColor} strokeOpacity="0.5" strokeWidth="1.5" />
      </svg>

      {/* Center readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="display" style={{ fontSize: "3.2rem", color: healthColor, lineHeight: 1 }}>{count}</span>
        <span className="eyebrow" style={{ marginTop: 4 }}>skin health</span>
      </div>
    </div>
  );
}
