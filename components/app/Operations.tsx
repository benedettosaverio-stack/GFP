"use client";
import { useEffect, useMemo, useState } from "react";
import { allCategories, colorOf, INTERNAL, isExpense, isIncome, SAVINGS, tint } from "@/lib/categories";
import { myAmount } from "@/lib/stats";
import { eur, norm } from "@/lib/text";
import type { Transaction } from "@/lib/types";
import { useApp } from "./store";

type Kind = "all" | "expense" | "income" | "savings" | "internal";
const KINDS: [Kind, string][] = [["all", "Tout"], ["expense", "Dépenses"], ["income", "Rentrées"], ["savings", "Épargne"], ["internal", "Entre mes comptes"]];

const dayLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/** Opérations : recherche, filtres, édition (catégorie, libellé, suppression). */
export default function Operations() {
  const app = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [cat, setCat] = useState("");
  const [account, setAccount] = useState("");
  const [allMonths, setAllMonths] = useState(false);
  const [open, setOpen] = useState<Transaction | null>(null);

  // filtre reçu depuis la synthèse
  const { opsPreset, setOpsPreset } = app;
  useEffect(() => {
    if (!opsPreset) return;
    if (opsPreset.category) { setCat(opsPreset.category); setKind("all"); }
    if (opsPreset.kind) { setKind(opsPreset.kind); setCat(""); }
    if (opsPreset.account) { setAccount(opsPreset.account); setKind("all"); setCat(""); }
    setOpsPreset(null);
  }, [opsPreset, setOpsPreset]);

  const source = allMonths ? app.txs ?? [] : app.monthTxs;
  const list = useMemo(() => {
    const nq = norm(q);
    return [...source]
      .filter((t) => {
        if (kind === "expense" && !isExpense(t.category)) return false;
        if (kind === "income" && !isIncome(t.category)) return false;
        if (kind === "savings" && t.category !== SAVINGS) return false;
        if (kind === "internal" && t.category !== INTERNAL) return false;
        if (kind === "all" && !cat && t.category === INTERNAL) return false;
        if (cat && t.category !== cat) return false;
        if (account && t.account !== account) return false;
        if (nq && !norm(t.label + " " + t.raw).includes(nq) && !String(Math.abs(t.amount)).includes(q.replace(",", "."))) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.amount - b.amount);
  }, [source, q, kind, cat, account]);

  const total = list.reduce((s, t) => s + myAmount(t, app.shares), 0);
  const days: [string, Transaction[]][] = [];
  for (const t of list) {
    const last = days[days.length - 1];
    if (last && last[0] === t.date) last[1].push(t); else days.push([t.date, [t]]);
  }
  const filtered = q || kind !== "all" || cat || account;

  return (
    <div className="ops">
      <div className="filters">
        <input className="search" type="search" placeholder="Rechercher un libellé ou un montant" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="segmented" role="tablist">
          {KINDS.map(([k, l]) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}
        </div>
        <div className="filter-row">
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Catégorie">
            <option value="">Toutes les catégories</option>
            {allCategories().map((c) => <option key={c}>{c}</option>)}
          </select>
          {app.accounts.length > 1 && (
            <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Compte">
              <option value="">Tous les comptes</option>
              {app.accounts.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          )}
          <label className="check"><input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} /> Tous les mois</label>
          {filtered && <button className="link" onClick={() => { setQ(""); setKind("all"); setCat(""); setAccount(""); }}>Effacer les filtres</button>}
        </div>
        <p className="muted small num">{list.length} opération{list.length > 1 ? "s" : ""}, total {eur(total)}</p>
      </div>

      {days.map(([date, items]) => (
        <div className="day" key={date}>
          <h3>{dayLabel(date)}{allMonths && ` ${date.slice(0, 4)}`}</h3>
          {items.map((t) => {
            const part = app.shares[t.account] ?? 1;
            const shared = part === 0; // compte joint en mode « Vie commune » : hors de ton budget perso
            const dim = t.category === INTERNAL || t.category === SAVINGS || shared;
            return (
              <button key={t.id} className={`tx row ${dim ? "dim" : ""}`} onClick={() => setOpen(t)}>
                <div className="l">
                  <div className="t">{t.label}</div>
                  <div className="meta">
                    <span className="chip" style={{ background: tint(t.category) }}><span className="dot" style={{ background: colorOf(t.category) }} />{t.category}</span>
                    {app.accounts.length > 1 && <span>{app.labels[t.account] ?? t.account}</span>}
                    {part < 1 && !dim && <span>ta part sur {eur(Math.abs(t.amount))}</span>}
                    {shared && <span>compte commun</span>}
                  </div>
                </div>
                <div className={`a num ${t.amount > 0 && !dim ? "pos" : ""}`}>
                  {shared ? (t.amount > 0 ? "+" : "") + eur(t.amount) : dim ? eur(Math.abs(t.amount)) : (t.amount > 0 ? "+" : "") + eur(myAmount(t, app.shares))}
                </div>
              </button>
            );
          })}
        </div>
      ))}
      {!list.length && <p className="muted">Aucune opération ne correspond.</p>}

      {open && <TxSheet tx={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Fiche d'une opération : catégorie, libellé, suppression. */
function TxSheet({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const app = useApp();
  const [label, setLabel] = useState(tx.label);
  const [confirm, setConfirm] = useState(false);
  const current = app.txs?.find((t) => t.id === tx.id) ?? tx;
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{current.label}</h3>
        <p className="sub num">
          {new Date(current.date + "T12:00:00").toLocaleDateString("fr-FR", { dateStyle: "full" })}, {eur(current.amount)}, {app.labels[current.account] ?? current.account}
        </p>
        <p className="sub">Libellé de la banque : {current.raw}</p>

        <label className="field">Catégorie
          <select value={current.category} onChange={(e) => app.recategorizeTx(current, e.target.value)}>
            {allCategories(true).concat(allCategories(true).includes(current.category) ? [] : [current.category]).map((c) => <option key={c}>{c}</option>)}
          </select>
          <small>Le même marchand sera rangé pareil, maintenant et aux prochains imports.</small>
        </label>

        <label className="field">Libellé affiché
          <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== current.label && app.renameTx(current, label)} />
        </label>

        <div className="actions spread">
          {confirm
            ? <button className="danger" onClick={() => { app.deleteTx(current); onClose(); }}>Confirmer la suppression</button>
            : <button className="ghost" onClick={() => setConfirm(true)}>Supprimer l&apos;opération</button>}
          <button className="primary" onClick={() => { if (label !== current.label) app.renameTx(current, label); onClose(); }}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
