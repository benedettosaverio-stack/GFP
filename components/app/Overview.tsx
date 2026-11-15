"use client";
import { useMemo } from "react";
import { advise, monthlySeries } from "@/lib/analysis";
import { colorOf, expenseCategories } from "@/lib/categories";
import { useApp } from "./store";
import SummaryCard, { FILTER_INCOME, FILTER_SAVINGS, type Filter } from "../SummaryCard";
import Indicators from "../Indicators";
import Coach from "../Coach";
import { TrendChart } from "../Charts";
import type { Tab } from "./Shell";

const int = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";

/** Synthèse : le mois en un coup d'œil, la santé, les conseils, l'évolution et les plus gros postes. */
export default function Overview({ go }: { go: (t: Tab) => void }) {
  const app = useApp();
  const { txs, month, shares, budgets, summary, settings, version } = app;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const advice = useMemo(() => (txs && month ? advise(txs, month, shares, budgets) : []), [txs, month, shares, budgets, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const series = useMemo(() => (txs && month ? monthlySeries(txs, month, shares) : []), [txs, month, shares, version]);
  const hasRevolut = app.monthTxs.some((t) => t.source === "Revolut");

  const top = expenseCategories()
    .map((c) => [c, summary.byCategory[c] ?? 0] as const)
    .filter(([, v]) => v > 0.004)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const max = Math.max(1, ...top.map(([, v]) => v));

  const onFilter = (f: Filter) => {
    if (!f) return;
    app.setOpsPreset(f === FILTER_INCOME ? { kind: "income" } : f === FILTER_SAVINGS ? { kind: "savings" } : { category: f });
    go("operations");
  };

  return (
    <div className="cols">
      <div>
        <SummaryCard summary={summary} filter={null} onFilter={onFilter} hasRevolut={hasRevolut} />
        <Indicators summary={summary} />
        {settings.coach && <Coach items={advice.slice(0, 4)} onApply={app.applyBudgets} />}
      </div>
      <div>
        <section className="section first">
          <div className="section-title"><h2>Évolution</h2><button className="link" onClick={() => go("analyse")}>Analyse détaillée</button></div>
          <TrendChart data={series} current={month!} onPick={app.setMonth} />
        </section>
        <section className="section">
          <div className="section-title"><h2>Plus gros postes</h2><button className="link" onClick={() => go("budgets")}>Budgets</button></div>
          <div className="cats">
            {top.map(([c, v]) => {
              const b = budgets[c] ?? 0;
              const over = b > 0 && v > b;
              return (
                <button key={c} className="cat" onClick={() => onFilter(c)}>
                  <span className="name"><span className="dot" style={{ background: colorOf(c) }} />{c}</span>
                  <span className={`amt num ${over ? "over" : ""}`}>{int(v)}{b > 0 && <small> sur {int(b)}</small>}</span>
                  <span className="track"><i style={{ width: `${(v / Math.max(max, b)) * 100}%`, background: over ? "var(--alert)" : colorOf(c) }} /></span>
                </button>
              );
            })}
            {!top.length && <p className="muted">Aucune dépense ce mois-ci.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
