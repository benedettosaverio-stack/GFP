import { useState } from "react";
import { ALL_CATEGORIES, CATEGORY_COLORS, INTERNAL, SAVINGS, isIncome, tint } from "@/lib/categories";
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

const dayLabel = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export default function TransactionList({ txs, shares, labels, filter, onClearFilter, onRecategorize }: Props) {
  const [showInternal, setShowInternal] = useState(false);
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date) || a.amount - b.amount);
  const internal = sorted.filter((t) => t.category === INTERNAL);

  let shown: Transaction[];
  if (filter === FILTER_INCOME) shown = sorted.filter((t) => isIncome(t.category));
  else if (filter === FILTER_SAVINGS) shown = sorted.filter((t) => t.category === SAVINGS);
  else if (filter) shown = sorted.filter((t) => t.category === filter);
  else shown = sorted.filter((t) => t.category !== INTERNAL || showInternal);

  const days: [string, Transaction[]][] = [];
  for (const t of shown) {
    const last = days[days.length - 1];
    if (last && last[0] === t.date) last[1].push(t);
    else days.push([t.date, [t]]);
  }
  const multiAccount = new Set(txs.map((t) => t.account)).size > 1;

  return (
    <section className="section">
      <div className="section-title">
        <h2>{filter ? TITLES[filter] ?? filter : "Opérations"}</h2>
        {filter && <button className="link" onClick={onClearFilter}>Tout afficher</button>}
      </div>

      {days.map(([date, list]) => (
        <div className="day" key={date}>
          <h3>{dayLabel(date)}</h3>
          {list.map((t) => {
            const dim = t.category === INTERNAL || t.category === SAVINGS;
            const part = shares[t.account] ?? 1;
            return (
              <div key={t.id} className={`tx ${dim ? "dim" : ""}`}>
                <div className="l">
                  <div className="t">{t.label}</div>
                  <div className="meta">
                    <span className="chip" style={{ background: tint(t.category) }}>
                      <span className="dot" style={{ background: CATEGORY_COLORS[t.category] ?? "#C9CCD3" }} />
                      {t.category}
                      <select aria-label={`Catégorie de ${t.label}`} value={t.category} onChange={(e) => onRecategorize(t, e.target.value)}>
                        {ALL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </span>
                    {multiAccount && <span>{labels[t.account] ?? t.account}</span>}
                    {part < 1 && !dim && <span>ta part sur {eur(Math.abs(t.amount))}</span>}
                  </div>
                </div>
                <div className={`a num ${t.amount > 0 && !dim ? "pos" : ""}`}>
                  {dim ? eur(Math.abs(t.amount)) : (t.amount > 0 ? "+" : "") + eur(myAmount(t, shares))}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {!shown.length && <p className="muted">Rien ici ce mois-ci.</p>}

      {!filter && internal.length > 0 && (
        <>
          <div className="more">
            <button className="link" onClick={() => setShowInternal(!showInternal)}>
              {showInternal ? "Masquer" : "Afficher"} les {internal.length} mouvements entre tes comptes
            </button>
          </div>
          <p className="foot">Ils ne comptent ni comme rentrées ni comme dépenses.</p>
        </>
      )}
    </section>
  );
}
