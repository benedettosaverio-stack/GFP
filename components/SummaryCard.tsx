import type { MonthSummary } from "@/lib/stats";

/** Filtre de la liste : une catégorie, ou les rentrées / l'épargne. */
export type Filter = string | null;
export const FILTER_INCOME = "__income";
export const FILTER_SAVINGS = "__savings";

type Props = { summary: MonthSummary; filter: Filter; onFilter: (f: Filter) => void; hasRevolut: boolean };

const int = (n: number) => Math.round(Math.abs(n)).toLocaleString("fr-FR");

/** Le montant du mois, en grand, puis trois faits en une ligne. */
export default function SummaryCard({ summary: s, filter, onFilter, hasRevolut }: Props) {
  const [units, cents] = Math.abs(s.spent).toFixed(2).split(".");
  const balance = s.income - s.spent;
  const toggle = (f: string) => onFilter(filter === f ? null : f);
  return (
    <section className="hero">
      <p className="amount num">
        {Number(units).toLocaleString("fr-FR")}<span className="cents">,{cents} €</span>
      </p>
      <p className="caption">dépensés ce mois-ci</p>
      <div className="facts">
        <button className={`fact ${filter === FILTER_INCOME ? "on" : ""}`} onClick={() => toggle(FILTER_INCOME)}>
          <b className="num">{int(s.income)} €</b> de rentrées
        </button>
        <button className={`fact ${filter === FILTER_SAVINGS ? "on" : ""}`} onClick={() => toggle(FILTER_SAVINGS)}>
          <b className="num">{int(s.saved)} €</b> mis de côté
        </button>
        <span className="fact">
          <b className={`num ${balance < 0 ? "neg" : ""}`}>{balance < 0 ? "−" : ""}{int(balance)} €</b> {balance < 0 ? "de dépassement" : "de marge"}
        </span>
      </div>
      {s.internal < -1 && !hasRevolut && (
        <p className="aside">{int(s.internal)} € sont partis vers un autre de tes comptes. Importe son relevé pour voir où ils sont allés.</p>
      )}
    </section>
  );
}
