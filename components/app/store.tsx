"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  applyCategories, deleteAccount, deleteEverything, deleteRule, deleteTransaction, loadAccounts, loadBudgets, loadRules,
  loadSettings, loadTransactions, recategorize, saveAccount, saveSettings, setBudget, setRule, updateTransaction,
} from "@/lib/db";
import { importStatement, readStatement } from "@/lib/import";
import { categorize } from "@/lib/categorize";
import { configure, INTERNAL } from "@/lib/categories";
import { summarize, type Shares } from "@/lib/stats";
import { merchantKey, setShowCents } from "@/lib/text";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import type { Account, Budgets, ParsedStatement, Rules, Transaction } from "@/lib/types";

export type Pending = { fileName: string; statement: ParsedStatement };

function useAppState(session: Session) {
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [rules, setRules] = useState<Rules>({});
  const [budgets, setBudgets] = useState<Budgets>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [month, setMonth] = useState<string | null>(null);
  const [queue, setQueue] = useState<Pending[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // force le recalcul après configure()
  // filtre transmis à l'onglet Opérations (ex. clic sur « rentrées » dans la synthèse)
  const [opsPreset, setOpsPreset] = useState<{ category?: string; kind?: "income" | "savings" | "expense" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((msg: string, ms = 3500) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const applyConfig = useCallback((s: Settings) => {
    configure({
      custom: s.customCategories, colors: s.colors, hidden: s.hidden, needs: s.needs, targets: s.targets,
      ownerNames: s.ownerNames, salaryKeywords: s.salaryKeywords, keywordRules: s.keywordRules,
    });
    setShowCents(s.cents);
    const root = document.documentElement;
    const dark = s.theme === "dark" || (s.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.privacy = s.privacy ? "on" : "off";
    setVersion((v) => v + 1);
  }, []);

  const reload = useCallback(async (goTo?: string) => {
    try {
      const [t, r, b, a, s] = await Promise.all([loadTransactions(), loadRules(), loadBudgets(), loadAccounts(), loadSettings()]);
      applyConfig(s);
      setSettingsState(s);
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
  }, [applyConfig]);

  useEffect(() => { reload(); }, [reload]);

  const months = useMemo(() => [...new Set((txs ?? []).map((t) => t.date.slice(0, 7)))].sort(), [txs]);
  const shares = useMemo<Shares>(() => Object.fromEntries(accounts.map((a) => [a.key, a.kind === "joint" ? a.share : 1])), [accounts]);
  const monthTxs = useMemo(() => (txs ?? []).filter((t) => month && t.date.startsWith(month)), [txs, month]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summarize(monthTxs, shares), [monthTxs, shares, version]);
  const labels = useMemo(() => Object.fromEntries(accounts.map((a) => [a.key, a.label])), [accounts]);

  /* ---------- actions ---------- */
  async function importFiles(files: File[]) {
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

  async function confirmAccount(account: Account) {
    const [current, ...rest] = queue;
    setQueue(rest);
    setBusy(true);
    notify("Enregistrement…", 60000);
    try {
      await saveAccount(account);
      const r = await importStatement(current.statement, account, rules);
      await reload(r.months[r.months.length - 1]);
      const parts = [`${account.label} : ${r.added} opération${r.added > 1 ? "s" : ""} ajoutée${r.added > 1 ? "s" : ""}`];
      if (r.duplicates) parts.push(`${r.duplicates} déjà présente${r.duplicates > 1 ? "s" : ""}`);
      if (r.linked) parts.push(`${r.linked} virement${r.linked > 1 ? "s" : ""} entre tes comptes repéré${r.linked > 1 ? "s" : ""}`);
      notify(parts.join(", "), 5000);
    } catch (e) {
      notify("Import impossible : " + (e as Error).message, 6000);
    } finally {
      setBusy(false);
    }
  }

  const skipPending = () => setQueue((q) => q.slice(1));

  async function saveAccountAction(a: Account) {
    setAccounts((cur) => cur.map((x) => (x.key === a.key ? a : x)));
    try { await saveAccount(a); notify("Compte mis à jour"); } catch (e) { notify("Modification impossible : " + (e as Error).message); }
  }

  async function deleteAccountAction(key: string) {
    try { await deleteAccount(key); await reload(); notify("Compte et opérations supprimés"); }
    catch (e) { notify("Suppression impossible : " + (e as Error).message); }
  }

  async function recategorizeTx(tx: Transaction, category: string) {
    if (!txs) return;
    try {
      const ids = new Set(await recategorize(tx, category, txs));
      setTxs(txs.map((t) => (ids.has(t.id) ? { ...t, category, manual: true } : t)));
      setRules({ ...rules, [merchantKey(tx.raw)]: category });
      notify(ids.size > 1 ? `${ids.size} opérations « ${tx.label} » rangées dans ${category}. Retenu pour la suite.` : `Rangé dans ${category}. Retenu pour la suite.`);
    } catch (e) { notify("Modification impossible : " + (e as Error).message); }
  }

  async function renameTx(tx: Transaction, label: string) {
    if (!txs || !label.trim()) return;
    setTxs(txs.map((t) => (t.id === tx.id ? { ...t, label: label.trim() } : t)));
    try { await updateTransaction(tx.id, { label: label.trim() }); notify("Libellé modifié"); } catch (e) { notify("Modification impossible : " + (e as Error).message); }
  }

  async function deleteTx(tx: Transaction) {
    if (!txs) return;
    setTxs(txs.filter((t) => t.id !== tx.id));
    try { await deleteTransaction(tx.id); notify("Opération supprimée"); } catch (e) { notify("Suppression impossible : " + (e as Error).message); }
  }

  async function setBudgetAction(category: string, amount: number | null) {
    const next = { ...budgets };
    if (amount && amount > 0) next[category] = amount; else delete next[category];
    setBudgets(next);
    try { await setBudget(category, amount); } catch (e) { notify("Budget non enregistré : " + (e as Error).message); }
  }

  async function applyBudgets(b: Budgets) {
    setBudgets({ ...budgets, ...b });
    try {
      for (const [c, v] of Object.entries(b)) await setBudget(c, v);
      notify(Object.keys(b).length > 1 ? `${Object.keys(b).length} budgets enregistrés` : "Budget enregistré");
    } catch (e) { notify("Budgets non enregistrés : " + (e as Error).message); }
  }

  async function updateSettings(patch: Partial<Settings>, message = "Réglage enregistré") {
    const next = { ...settings, ...patch };
    setSettingsState(next);
    applyConfig(next);
    try { await saveSettings(next); if (message) notify(message); } catch (e) { notify("Réglage non enregistré : " + (e as Error).message); }
  }

  async function removeRule(key: string) {
    const next = { ...rules };
    delete next[key];
    setRules(next);
    try { await deleteRule(key); notify("Règle supprimée"); } catch (e) { notify("Suppression impossible : " + (e as Error).message); }
  }

  async function changeRule(key: string, category: string) {
    setRules({ ...rules, [key]: category });
    try { await setRule(key, category); notify("Règle modifiée"); } catch (e) { notify("Modification impossible : " + (e as Error).message); }
  }

  /** Re-trie les opérations non corrigées à la main avec les règles actuelles (réglages compris). */
  async function resortAll() {
    if (!txs) return;
    const kinds = Object.fromEntries(accounts.map((a) => [a.key, a.kind]));
    const changes: { id: string; category: string }[] = [];
    for (const t of txs) {
      if (t.manual) continue;
      if (kinds[t.account] === "epargne" && (t.category === INTERNAL || t.category === "Autres revenus")) continue;
      if (t.category === INTERNAL && kinds[t.account] === "joint") continue;
      const c = categorize(t.raw, t.amount, "", rules);
      if (c !== t.category) changes.push({ id: t.id, category: c });
    }
    if (!changes.length) { notify("Tout est déjà bien trié"); return; }
    setBusy(true);
    try { await applyCategories(changes); await reload(); notify(`${changes.length} opération${changes.length > 1 ? "s" : ""} re-triée${changes.length > 1 ? "s" : ""}`); }
    catch (e) { notify("Re-tri impossible : " + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function wipeAll() {
    try { await deleteEverything(); await reload(); notify("Toutes tes données ont été supprimées"); }
    catch (e) { notify("Suppression impossible : " + (e as Error).message); }
  }

  return {
    session, txs, rules, budgets, accounts, settings, month, setMonth, months, monthTxs, summary, shares, labels,
    queue, toast, busy, error, version, notify, reload, opsPreset, setOpsPreset,
    importFiles, confirmAccount, skipPending, saveAccount: saveAccountAction, deleteAccount: deleteAccountAction,
    recategorizeTx, renameTx, deleteTx, setBudget: setBudgetAction, applyBudgets, updateSettings, removeRule, changeRule,
    resortAll, wipeAll,
  };
}

export type AppState = ReturnType<typeof useAppState>;
const Ctx = createContext<AppState | null>(null);
/** Exposé pour les aperçus d'interface. */
export const AppContext = Ctx;

export function AppProvider({ session, children }: { session: Session; children: React.ReactNode }) {
  const state = useAppState(session);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useApp hors de AppProvider");
  return s;
}
