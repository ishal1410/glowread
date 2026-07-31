import type { AnalyzeResult, ConcernScore, RoutineStep, MatchedProduct, Severity } from "@/lib/types";
import { INGREDIENT_RATIONALE } from "@/lib/products";
import { badness } from "@/lib/metrics";
import RadialMap from "./RadialMap";

const sevColor: Record<Severity, string> = {
  high: "var(--high)",
  moderate: "var(--mid)",
  low: "var(--good)",
};

function ConcernBar({ concern }: { concern: ConcernScore }) {
  const b = badness(concern.key, concern.ui_score);
  const level: Severity = b >= 55 ? "high" : b >= 35 ? "moderate" : "low";
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span>{concern.label}</span>
        <span className="mono" style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{concern.ui_score}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full"
          style={{ width: `${concern.ui_score}%`, background: sevColor[level], transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function StepList({ title, steps, index }: { title: string; steps: RoutineStep[]; index: string }) {
  return (
    <div className="card p-6 flex-1">
      <div className="flex items-baseline justify-between mb-5">
        <h3 className="display" style={{ fontSize: "1.5rem" }}>{title}</h3>
        <span className="eyebrow">{index}</span>
      </div>
      <ol className="space-y-4">
        {steps.map((s) => (
          <li key={`${title}-${s.order}-${s.ingredient}`} className="flex gap-3">
            <span className="mono shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: "var(--violet-soft)", color: "var(--violet-2)" }}>
              {String(s.order).padStart(2, "0")}
            </span>
            <div>
              <div className="font-medium flex items-center gap-2 flex-wrap">
                {s.product_type}
                <span className="chip">{s.ingredient}</span>
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
    <a href={p.url} target="_blank" rel="noopener noreferrer"
      className="card p-5 block transition-transform hover:-translate-y-1">
      <div className="flex justify-between items-start gap-3">
        <div>
          <div className="eyebrow">{p.brand}</div>
          <div className="font-semibold leading-tight mt-1">{p.name}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="mono font-bold" style={{ color: "var(--violet-2)" }}>${p.price}</div>
          <div className="mono text-[10px]" style={{ color: "var(--muted)" }}>{p.priceNote}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {p.key_ingredients.map((ing) => (
          <span key={ing} className="chip" title={INGREDIENT_RATIONALE[ing.toLowerCase()] || ""}>{ing}</span>
        ))}
      </div>
      <div className="mono text-[11px] mt-3" style={{ color: "var(--muted)" }}>
        {p.category} · targets {p.matchedFor.join(", ")}
      </div>
    </a>
  );
}

export default function Reveal({ result }: { result: AnalyzeResult }) {
  const { scores, plan, products } = result;
  const orderedConcerns = [...scores.concerns].sort(
    (a, b) => badness(b.key, b.ui_score) - badness(a.key, a.ui_score)
  );

  return (
    <div className="space-y-8">
      {/* Signature: the skin-map + headline */}
      <section className="card p-8 rise flex flex-col md:flex-row items-center gap-10">
        <div className="shrink-0"><RadialMap concerns={scores.concerns} healthScore={scores.healthScore} /></div>
        <div className="flex-1 text-center md:text-left">
          <div className="eyebrow mb-3">
            {scores.source === "mock" ? "demo analysis" : "perfect corp analysis"} · est. skin age {scores.skinAge}
          </div>
          <h2 className="display" style={{ fontSize: "2.4rem" }}>{plan.headline}</h2>
          <div className="flex flex-wrap gap-2 mt-5 justify-center md:justify-start">
            {plan.top_concerns.map((c) => (
              <span key={c.concern} className="chip"
                style={{ borderColor: sevColor[c.severity], color: sevColor[c.severity] }}>
                {c.label} · {c.severity}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Top concerns explained */}
      {plan.top_concerns.length > 0 && (
        <section className="grid md:grid-cols-3 gap-4">
          {plan.top_concerns.map((c, i) => (
            <div key={c.concern} className="card p-6 rise" style={{ animationDelay: `${0.08 * i}s` }}>
              <div className="mono text-xs mb-3" style={{ color: sevColor[c.severity] }}>
                {String(i + 1).padStart(2, "0")} / {c.severity}
              </div>
              <h3 className="font-semibold mb-1">{c.label}</h3>
              <p className="text-sm" style={{ color: "var(--muted)" }}>{c.explanation}</p>
            </div>
          ))}
        </section>
      )}

      {/* Breakdown + routine */}
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-6">
          <div className="flex items-baseline justify-between mb-5">
            <h3 className="display" style={{ fontSize: "1.5rem" }}>Full skin breakdown</h3>
            <span className="eyebrow">{scores.concerns.length} signals</span>
          </div>
          <div className="space-y-3.5">
            {orderedConcerns.map((c) => <ConcernBar key={c.key} concern={c} />)}
          </div>
        </section>
        <div className="flex flex-col gap-6">
          <StepList title="Morning" steps={plan.routine.AM} index="AM / daylight" />
          <StepList title="Evening" steps={plan.routine.PM} index="PM / repair" />
        </div>
      </div>

      {/* Products */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display" style={{ fontSize: "1.5rem" }}>Matched to your skin</h3>
          <span className="eyebrow">real products</span>
        </div>
        {products.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        ) : (
          <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>
            No matching products in the current catalog. Widen your budget to see recommendations.
          </div>
        )}
      </section>

      {/* Cautions */}
      {plan.cautions.length > 0 && (
        <section className="card p-6" style={{ borderColor: "var(--mid)" }}>
          <div className="eyebrow mb-2" style={{ color: "var(--mid)" }}>good to know</div>
          <ul className="list-disc pl-5 space-y-1 text-sm" style={{ color: "var(--muted)" }}>
            {plan.cautions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
