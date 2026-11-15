import type { Advice } from "@/lib/analysis";
import type { Budgets } from "@/lib/types";

const MARK: Record<Advice["tone"], string> = { warn: "À surveiller", tip: "Conseil", good: "Bien joué" };

/** Conseils calculés sur tes opérations, avec une action en un clic quand c'est possible. */
export default function Coach({ items, onApply }: { items: Advice[]; onApply: (b: Budgets) => void }) {
  if (!items.length) return null;
  return (
    <section className="section">
      <div className="section-title"><h2>Conseils</h2></div>
      <ul className="coach">
        {items.map((a, i) => (
          <li key={i} data-tone={a.tone}>
            <span className="tone">{MARK[a.tone]}</span>
            <b>{a.title}</b>
            <p>{a.text}</p>
            {a.action && <button className="pill" onClick={() => onApply(a.action!.budgets)}>{a.action.label}</button>}
          </li>
        ))}
      </ul>
      <p className="foot">Repères de gestion calculés sur tes relevés, pas des conseils en investissement.</p>
    </section>
  );
}
