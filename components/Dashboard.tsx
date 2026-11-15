"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { deleteAccount, loadAccounts, loadBudgets, loadRules, loadTransactions, recategorize, saveAccount, setBudget } from "@/lib/db";
import { importStatement, readStatement } from "@/lib/import";
import { insights, summarize, type Shares } from "@/lib/stats";
import { merchantKey, monthLabel } from "@/lib/text";
import type { Account, Budgets, ParsedStatement, Rules, Transaction } from "@/lib/types";
import SummaryCard, { type Filter } from "./SummaryCard";
import CategoryBreakdown from "./CategoryBreakdown";
import TransactionList from "./TransactionList";
import ImportBar from "./ImportBar";
import AccountPicker from "./AccountPicker";
import AccountsCard from "./AccountsCard";

type Pending = { fileName: string; statement: ParsedStatement };

export default function Dashboard({ session }: { session: Session }) {
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [rules, setRules] = useState<Rules>({});
  const [budgets, setBudgets] = useState<Budgets>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [queue, setQueue] = useState<Pending[]>([]);
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
      const [t, r, b, a] = await Promise.all([loadTransactions(), loadRules(), loadBudgets(), loadAccounts()]);
      // comptes présents dans les opérations mais pas encore décrits (anciens imports) : compte courant par défaut
      const known = new Set(a.map((x) => x.key));
      const extra = [...new Set(t.map((x) => x.account))].filter((k) => !known.has(k))
        .map((k): Account => ({ key: k, label: k, kind: "courant", share: 1, detected: null }));
      setAccounts([...a, ...extra]);
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
  const shares = useMemo<Shares>(() => Object.fromEntries(accounts.map((a) => [a.key, a.kind === "joint" ? a.share : 1])), [accounts]);
  const summary = useMemo(() => summarize(monthTxs, shares), [monthTxs, shares]);
  const previous = useMemo(() => {
    const p = months[idx - 1];
    return p ? summarize((txs ?? []).filter((t) => t.date.startsWith(p)), shares) : null;
  }, [months, idx, txs, shares]);
  const tips = useMemo(() => insights(monthTxs, summary, previous, budgets, shares), [monthTxs, summary, previous, budgets, shares]);
  const hasRevolut = monthTxs.some((t) => t.source === "Revolut");
  const counts = useMemo(() => (txs ?? []).reduce<Record<string, number>>((c, t) => ((c[t.account] = (c[t.account] ?? 0) + 1), c), {}), [txs]);
  const labels = useMemo(() => Object.fromEntries(accounts.map((a) => [a.key, a.label])), [accounts]);

  const go = (d: number) => { const m = months[idx + d]; if (m) { setMonth(m); setFilter(null); window.scrollTo(0, 0); } };

  // 1. lire les fichiers  2. demander le compte pour chacun  3. enregistrer
  async function onImport(files: File[]) {
    setBusy(true);
    notify("Lecture du relevé…", 60000);
    const read: Pending[] = [];
    const failed: string[] = [];
    for (const f of files) {
      try {
        const statement = await readStatement(f);
        if (statement.transactions.length) read.push({ fileName: f.name, statement });
        else failed.push(f.name);
      } catch (e) {
        console.error(f.name, e);
        failed.push(f.name);
      }
    }
    setBusy(false);
    if (failed.length) notify(`${failed.length > 1 ? "Fichiers illisibles" : "Fichier illisible"} : ${failed.join(", ")}. Essaie l'export CSV de ta banque.`, 6000);
    else setToast(null);
    setQueue(read);
  }

  async function onAccountChosen(account: Account) {
    const [current, ...rest] = queue;
    setQueue(rest);
    setBusy(true);
    notify("Enregistrement…", 60000);
    try {
      await saveAccount(account);
      const r = await importStatement(current.statement, account, rules);
      await reload(r.months[r.months.length - 1]);
      setFilter(null);
      const parts = [`${account.label} : ${r.added} opération${r.added > 1 ? "s" : ""} ajoutée${r.added > 1 ? "s" : ""}`];
      if (r.duplicates) parts.push(`${r.duplicates} déjà présente${r.duplicates > 1 ? "s" : ""}`);
      if (r.linked) parts.push(`${r.linked} virement${r.linked > 1 ? "s" : ""} entre tes comptes repéré${r.linked > 1 ? "s" : ""}`);
      notify(parts.join(" · "), 5000);
    } catch (e) {
      notify("Import impossible : " + (e as Error).message, 6000);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAccount(a: Account) {
    setAccounts((cur) => cur.map((x) => (x.key === a.key ? a : x)));
    try { await saveAccount(a); notify("Compte mis à jour"); }
    catch (e) { notify("Modification impossible : " + (e as Error).message); }
  }

  async function onDeleteAccount(key: string) {
    try {
      await deleteAccount(key);
      await reload();
      notify("Compte et opérations supprimés");
    } catch (e) {
      notify("Suppression impossible : " + (e as Error).message);
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
        <h1 className="month">{month ? monthLabel(month) : "GFP"}</h1>
        {months.length > 1 && (
          <div className="nav">
            <button onClick={() => go(-1)} disabled={idx <= 0} aria-label="Mois précédent">‹</button>
            <button onClick={() => go(1)} disabled={idx < 0 || idx >= months.length - 1} aria-label="Mois suivant">›</button>
          </div>
        )}
      </header>

      {error && <p className="error">Impossible de joindre la base : {error}</p>}

      {txs === null ? (
        <p className="loading">Chargement…</p>
      ) : !month ? (
        <div className="empty">
          <b>Importe ton premier relevé</b>
          Le PDF de ta banque ou un export CSV (Revolut…). Tes dépenses se rangent toutes seules par catégorie.
        </div>
      ) : (
        <>
          <SummaryCard summary={summary} filter={filter} onFilter={setFilter} hasRevolut={hasRevolut} />
          {tips.length > 0 && (
            <section className="section">
              <div className="section-title"><h2>À retenir</h2></div>
              <ul className="notes">
                {tips.map((t, i) => <li key={i} className={t.icon === "⚠️" ? "alert" : ""}>{t.text}</li>)}
              </ul>
            </section>
          )}
          <section className="section">
            <div className="section-title"><h2>Par catégorie</h2></div>
            <CategoryBreakdown summary={summary} budgets={budgets} filter={filter} onFilter={setFilter} onBudget={onBudget} />
          </section>
          <TransactionList txs={monthTxs} shares={shares} labels={labels} filter={filter} onClearFilter={() => setFilter(null)} onRecategorize={onRecategorize} />
        </>
      )}

      <AccountsCard accounts={accounts} counts={counts} onSave={onSaveAccount} onDelete={onDeleteAccount} />

      <p className="signout">
        Connecté avec {session.user.email}. <button className="link" onClick={() => supabase().auth.signOut()}>Se déconnecter</button>
      </p>

      <ImportBar busy={busy || queue.length > 0} onFiles={onImport} />
      {queue[0] && (
        <AccountPicker
          key={queue[0].fileName + queue.length}
          fileName={queue[0].fileName}
          statement={queue[0].statement}
          accounts={accounts}
          onConfirm={onAccountChosen}
          onCancel={() => setQueue(queue.slice(1))}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
