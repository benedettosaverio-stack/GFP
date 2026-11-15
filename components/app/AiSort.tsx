"use client";
import { useMemo, useState } from "react";
import { aiCategorize } from "@/lib/ai";
import { allCategories, colorOf, expenseCategories, incomeCategories } from "@/lib/categories";
import { eur } from "@/lib/text";
import type { Transaction } from "@/lib/types";
import { useApp } from "./store";

const FALLBACK = ["Divers", "Autres revenus"];

/** Tri par l'IA des opérations que les règles n'ont pas su ranger (Divers, Autres revenus). */
export default function AiSort() {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<{ tx: Transaction; category: string; on: boolean }[] | null>(null);

  const todo = useMemo(() => (app.txs ?? []).filter((t) => !t.manual && FALLBACK.includes(t.category)), [app.txs]);
  if (!app.aiEnabled || (!todo.length && !rows)) return null;

  async function run() {
    setBusy(true); setErr(null);
    try {
      const cats = [...expenseCategories(), ...incomeCategories()];
      const got = await aiCategorize(todo.slice(0, 120), cats);
      const found = todo
        .filter((t) => got[t.id] && got[t.id] !== t.category)
        .map((t) => ({ tx: t, category: got[t.id], on: true }));
      if (!found.length) { app.notify("L'IA n'a rien trouvé de mieux que le classement actuel"); return; }
      setRows(found);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.on).map(({ tx, category }) => ({ tx, category }));
    setRows(null);
    await app.applySuggestions(chosen);
  }

  return (
    <>
      <div className="ai-sort">
        <p><b className="num">{todo.length}</b> opération{todo.length > 1 ? "s" : ""} en « Divers » ou « Autres revenus ».</p>
        <button className="pill" onClick={run} disabled={busy || app.busy}>{busy ? "L'IA réfléchit…" : "Trier avec l'IA"}</button>
        {err && <p className="error small">{err}</p>}
      </div>

      {rows && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setRows(null)}>
          <div className="sheet" role="dialog" aria-label="Propositions de l'IA">
            <h3>Propositions de l&apos;IA</h3>
            <p className="sub">Décoche ce qui ne va pas ou change la catégorie. GFP retiendra ton choix pour chaque marchand.</p>
            <div className="sugg">
              {rows.map((r, i) => (
                <label key={r.tx.id}>
                  <input type="checkbox" checked={r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                  <span className="t">{r.tx.label} <span className="muted num">{eur(r.tx.amount)}</span></span>
                  <select value={r.category} style={{ borderLeft: `4px solid ${colorOf(r.category)}` }}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, category: e.target.value, on: true } : x)))}>
                    {allCategories(true).map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="actions">
              <button className="ghost" onClick={() => setRows(null)}>Annuler</button>
              <button className="primary" onClick={apply} disabled={!rows.some((r) => r.on)}>Ranger {rows.filter((r) => r.on).length} opération{rows.filter((r) => r.on).length > 1 ? "s" : ""}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
