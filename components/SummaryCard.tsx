import { eur, monthLabel } from "@/lib/text";
import type { MonthSummary } from "@/lib/stats";

/** Filtre de la liste : une catégorie, ou les rentrées / l'épargne. */
export type Filter = string | null;
export const FILTER_INCOME = "__income";
export const FILTER_SAVINGS = "__savings";

type Props = { month: string; summary: MonthSummary; filter: Filter; onFilter: (f: Filter) => void; hasRevolut: boolean };

export default function SummaryCard({ month, summary: s, filter, onFilter, hasRevolut }: Props) {
  const balance = s.income - s.spent;
  const toggle = (f: string) => onFilter(filter === f ? null : f);
  return (
    <section className="card hero">
      <div className="lbl">Dépensé en {monthLabel(month).split(" ")[0]}</div>
      <div className="big num">{eur(s.spent)}</div>
      <div className="stats">
        <button className={`stat ${filter === FILTER_INCOME ? "on" : ""}`} onClick={() => toggle(FILTER_INCOME)}>
          <b className="pos num">{eur(s.income, 0)}</b>
          <small>Rentrées ›</small>
        </button>
        <button className={`stat ${filter === FILTER_SAVINGS ? "on" : ""}`} onClick={() => toggle(FILTER_SAVINGS)}>
          <b className="num">{eur(s.saved, 0)}</b>
          <small>Mis de côté ›</small>
        </button>
        <div className="stat">
          <b className={`num ${balance >= 0 ? "pos" : "neg"}`}>{eur(balance, 0)}</b>
          <small>Rentrées − dépenses</small>
        </div>
      </div>
      {s.internal < -1 && !hasRevolut && (
        <div className="note">
          ↗︎ <b>{eur(-s.internal, 0)}</b> envoyés vers un autre de tes comptes. Importe aussi son relevé pour voir où ils sont partis.
        </div>
      )}
    </section>
  );
}
