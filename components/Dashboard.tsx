"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { loadBudgets, loadRules, loadTransactions, recategorize, setBudget } from "@/lib/db";
import { importFiles } from "@/lib/import";
import { insights, summarize } from "@/lib/stats";
import { merchantKey, monthLabel } from "@/lib/text";
import type { Budgets, Rules, Transaction } from "@/lib/types";
import SummaryCard, { type Filter } from "./SummaryCard";
import CategoryBreakdown from "./CategoryBreakdown";
import TransactionList from "./TransactionList";
import ImportBar from "./ImportBar";

export default function Dashboard({ session }: { session: Session }) {
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [rules, setRules] = useState<Rules>({});
  const [budgets, setBudgets] = useState<Budgets>({});
  const [month, setMonth] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((msg: string, ms = 3500) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const reload = useCallback(async (goTo?: string) => {
    try {
      const [t, r, b] = await Promise.all([loadTransactions(), loadRules(), loadBudgets()]);
      setTxs(t);
      setRules(r);
      setBudgets(b);
      setError(null);
      const months = [...new Set(t.map((x) => x.date.slice(0, 7)))].sort();
      setMonth((cur) => (goTo && months.includes(goTo) ? goTo : cur && months.includes(cur) ? cur : months[months.length - 1] ?? null));
    } catch (e) {
      setError((e as Error).message);
      setTxs((cur) => cur ?? []);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const months = useMemo(() => [...new Set((txs ?? []).map((t) => t.date.slice(0, 7)))].sort(), [txs]);
  const idx = month ? months.indexOf(month) : -1;
  const monthTxs = useMemo(() => (txs ?? []).filter((t) => month && t.date.startsWith(month)), [txs, month]);
  const summary = useMemo(() => summarize(monthTxs), [monthTxs]);
  const previous = useMemo(() => {
    const p = months[idx - 1];
    return p ? summarize((txs ?? []).filter((t) => t.date.startsWith(p))) : null;
  }, [months, idx, txs]);
  const tips = useMemo(() => insights(monthTxs, summary, previous, budgets), [monthTxs, summary, previous, budgets]);
  const hasRevolut = monthTxs.some((t) => t.source === "Revolut");

  const go = (d: number) => { const m = months[idx + d]; if (m) { setMonth(m); setFilter(null); window.scrollTo(0, 0); } };

  async function onImport(files: File[]) {
    setBusy(true);
    notify("Lecture du relevé…", 60000);
    try {
      const r = await importFiles(files, rules);
      await reload(r.months[r.months.length - 1]);
      setFilter(null);
      if (!r.added && !r.duplicates && r.failed.length) notify("Je n'ai pas réussi à lire ce fichier. Essaie l'export CSV de ta banque.", 5000);
      else {
        const parts = [`${r.added} opération${r.added > 1 ? "s" : ""} ajoutée${r.added > 1 ? "s" : ""}`];
        if (r.duplicates) parts.push(`${r.duplicates} déjà présente${r.duplicates > 1 ? "s" : ""}`);
        if (r.linked) parts.push(`${r.linked} virement${r.linked > 1 ? "s" : ""} entre tes comptes repéré${r.linked > 1 ? "s" : ""}`);
        if (r.failed.length) parts.push(`${r.failed.length} fichier illisible`);
        notify(parts.join(" · "), 5000);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRecategorize(tx: Transaction, category: string) {
    if (!txs) return;
    try {
      const ids = new Set(await recategorize(tx, category, txs));
      setTxs(txs.map((t) => (ids.has(t.id) ? { ...t, category, manual: true } : t)));
      setRules({ ...rules, [merchantKey(tx.raw)]: category });
      notify(ids.size > 1 ? `${ids.size} opérations « ${tx.label} » rangées dans ${category}. Retenu pour la suite.` : `Rangé dans ${category}. Retenu pour la suite.`);
    } catch (e) {
      notify("Modification impossible : " + (e as Error).message);
    }
  }

  async function onBudget(category: string, amount: number | null) {
    const next = { ...budgets };
    if (amount && amount > 0) next[category] = amount; else delete next[category];
    setBudgets(next);
    try { await setBudget(category, amount); notify("Budget enregistré"); }
    catch (e) { notify("Budget non enregistré : " + (e as Error).message); }
  }

  return (
    <main className="wrap">
      <header className="top">
        <h1>Mes dépenses</h1>
        <div className="monthnav">
          <button onClick={() => go(-1)} disabled={idx <= 0} aria-label="Mois précédent">‹</button>
          <span>{month ? monthLabel(month) : "—"}</span>
          <button onClick={() => go(1)} disabled={idx < 0 || idx >= months.length - 1} aria-label="Mois suivant">›</button>
        </div>
      </header>

      {error && <div className="card neg">Connexion à la base impossible : {error}</div>}

      {txs === null ? (
        <div className="empty">Chargement…</div>
      ) : !month ? (
        <div className="card empty">
          <b>Aucune opération pour l&apos;instant</b>
          Importe le relevé PDF de ta banque ou un export CSV (Revolut…). Tout se trie automatiquement.
        </div>
      ) : (
        <>
          <SummaryCard month={month} summary={summary} filter={filter} onFilter={setFilter} hasRevolut={hasRevolut} />
          {tips.length > 0 && (
            <>
              <h2>À retenir</h2>
              <div className="card">
                {tips.map((t, i) => (
                  <div className="insight" key={i}><span>{t.icon}</span><span>{t.text}</span></div>
                ))}
              </div>
            </>
          )}
          <h2>Par catégorie</h2>
          <CategoryBreakdown summary={summary} budgets={budgets} filter={filter} onFilter={setFilter} onBudget={onBudget} />
          <TransactionList txs={monthTxs} filter={filter} onClearFilter={() => setFilter(null)} onRecategorize={onRecategorize} />
        </>
      )}

      <div className="foot">
        {session.user.email} · <button className="link" onClick={() => supabase().auth.signOut()}>Se déconnecter</button>
      </div>

      <ImportBar busy={busy} onFiles={onImport} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
