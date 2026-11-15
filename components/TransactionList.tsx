import { useState } from "react";
import { ALL_CATEGORIES, CATEGORY_COLORS, INTERNAL, SAVINGS, isIncome } from "@/lib/categories";
import { eur } from "@/lib/text";
import { myAmount, type Shares } from "@/lib/stats";
import type { Transaction } from "@/lib/types";
import { FILTER_INCOME, FILTER_SAVINGS, type Filter } from "./SummaryCard";

type Props = {
  txs: Transaction[];
  shares: Shares;
  labels: Record<string, string>;
  filter: Filter;
  onClearFilter: () => void;
  onRecategorize: (tx: Transaction, category: string) => void;
};

const TITLES: Record<string, string> = { [FILTER_INCOME]: "Rentrées", [FILTER_SAVINGS]: "Mis de côté" };

export default function TransactionList({ txs, shares, labels, filter, onClearFilter, onRecategorize }: Props) {
  const [showInternal, setShowInternal] = useState(false);
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date) || a.amount - b.amount);
  const internal = sorted.filter((t) => t.category === INTERNAL);

  let shown: Transaction[];
  if (filter === FILTER_INCOME) shown = sorted.filter((t) => isIncome(t.category));
  else if (filter === FILTER_SAVINGS) shown = sorted.filter((t) => t.category === SAVINGS);
  else if (filter) shown = sorted.filter((t) => t.category === filter);
  else shown = sorted.filter((t) => t.category !== INTERNAL || showInternal);

  const accounts = new Set(txs.map((t) => t.account));

  return (
    <>
      <div className="row-title">
        <h2>{filter ? TITLES[filter] ?? filter : "Opérations"} · {shown.length}</h2>
        {filter && <button className="link" onClick={onClearFilter}>Tout voir</button>}
      </div>
      <section className="card">
        {shown.map((t) => {
          const dim = t.category === INTERNAL || t.category === SAVINGS;
          const [, m, d] = t.date.split("-");
          return (
            <div key={t.id} className={`tx ${dim ? "dim" : ""}`}>
              <div className="l">
                <div className="t">{t.label}</div>
                <div className="d">
                  {d}/{m}
                  <span className="pill">
                    <span className="dot" style={{ background: CATEGORY_COLORS[t.category] ?? "#999" }} />
                    {t.category} ▾
                    <select aria-label="Changer la catégorie" value={t.category} onChange={(e) => onRecategorize(t, e.target.value)}>
                      {ALL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </span>
                  {accounts.size > 1 && <span>· {labels[t.account] ?? t.account}</span>}
                  {(shares[t.account] ?? 1) < 1 && !dim && <span>· ta part sur {eur(Math.abs(t.amount))}</span>}
                </div>
              </div>
              <div className={`a num ${t.amount > 0 && !dim ? "pos" : ""}`}>
                {dim ? eur(Math.abs(t.amount)) : (t.amount > 0 ? "+" : "") + eur(myAmount(t, shares))}
              </div>
            </div>
          );
        })}
        {!shown.length && <div className="empty">Rien ici.</div>}
        {!filter && internal.length > 0 && (
          <div className="tx">
            <button className="link" onClick={() => setShowInternal(!showInternal)}>
              {showInternal ? "Masquer" : "Voir"} les mouvements entre tes comptes ({internal.length})
            </button>
          </div>
        )}
      </section>
      {!filter && internal.length > 0 && (
        <div className="foot">Les mouvements entre tes comptes (livret, Revolut…) ne comptent ni comme rentrées ni comme dépenses.</div>
      )}
    </>
  );
}
