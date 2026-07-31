import type { AnalyzeResult, ConcernScore, RoutineStep, MatchedProduct, Severity } from "@/lib/types";
import { INGREDIENT_RATIONALE } from "@/lib/products";
import { badness } from "@/lib/metrics";

const sevColor: Record<Severity, string> = {
  high: "var(--rose)",
  moderate: "var(--amber)",
  low: "var(--sage)",
};

function ScoreRing({ value }: { value: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  const hue = value >= 70 ? "var(--sage)" : value >= 50 ? "var(--amber)" : "var(--rose)";
  return (
    <div className="relative" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke={hue} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{value}</span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>skin health</span>
      </div>
    </div>
  );
}

function ConcernBar({ concern, i }: { concern: ConcernScore; i: number }) {
  // Color by polarity-aware "badness" so high firmness/radiance read as good.
  const b = badness(concern.key, concern.ui_score);
  const level: Severity = b >= 55 ? "high" : b >= 35 ? "moderate" : "low";
  return (
    <div className="rise" style={{ animationDelay: `${0.05 * i}s` }}>
      <div className="flex justify-between text-sm mb-1">
        <span>{concern.label}</span>
        <span style={{ color: "var(--muted)" }}>{concern.ui_score}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${concern.ui_score}%`, background: sevColor[level], transition: "width 1s ease" }}
        />
      </div>
    </div>
  );
}

function StepList({ title, steps, icon }: { title: string; steps: RoutineStep[]; icon: string }) {
  return (
    <div className="card p-6 flex-1">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span aria-hidden>{icon}</span> {title}
      </h3>
      <ol className="space-y-4">
        {steps.map((s) => (
          <li key={`${title}-${s.order}-${s.ingredient}`} className="flex gap-3">
            <span
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {s.order}
            </span>
            <div>
              <div className="font-medium">
                {s.product_type}
                <span className="chip ml-2">{s.ingredient}</span>
              </div>
              <div className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>{s.why}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ProductCard({ p }: { p: MatchedProduct }) {
  return (
    <a href={p.url} target="_blank" rel="noopener noreferrer" className="card p-5 block hover:-translate-y-1 transition-transform">
      <div className="flex justify-between items-start gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>{p.brand}</div>
          <div className="font-semibold leading-tight">{p.name}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold" style={{ color: "var(--accent)" }}>${p.price}</div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>{p.priceNote}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {p.key_ingredients.map((ing) => (
          <span key={ing} className="chip" title={INGREDIENT_RATIONALE[ing.toLowerCase()] || ""}>{ing}</span>
        ))}
      </div>
      <div className="text-xs mt-3" style={{ color: "var(--muted)" }}>{p.category} · matches {p.matchedFor.join(", ")}</div>
    </a>
  );
}

export default function Reveal({ result }: { result: AnalyzeResult }) {
  const { scores, plan, products } = result;
  const topConcernKeys = new Set(plan.top_concerns.map((c) => c.concern));
  // Worst-first so the most-needing-attention concerns lead.
  const orderedConcerns = [...scores.concerns].sort(
    (a, b) => badness(b.key, b.ui_score) - badness(a.key, a.ui_score)
  );

  return (
    <div className="space-y-8">
      {/* Headline + health */}
      <section className="card p-8 rise flex flex-col md:flex-row items-center gap-8">
        <ScoreRing value={scores.healthScore} />
        <div className="flex-1 text-center md:text-left">
          <div className="chip mb-3">
            {scores.source === "mock" ? "Demo analysis" : "Perfect Corp analysis"} · est. skin age {scores.skinAge}
          </div>
          <h2 className="text-2xl md:text-3xl font-bold leading-tight">{plan.headline}</h2>
          <div className="flex flex-wrap gap-2 mt-4 justify-center md:justify-start">
            {plan.top_concerns.map((c) => (
              <span key={c.concern} className="chip" style={{ borderColor: sevColor[c.severity], color: sevColor[c.severity] }}>
                {c.label} · {c.severity}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Top concerns explained */}
      <section className="grid md:grid-cols-3 gap-4">
        {plan.top_concerns.map((c, i) => (
          <div key={c.concern} className="card p-6 rise" style={{ animationDelay: `${0.1 * i}s` }}>
            <div className="w-10 h-10 rounded-full mb-3 flex items-center justify-center font-bold"
              style={{ background: "var(--accent-soft)", color: sevColor[c.severity] }}>
              {i + 1}
            </div>
            <h3 className="font-semibold mb-1">{c.label}</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>{c.explanation}</p>
          </div>
        ))}
      </section>

      {/* Full breakdown + routine */}
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Full skin breakdown</h3>
          <div className="space-y-3">
            {orderedConcerns.map((c, i) => (
              <div key={c.key} style={{ opacity: topConcernKeys.has(c.key) ? 1 : 0.75 }}>
                <ConcernBar concern={c} i={i} />
              </div>
            ))}
          </div>
        </section>
        <div className="flex flex-col gap-6">
          <StepList title="Morning routine" steps={plan.routine.AM} icon="☀️" />
          <StepList title="Evening routine" steps={plan.routine.PM} icon="🌙" />
        </div>
      </div>

      {/* Products */}
      <section>
        <h3 className="text-lg font-semibold mb-4">Recommended for your skin</h3>
        {products.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        ) : (
          <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>
            No matching products in the current catalog. Try widening your budget to see recommendations.
          </div>
        )}
      </section>

      {/* Cautions */}
      {plan.cautions.length > 0 && (
        <section className="card p-6" style={{ borderColor: "var(--amber)" }}>
          <h3 className="font-semibold mb-2">Good to know</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm" style={{ color: "var(--muted)" }}>
            {plan.cautions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
