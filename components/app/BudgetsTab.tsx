"use client";
import { useMemo, useState } from "react";
import { advise, daysIn } from "@/lib/analysis";
import { colorOf, expenseCategories } from "@/lib/categories";
import { useApp } from "./store";

const int = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";

/** Budgets : enveloppes par catégorie, reste à dépenser, rythme conseillé par jour. */
export default function BudgetsTab() {
  const app = useApp();
  const { summary, budgets, month, txs, shares, version } = app;
  const [adding, setAdding] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const proposal = useMemo(() => (txs && month ? advise(txs, month, shares, {}).find((a) => a.action?.label === "Appliquer ces budgets")?.action?.budgets : undefined), [txs, month, shares, version]);

  const withBudget = expenseCategories().filter((c) => budgets[c] > 0);
  const without = expenseCategories().filter((c) => !(budgets[c] > 0));
  const totalBudget = withBudget.reduce((s, c) => s + budgets[c], 0);
  const spentInBudgets = withBudget.reduce((s, c) => s + (summary.byCategory[c] ?? 0), 0);
  const left = totalBudget - spentInBudgets;

  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const daysLeft = month === curKey ? daysIn(month!) - now.getDate() + 1 : 0;

  return (
    <div className="budgets">
      {withBudget.length > 0 ? (
        <section className="budget-hero">
          <p className={`amount num ${left < 0 ? "neg" : ""}`}>{int(Math.abs(left))}</p>
          <p className="caption">{left >= 0 ? "restants sur tes budgets" : "au-dessus de tes budgets"}</p>
          <div className="facts">
            <span className="fact"><b className="num">{int(spentInBudgets)}</b> dépensés sur {int(totalBudget)}</span>
            {daysLeft > 0 && left > 0 && <span className="fact"><b className="num">{int(left / daysLeft)}</b> par jour d&apos;ici la fin du mois</span>}
          </div>
          <div className="bigbar"><i style={{ width: `${Math.min(100, (spentInBudgets / Math.max(totalBudget, 1)) * 100)}%`, background: left < 0 ? "var(--alert)" : "var(--ink)" }} /></div>
        </section>
      ) : (
        <section className="budget-hero">
          <p className="lead">Aucun budget pour l&apos;instant.</p>
          <p className="muted">Fixe un plafond par catégorie : GFP te dira combien il te reste et quand tu t&apos;approches de la limite.</p>
          {proposal && (
            <button className="pill" onClick={() => app.applyBudgets(proposal)}>
              Appliquer {Object.keys(proposal).length} budgets calculés sur tes dépenses ({int(Object.values(proposal).reduce((a, b) => a + b, 0))} par mois)
            </button>
          )}
        </section>
      )}

      {withBudget.length > 0 && (
        <section className="section">
          <div className="section-title"><h2>Tes enveloppes</h2></div>
          <div className="envelopes">
            {withBudget.sort((a, b) => (summary.byCategory[b] ?? 0) / budgets[b] - (summary.byCategory[a] ?? 0) / budgets[a]).map((c) => {
              const v = summary.byCategory[c] ?? 0;
              const b = budgets[c];
              const ratio = v / b;
              return (
                <div key={c} className={`envelope ${ratio > 1 ? "over" : ratio > 0.8 ? "near" : ""}`}>
                  <div className="env-head">
                    <span className="name"><span className="dot" style={{ background: colorOf(c) }} />{c}</span>
                    <span className="num">{ratio > 1 ? `+${int(v - b)}` : `${int(b - v)} restants`}</span>
                  </div>
                  <div className="track wide"><i style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratio > 1 ? "var(--alert)" : colorOf(c) }} /></div>
                  <div className="env-foot">
                    <span className="muted num">{int(v)} sur</span>
                    <input
                      type="number" min={0} step={10} defaultValue={b} aria-label={`Budget ${c}`}
                      onBlur={(e) => { const n = Number(e.target.value); if (n !== b) app.setBudget(c, n > 0 ? n : null); }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    /> €
                    <button className="link muted" onClick={() => app.setBudget(c, null)}>Retirer</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-title">
          <h2>Sans budget</h2>
          <button className="link" onClick={() => setAdding(!adding)}>{adding ? "Masquer" : "Ajouter un budget"}</button>
        </div>
        <div className="cats">
          {without.filter((c) => adding || (summary.byCategory[c] ?? 0) > 0).map((c) => (
            <div key={c} className="nobudget">
              <span className="name"><span className="dot" style={{ background: colorOf(c) }} />{c}</span>
              <span className="muted num">{int(summary.byCategory[c] ?? 0)} ce mois-ci</span>
              <input
                type="number" min={0} step={10} placeholder="Budget" aria-label={`Budget ${c}`}
                onBlur={(e) => { const n = Number(e.target.value); if (n > 0) app.setBudget(c, n); }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
