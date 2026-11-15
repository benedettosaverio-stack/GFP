"use client";
import { useEffect, useState } from "react";
import { aiReview } from "@/lib/ai";
import { monthLabel } from "@/lib/text";
import { useApp } from "./store";
import Rich from "./Rich";

/** Bilan du mois écrit par l'IA, gardé dans le navigateur tant que les opérations du mois ne changent pas. */
export default function Review() {
  const app = useApp();
  const month = app.month!;
  const stamp = `${app.monthTxs.length}:${Math.round(app.monthTxs.reduce((s, t) => s + t.amount, 0))}`;
  const key = `gfp-review-${month}`;
  const [text, setText] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as { stamp: string; text: string } | null;
      setText(saved?.text ?? null);
      setStale(Boolean(saved && saved.stamp !== stamp));
    } catch { setText(null); setStale(false); }
  }, [key, stamp]);

  if (!app.aiEnabled) return null;

  async function run() {
    setBusy(true); setErr(null);
    try {
      const answer = await aiReview(app.aiContext(), month);
      setText(answer); setStale(false);
      try { localStorage.setItem(key, JSON.stringify({ stamp, text: answer })); } catch { /* stockage indisponible */ }
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className="section review">
      <div className="section-title">
        <h2>Bilan de {monthLabel(month)}</h2>
        {text && <button className="link" onClick={run} disabled={busy}>{busy ? "Rédaction…" : stale ? "Mettre à jour" : "Refaire"}</button>}
      </div>
      {text ? (
        <>
          <Rich text={text} />
          {stale && <p className="foot">De nouvelles opérations sont arrivées depuis ce bilan.</p>}
        </>
      ) : (
        <>
          <p className="muted small">L&apos;IA lit tes opérations et résume ce qui a changé, ce qui va bien et ce qui mérite ton attention.</p>
          <button className="pill" onClick={run} disabled={busy}>{busy ? "Rédaction du bilan…" : "Écrire le bilan du mois"}</button>
        </>
      )}
      {err && <p className="error small">{err}</p>}
    </section>
  );
}
