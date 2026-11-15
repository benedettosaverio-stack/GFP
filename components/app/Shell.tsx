"use client";
import { useEffect, useRef, useState } from "react";
import { monthLabel } from "@/lib/text";
import { Mark } from "../Logo";
import AccountPicker from "../AccountPicker";
import { useApp } from "./store";
import Overview from "./Overview";
import Operations from "./Operations";
import BudgetsTab from "./BudgetsTab";
import Analysis from "./Analysis";
import SettingsTab from "./SettingsTab";
import VieCommune from "./VieCommune";
import Assistant from "./Assistant";

export type Tab = "synthese" | "operations" | "budgets" | "commune" | "analyse" | "reglages";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "synthese", label: "Synthèse", icon: <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" /> },
  { id: "operations", label: "Opérations", icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
  { id: "budgets", label: "Budgets", icon: <><circle cx="12" cy="12" r="8" /><path d="M12 4v8l5.5 5.5" /></> },
  { id: "commune", label: "Vie commune", icon: <><circle cx="9" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.3c.6-.2 1.3-.3 2-.3 2.3 0 4 1.5 4.5 4" /></> },
  { id: "analyse", label: "Analyse", icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { id: "reglages", label: "Réglages", icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></> },
];

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const isTab = (h: string): h is Tab => TABS.some((t) => t.id === h);

export default function Shell() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>("synthese");

  // onglet dans l'URL (#operations…) : bouton retour, favoris, rechargement
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      setTab(isTab(h) ? h : app.settings.startTab);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [app.settings.startTab]);

  const go = (t: Tab) => {
    if (window.location.hash.slice(1) !== t) window.location.hash = t;
    setTab(t);
    window.scrollTo(0, 0);
  };

  const idx = app.month ? app.months.indexOf(app.month) : -1;
  const showMonth = tab !== "reglages" && app.months.length > 0;
  const title = TABS.find((t) => t.id === tab)!.label;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Mark size={22} /><span>GFP</span></div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              <Icon>{t.icon}</Icon>{t.label}
            </button>
          ))}
        </nav>
        <button className="ask" onClick={() => app.setAssistantOpen(true)}><Icon><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3ZM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" /></Icon>Demander à l&apos;IA</button>
        <ImportButton />
        <p className="who">{app.session.user.email}</p>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="only-mobile"><Mark size={20} /></span>
            <h1>{title}</h1>
          </div>
          {showMonth && (
            <div className="monthpick">
              <button onClick={() => app.setMonth(app.months[idx - 1])} disabled={idx <= 0} aria-label="Mois précédent">‹</button>
              <select value={app.month ?? ""} onChange={(e) => app.setMonth(e.target.value)} aria-label="Mois">
                {[...app.months].reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <button onClick={() => app.setMonth(app.months[idx + 1])} disabled={idx < 0 || idx >= app.months.length - 1} aria-label="Mois suivant">›</button>
            </div>
          )}
          <span className="only-mobile"><ImportButton compact /></span>
        </header>

        {app.error && <p className="error">Impossible de joindre la base : {app.error}</p>}

        <div className="page">
          {app.txs === null ? (
            <p className="loading">Chargement…</p>
          ) : tab === "reglages" ? (
            <SettingsTab />
          ) : !app.month ? (
            <div className="empty">
              <b>Importe ton premier relevé</b>
              Le PDF de ta banque ou un export CSV (Revolut…). Tes dépenses se rangent toutes seules par catégorie.
            </div>
          ) : tab === "synthese" ? (
            <Overview go={go} />
          ) : tab === "operations" ? (
            <Operations />
          ) : tab === "budgets" ? (
            <BudgetsTab />
          ) : tab === "commune" ? (
            <VieCommune go={go} />
          ) : (
            <Analysis />
          )}
        </div>
      </div>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined}>
            <Icon>{t.icon}</Icon><span>{t.label}</span>
          </button>
        ))}
      </nav>

      {app.queue[0] && (
        <AccountPicker
          key={app.queue[0].fileName + app.queue.length}
          fileName={app.queue[0].fileName}
          statement={app.queue[0].statement}
          accounts={app.accounts}
          onConfirm={app.confirmAccount}
          onCancel={app.skipPending}
        />
      )}
      <button className="ask-fab only-mobile" onClick={() => app.setAssistantOpen(true)} aria-label="Demander à l'IA"><Icon><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3ZM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" /></Icon></button>
      <Assistant />
      <DropZone />
      {app.toast && <div className="toast" role="status">{app.toast}</div>}
    </div>
  );
}

function ImportButton({ compact = false }: { compact?: boolean }) {
  const app = useApp();
  const busy = app.busy || app.queue.length > 0;
  return (
    <label className={`import ${compact ? "compact" : ""}`} aria-busy={busy}>
      {compact ? <Icon><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></Icon> : busy ? "Import en cours…" : "Importer un relevé"}
      {compact && <span className="sr">Importer un relevé</span>}
      <input
        type="file" multiple accept=".pdf,.csv,.txt,application/pdf,text/csv" disabled={busy}
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) app.importFiles(f); }}
      />
    </label>
  );
}

function DropZone() {
  const app = useApp();
  const [on, setOn] = useState(false);
  const importRef = useRef(app.importFiles);
  importRef.current = app.importFiles;
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); depth++; setOn(true); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setOn(false); };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => { e.preventDefault(); depth = 0; setOn(false); const f = [...(e.dataTransfer?.files ?? [])]; if (f.length) importRef.current(f); };
    window.addEventListener("dragenter", enter); window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragleave", leave); window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  }, []);
  return on ? <div className="drop">Dépose ton relevé ici</div> : null;
}
