import { CATEGORY_COLORS, EXPENSE_CATEGORIES } from "@/lib/categories";
import type { MonthSummary } from "@/lib/stats";
import type { Budgets } from "@/lib/types";
import type { Filter } from "./SummaryCard";

type Props = {
  summary: MonthSummary;
  budgets: Budgets;
  filter: Filter;
  onFilter: (f: Filter) => void;
  onBudget: (category: string, amount: number | null) => void;
};

const int = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";

export default function CategoryBreakdown({ summary, budgets, filter, onFilter, onBudget }: Props) {
  const rows = EXPENSE_CATEGORIES.map((c) => [c, summary.byCategory[c] ?? 0] as const)
    .filter(([c, v]) => v > 0.004 || budgets[c] > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([c, v]) => Math.max(v, budgets[c] ?? 0)));

  if (!rows.length) return <p className="muted">Aucune dépense ce mois-ci.</p>;

  return (
    <div className="cats">
      {rows.map(([c, v]) => {
        const b = budgets[c] ?? 0;
        const over = b > 0 && v > b;
        const selected = filter === c;
        return (
          <div key={c}>
            <button className={`cat ${selected ? "sel" : ""}`} onClick={() => onFilter(selected ? null : c)} aria-pressed={selected}>
              <span className="name"><span className="dot" style={{ background: CATEGORY_COLORS[c] }} />{c}</span>
              <span className={`amt num ${over ? "over" : ""}`}>
                {int(v)}{b > 0 && <small> sur {int(b)}</small>}
              </span>
              <span className="track"><i style={{ width: `${Math.min(100, (v / max) * 100)}%`, background: over ? "var(--alert)" : CATEGORY_COLORS[c] }} /></span>
            </button>
            {selected && (
              <label className="budget">
                Budget par mois
                <input
                  type="number" inputMode="decimal" min={0} step={10} placeholder="aucun"
                  defaultValue={b || ""}
                  onBlur={(e) => {
                    const n = parseFloat(e.target.value.replace(",", "."));
                    const next = n > 0 ? n : null;
                    if ((next ?? 0) !== b) onBudget(c, next);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
                €
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
