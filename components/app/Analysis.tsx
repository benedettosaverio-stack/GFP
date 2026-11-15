"use client";
import { useMemo, useState } from "react";
import { cumulative, monthlySeries } from "@/lib/analysis";
import { colorOf, expenseCategories, isExpense } from "@/lib/categories";
import { myAmount, summarize } from "@/lib/stats";
import { merchantKey, shiftMonth } from "@/lib/text";
import { useApp } from "./store";
import Indicators from "../Indicators";
import { PaceChart, TrendChart } from "../Charts";

const int = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const short = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""); };

/** Analyse : évolution sur 6 ou 12 mois, rythme, catégories mois par mois, marchands, dépenses récurrentes. */
export default function Analysis() {
  const app = useApp();
  const { txs, month, shares, months, summary, version } = app;
  const [span, setSpan] = useState(6);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const series = useMemo(() => monthlySeries(txs!, month!, shares, span), [txs, month, shares, span, version]);
  const idx = months.indexOf(month!);
  const now = new Date();
  const isCurrent = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // catégories × 6 derniers mois
  const heat = useMemo(() => {
    const ms = [5, 4, 3, 2, 1, 0].map((d) => shiftMonth(month!, -d)).filter((m) => months.includes(m));
    const per = Object.fromEntries(ms.map((m) => [m, summarize(txs!.filter((t) => t.date.startsWith(m)), shares).byCategory]));
    const rows = expenseCategories()
      .map((c) => ({ c, vals: ms.map((m) => per[m][c] ?? 0) }))
      .filter((r) => r.vals.some((v) => v > 0.5))
      .sort((a, b) => b.vals.reduce((x, y) => x + y, 0) - a.vals.reduce((x, y) => x + y, 0));
    const max = Math.max(1, ...rows.flatMap((r) => r.vals));
    return { ms, rows, max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, month, months, shares, version]);

  // marchands du mois
  const merchants = useMemo(() => {
    const g: Record<string, { label: string; n: number; sum: number; cat: string }> = {};
    for (const t of app.monthTxs) {
      if (!isExpense(t.category) || t.amount >= 0) continue;
      const k = merchantKey(t.raw);
      g[k] ??= { label: t.label, n: 0, sum: 0, cat: t.category };
      g[k].n++; g[k].sum -= myAmount(t, shares);
    }
    return Object.values(g).sort((a, b) => b.sum - a.sum).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.monthTxs, shares, version]);

  // dépenses récurrentes : même marchand sur au moins 2 des 3 derniers mois
  const recurring = useMemo(() => {
    const ms = [0, 1, 2].map((d) => shiftMonth(month!, -d)).filter((m) => months.includes(m));
    const g: Record<string, { label: string; months: Set<string>; sum: number; cat: string }> = {};
    for (const t of txs!) {
      const m = t.date.slice(0, 7);
      if (!ms.includes(m) || !isExpense(t.category) || t.amount >= 0) continue;
      const k = merchantKey(t.raw);
      g[k] ??= { label: t.label, months: new Set(), sum: 0, cat: t.category };
      g[k].months.add(m); g[k].sum -= myAmount(t, shares);
    }
    const need = Math.min(2, ms.length);
    return Object.values(g)
      .filter((x) => x.months.size >= need && (ms.length > 1 || x.cat === "Abonnements & téléphone"))
      .map((x) => ({ ...x, monthly: x.sum / x.months.size }))
      .sort((a, b) => b.monthly - a.monthly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, month, months, shares, version]);
  const recurringTotal = recurring.reduce((s, r) => s + r.monthly, 0);

  return (
    <div className="cols">
      <div>
        <section className="section first">
          <div className="section-title">
            <h2>Évolution</h2>
            <div className="segmented small">
              {[6, 12].map((n) => <button key={n} className={span === n ? "on" : ""} onClick={() => setSpan(n)}>{n} mois</button>)}
            </div>
          </div>
          <TrendChart data={series} current={month!} onPick={app.setMonth} />
        </section>

        <section className="section">
          <div className="section-title"><h2>Rythme de dépense</h2></div>
          <PaceChart
            month={month!}
            current={cumulative(txs!, month!, shares)}
            previous={idx > 0 ? cumulative(txs!, months[idx - 1], shares) : null}
            today={isCurrent ? now.getDate() : null}
          />
        </section>

        <section className="section">
          <div className="section-title"><h2>Catégories mois par mois</h2></div>
          <div className="heat" style={{ gridTemplateColumns: `minmax(120px, 1.4fr) repeat(${heat.ms.length}, minmax(52px, 1fr))` }}>
            <span />
            {heat.ms.map((m) => <span key={m} className={`hm ${m === month ? "strong" : ""}`}>{short(m)}</span>)}
            {heat.rows.map((r) => (
              <Row key={r.c} c={r.c} vals={r.vals} max={heat.max} />
            ))}
          </div>
          {heat.ms.length < 2 && <p className="foot">Importe d&apos;autres mois pour comparer.</p>}
        </section>
      </div>

      <div>
        <Indicators summary={summary} />

        <section className="section">
          <div className="section-title"><h2>Dépenses récurrentes</h2><span className="muted small num">{int(recurringTotal)} par mois</span></div>
          <ul className="plainlist">
            {recurring.slice(0, 10).map((r) => (
              <li key={r.label}>
                <span className="name"><span className="dot" style={{ background: colorOf(r.cat) }} />{r.label}</span>
                <span className="num">{int(r.monthly)}<small className="muted"> /mois</small></span>
              </li>
            ))}
            {!recurring.length && <li className="muted">Rien de récurrent détecté pour l&apos;instant.</li>}
          </ul>
          {recurring.length > 0 && <p className="foot">Soit environ {int(recurringTotal * 12)} par an.</p>}
        </section>

        <section className="section">
          <div className="section-title"><h2>Où tu dépenses le plus</h2></div>
          <ul className="plainlist">
            {merchants.map((m) => (
              <li key={m.label}>
                <span className="name"><span className="dot" style={{ background: colorOf(m.cat) }} />{m.label}<small className="muted"> {m.n > 1 ? `${m.n} fois` : ""}</small></span>
                <span className="num">{int(m.sum)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Row({ c, vals, max }: { c: string; vals: number[]; max: number }) {
  return (
    <>
      <span className="hc"><span className="dot" style={{ background: colorOf(c) }} />{c}</span>
      {vals.map((v, i) => (
        <span key={i} className="hv num" title={`${c} : ${int(v)}`} style={{ background: v > 0.5 ? `color-mix(in srgb, #2a78d6 ${Math.round(8 + (v / max) * 62)}%, var(--paper))` : "transparent", color: v / max > 0.55 ? "#fff" : undefined }}>
          {v > 0.5 ? Math.round(v) : "·"}
        </span>
      ))}
    </>
  );
}
