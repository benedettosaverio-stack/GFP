"use client";
import { useEffect, useRef, useState } from "react";
import { daysIn } from "@/lib/analysis";

// Couleurs validées (contraste et daltonisme) pour les graphiques ; le texte reste en encre.
export const C = { spent: "#2a78d6", income: "#1baf7a", needs: "#2a78d6", wants: "#eb6834", rest: "#1baf7a", prev: "#c9ccd3" };

const k = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k` : Math.round(n).toLocaleString("fr-FR"));
const euro = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const short = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
};
const niceMax = (v: number) => {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1);
};

/** Largeur réelle du graphique : le SVG est dessiné à l'échelle 1, le texte garde sa taille sur mobile comme sur Mac. */
function useWidth(fallback = 560) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="legend">
      {items.map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}
    </div>
  );
}

/** Dépenses et rentrées des derniers mois (colonnes groupées, un seul axe en €). */
export function TrendChart({ data, current, onPick }: {
  data: { month: string; spent: number; income: number }[];
  current: string;
  onPick: (m: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const H = 200, top = 20, bottom = 26, left = 34;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.spent, d.income])));
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const slot = (W - left) / Math.max(data.length, 1);
  const bw = Math.min(22, slot / 3.2);
  const ticks = [0, max / 2, max];
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="chart">
      <Legend items={[["Dépenses", C.spent], ["Rentrées", C.income]]} />
      <div className="plot" ref={ref}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dépenses et rentrées par mois" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={W} y1={y(t)} y2={y(t)} className="grid" />
              <text x={left - 6} y={y(t) + 4} className="tick" textAnchor="end">{k(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = left + slot * i + slot / 2;
            const on = d.month === current;
            return (
              <g key={d.month} className="hit" onMouseEnter={() => setHover(i)} onClick={() => onPick(d.month)} style={{ cursor: "pointer" }}>
                <rect x={cx - slot / 2} y={top} width={slot} height={H - top - bottom} fill="transparent" />
                {[["spent", C.spent, -1], ["income", C.income, 1]].map(([key, color, side]) => {
                  const v = d[key as "spent" | "income"];
                  const x = cx + (side === -1 ? -bw - 1 : 1);
                  const yy = y(v), hh = Math.max(0, y(0) - yy);
                  const r = Math.min(4, hh);
                  return <path key={key as string} d={`M${x},${y(0)} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${y(0)} Z`} fill={color as string} opacity={on || hover === i ? 1 : 0.55} />;
                })}
                <text x={cx} y={H - 8} textAnchor="middle" className={`tick ${on ? "strong" : ""}`}>{short(d.month)}</text>
              </g>
            );
          })}
        </svg>
        {h && (
          <div className="tip" style={{ left: `${((left + slot * hover! + slot / 2) / W) * 100}%` }}>
            <b>{short(h.month)}</b>
            <span><i style={{ background: C.spent }} />Dépenses {euro(h.spent)}</span>
            <span><i style={{ background: C.income }} />Rentrées {euro(h.income)}</span>
          </div>
        )}
      </div>
      {data.length < 2 && <figcaption>Importe les relevés des mois précédents pour voir ton évolution.</figcaption>}
    </figure>
  );
}

/** Dépenses cumulées jour par jour, comparées au mois précédent. */
export function PaceChart({ month, current, previous, today }: { month: string; current: number[]; previous: number[] | null; today: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const H = 190, top = 16, bottom = 24, left = 34, right = 58;
  const days = daysIn(month);
  const cur = today ? current.slice(0, today) : current;
  const max = niceMax(Math.max(1, ...cur, ...(previous ?? [])));
  const x = (i: number) => left + ((W - left - right) * i) / (days - 1);
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = cur.length - 1;

  return (
    <figure className="chart">
      <Legend items={previous ? [["Ce mois-ci", C.spent], ["Mois précédent", C.prev]] : [["Ce mois-ci", C.spent]]} />
      <div className="plot" ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dépenses cumulées sur le mois"
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            setHover(Math.max(0, Math.min(days - 1, Math.round(((px - left) / (W - left - right)) * (days - 1)))));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className="grid" />
              <text x={left - 6} y={y(t) + 4} className="tick" textAnchor="end">{k(t)}</text>
            </g>
          ))}
          {[1, 10, 20, days].map((d) => <text key={d} x={x(d - 1)} y={H - 6} className="tick" textAnchor="middle">{d}</text>)}
          {previous && <path d={path(previous)} fill="none" stroke={C.prev} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          <path d={`${path(cur)} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`} fill={C.spent} opacity={0.08} />
          <path d={path(cur)} fill="none" stroke={C.spent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(last)} cy={y(cur[last])} r={4.5} fill={C.spent} stroke="#fff" strokeWidth={2} />
          <text x={x(last) + 9} y={y(cur[last]) + 4} className="endlabel">{euro(cur[last])}</text>
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={H - bottom} className="cross" />}
        </svg>
        {hover !== null && (
          <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <b>{hover + 1} du mois</b>
            {hover <= last && <span><i style={{ background: C.spent }} />Ce mois-ci {euro(cur[hover])}</span>}
            {previous && <span><i style={{ background: C.prev }} />Mois précédent {euro(previous[Math.min(hover, previous.length - 1)])}</span>}
          </div>
        )}
      </div>
    </figure>
  );
}
