"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  applyCategories, deleteAccount, deleteEverything, deleteRule, deleteTransaction, loadAccounts, loadBudgets, loadRules,
  loadSettings, loadTransactions, recategorize, saveAccount, saveSettings, setBudget, setRule, updateTransaction,
} from "@/lib/db";
import { importStatement, readStatement } from "@/lib/import";
import { categorize } from "@/lib/categorize";
import { configure, HOUSEHOLD_INCOME, INTERNAL } from "@/lib/categories";
import { summarize, type Shares } from "@/lib/stats";
import { household, jointLinks, shiftSalary, withVieCommune } from "@/lib/household";
import { aiStatus, buildContext } from "@/lib/ai";
import { merchantKey, setShowCents } from "@/lib/text";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import type { Account, Budgets, ParsedStatement, Rules, Transaction } from "@/lib/types";

export type Pending = { fileName: string; statement: ParsedStatement };

function useAppState(session: Session) {
  const [rawTxs, setTxs] = useState<Transaction[] | null>(null);
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
  const [opsPreset, setOpsPreset] = useState<{ category?: string; kind?: "income" | "savings" | "expense"; account?: string } | null>(null);
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


  const jointKeys = useMemo(() => new Set(accounts.filter((a) => a.kind === "joint").map((a) => a.key)), [accounts]);
  const commune = settings.jointMode === "commune";
  // Mode « Vie commune » : le compte joint sort de ton budget perso, tes virements vers lui deviennent une dépense.
  const shares = useMemo<Shares>(
    () => Object.fromEntries(accounts.map((a) => [a.key, a.kind === "joint" ? (commune ? 0 : a.share) : 1])),
    [accounts, commune],
  );
  const links = useMemo(() => jointLinks(rawTxs ?? [], jointKeys), [rawTxs, jointKeys]);
  const shiftDay = settings.salaryShiftDay;
  const txs = useMemo(() => {
    if (!rawTxs) return rawTxs;
    const t = commune ? withVieCommune(rawTxs, links.mine) : rawTxs;
    return shiftDay > 0 ? shiftSalary(t, shiftDay) : t;
  }, [rawTxs, commune, links, shiftDay]);
  const months = useMemo(() => [...new Set((txs ?? []).map((t) => t.date.slice(0, 7)))].sort(), [txs]);
  const monthTxs = useMemo(() => (txs ?? []).filter((t) => month && t.date.startsWith(month)), [txs, month]);
  // IA : disponible si la clé est configurée côté serveur
  const [aiEnabled, setAiEnabled] = useState(false);
  useEffect(() => { aiStatus().then(setAiEnabled); }, []);
  const aiContext = useCallback(
    () => buildContext({ txs: txs ?? [], months, month: month ?? months[months.length - 1] ?? "", shares, accounts, budgets, settings }),
    [txs, months, month, shares, accounts, budgets, settings],
  );
  const [assistantOpen, setAssistantOpen] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const home = useMemo(() => household(monthTxs, jointKeys, links.fromMe), [monthTxs, jointKeys, links, version]);
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
    if (!rawTxs) return;
    try {
      const ids = new Set(await recategorize(tx, category, rawTxs));
      setTxs(rawTxs.map((t) => (ids.has(t.id) ? { ...t, category, manual: true } : t)));
      setRules({ ...rules, [merchantKey(tx.raw)]: category });
      notify(ids.size > 1 ? `${ids.size} opérations « ${tx.label} » rangées dans ${category}. Retenu pour la suite.` : `Rangé dans ${category}. Retenu pour la suite.`);
    } catch (e) { notify("Modification impossible : " + (e as Error).message); }
  }

  async function renameTx(tx: Transaction, label: string) {
    if (!rawTxs || !label.trim()) return;
    setTxs(rawTxs.map((t) => (t.id === tx.id ? { ...t, label: label.trim() } : t)));
    try { await updateTransaction(tx.id, { label: label.trim() }); notify("Libellé modifié"); } catch (e) { notify("Modification impossible : " + (e as Error).message); }
  }

  async function deleteTx(tx: Transaction) {
    if (!rawTxs) return;
    setTxs(rawTxs.filter((t) => t.id !== tx.id));
    try { await deleteTransaction(tx.id); notify("Opération supprimée"); } catch (e) { notify("Suppression impossible : " + (e as Error).message); }
  }

  /** Applique les catégories proposées par l'IA (une règle par marchand, retenue pour la suite). */
  async function applySuggestions(choices: { tx: Transaction; category: string }[]) {
    if (!rawTxs || !choices.length) return;
    setBusy(true);
    let list = rawTxs;
    const learned: Rules = {};
    const done = new Set<string>();
    let moved = 0;
    try {
      for (const { tx, category } of choices) {
        const key = merchantKey(tx.raw);
        if (done.has(key + "|" + (tx.amount > 0))) continue;
        done.add(key + "|" + (tx.amount > 0));
        const ids = new Set(await recategorize(tx, category, list));
        list = list.map((t) => (ids.has(t.id) ? { ...t, category, manual: true } : t));
        learned[key] = category;
        moved += ids.size;
      }
      notify(`${moved} opération${moved > 1 ? "s" : ""} rangée${moved > 1 ? "s" : ""}. Retenu pour la suite.`);
    } catch (e) {
      notify("Tri interrompu : " + (e as Error).message);
    } finally {
      setTxs(list);
      setRules((r) => ({ ...r, ...learned }));
      setBusy(false);
    }
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
    if (!rawTxs) return;
    const kinds = Object.fromEntries(accounts.map((a) => [a.key, a.kind]));
    const changes: { id: string; category: string }[] = [];
    for (const t of rawTxs) {
      if (t.manual) continue;
      if (kinds[t.account] === "epargne" && (t.category === INTERNAL || t.category === "Autres revenus")) continue;
      if (kinds[t.account] === "joint" && t.category === INTERNAL) {
        // un apport reste un apport, sauf les aides du foyer (CAF…) et remboursements reçus sur le joint
        const c = categorize(t.raw, t.amount, "", rules);
        if (t.amount > 0 && HOUSEHOLD_INCOME.includes(c)) changes.push({ id: t.id, category: c });
        continue;
      }
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
    session, txs, rules, budgets, accounts, settings, month, setMonth, months, monthTxs, summary, shares, labels, jointKeys, home, aiEnabled, aiContext, assistantOpen, setAssistantOpen,
    queue, toast, busy, error, version, notify, reload, opsPreset, setOpsPreset,
    importFiles, confirmAccount, skipPending, saveAccount: saveAccountAction, deleteAccount: deleteAccountAction,
    recategorizeTx, applySuggestions, renameTx, deleteTx, setBudget: setBudgetAction, applyBudgets, updateSettings, removeRule, changeRule,
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
