import { needsWants, savingsRate } from "@/lib/analysis";
import type { MonthSummary } from "@/lib/stats";
import { C } from "./Charts";

const euro = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const pct = (n: number) => Math.round(n * 100) + " %";

/** Deux indicateurs : taux d'épargne (anneau, repère 20 %) et répartition 50/30/20. */
export default function Indicators({ summary }: { summary: MonthSummary }) {
  const rate = savingsRate(summary);
  const split = needsWants(summary);
  const R = 38, L = 2 * Math.PI * R;
  const shown = Math.max(0, Math.min(1, rate));
  const status = rate < 0 ? "neg" : rate < 0.1 ? "warn" : rate >= 0.2 ? "good" : "ok";
  const verdict = { neg: "Dépenses au-dessus des rentrées", warn: "Sous le seuil de 10 %", ok: "Correct, vise 20 %", good: "Au-dessus du repère de 20 %" }[status];

  const inc = Math.max(split.income, 1);
  const parts: [string, number, string, number][] = [
    ["Besoins", split.needs, C.needs, 0.5],
    ["Envies", split.wants, C.wants, 0.3],
    ["Reste", Math.max(0, split.rest), C.rest, 0.2],
  ];
  const total = parts.reduce((a, p) => a + p[1], 0) || 1;

  return (
    <section className="section indicators">
      <div className="section-title"><h2>Santé du mois</h2></div>

      <div className="ring-row">
        <svg viewBox="0 0 96 96" className="ring" role="img" aria-label={`Taux d'épargne ${pct(rate)}`}>
          <circle cx="48" cy="48" r={R} className="ring-track" />
          <circle cx="48" cy="48" r={R} className={`ring-val ${status}`} strokeDasharray={`${shown * L} ${L}`} transform="rotate(-90 48 48)" />
          <line x1="48" y1={48 - R - 6} x2="48" y2={48 - R + 6} transform={`rotate(${0.2 * 360} 48 48)`} className="ring-mark" />
        </svg>
        <div>
          <p className="ring-value num">{pct(rate)}</p>
          <p className="ring-label">de tes rentrées non dépensés</p>
          <p className={`verdict ${status}`}>{verdict}</p>
        </div>
      </div>

      {summary.income > 0 && (
        <div className="split">
          <p className="split-title">Où vont tes rentrées</p>
          <div className="bar" role="img" aria-label="Répartition besoins, envies, reste">
            {parts.map(([label, v, color]) => v > 0 && <i key={label} style={{ width: `${(v / total) * 100}%`, background: color }} title={`${label} ${euro(v)}`} />)}
          </div>
          <ul className="split-legend">
            {parts.map(([label, v, color, target]) => {
              const share = v / inc;
              const off = label === "Reste" ? share < target : share > target;
              return (
                <li key={label}>
                  <i style={{ background: color }} />
                  <span>{label}</span>
                  <b className={`num ${off ? "neg" : ""}`}>{pct(share)}</b>
                  <span className="muted num">{euro(v)}, repère {pct(target)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
