"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { allCategories, colorOf, expenseCategories, incomeCategories, INTERNAL, PALETTE, SAVINGS, isNeed } from "@/lib/categories";
import type { AccountKind } from "@/lib/types";
import { KIND_LABELS } from "../AccountPicker";
import { useApp } from "./store";

type Section = "comptes" | "categories" | "tri" | "reperes" | "profil" | "ia" | "affichage" | "donnees";
const SECTIONS: [Section, string, string][] = [
  ["comptes", "Comptes", "Type, part du compte joint, suppression"],
  ["categories", "Catégories", "Couleurs, besoins ou envies, catégories perso"],
  ["tri", "Règles de tri", "Mots-clés et marchands mémorisés"],
  ["reperes", "Objectifs", "Épargne, besoins, envies"],
  ["profil", "Profil bancaire", "Ton nom, ton employeur"],
  ["ia", "Intelligence artificielle", "Assistant, bilan, tri automatique"],
  ["affichage", "Affichage", "Thème, mode discret, centimes"],
  ["donnees", "Données", "Export, suppression, déconnexion"],
];

/** Réglages : tout ce qui est paramétrable, regroupé par thème. */
export default function SettingsTab() {
  const [section, setSection] = useState<Section>("comptes");
  return (
    <div className="settings">
      <nav className="settings-nav">
        {SECTIONS.map(([id, label, hint]) => (
          <button key={id} className={section === id ? "on" : ""} onClick={() => setSection(id)}>
            <b>{label}</b><small>{hint}</small>
          </button>
        ))}
      </nav>
      <div className="settings-body">
        {section === "comptes" && <Accounts />}
        {section === "categories" && <Categories />}
        {section === "tri" && <Sorting />}
        {section === "reperes" && <Targets />}
        {section === "profil" && <Profile />}
        {section === "ia" && <Ai />}
        {section === "affichage" && <Display />}
        {section === "donnees" && <Data />}
      </div>
    </div>
  );
}

function H({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="set-head"><h2>{title}</h2>{children && <p>{children}</p>}</div>;
}

/* ---------------- Comptes ---------------- */
function Accounts() {
  const app = useApp();
  const [confirm, setConfirm] = useState<string | null>(null);
  const counts = (app.txs ?? []).reduce<Record<string, number>>((c, t) => ((c[t.account] = (c[t.account] ?? 0) + 1), c), {});
  return (
    <>
      <H title="Comptes">Les comptes se créent à l&apos;import d&apos;un relevé. Le type décide de ce qui compte comme dépense ou rentrée.</H>
      {!app.accounts.length && <p className="muted">Aucun compte : importe un relevé pour commencer.</p>}
      <div className="set-list">
        {app.accounts.map((a) => (
          <div key={a.key} className="set-item">
            <div className="set-row">
              <input className="inline-input" defaultValue={a.label} aria-label="Nom du compte"
                onBlur={(e) => e.target.value.trim() && e.target.value !== a.label && app.saveAccount({ ...a, label: e.target.value.trim() })} />
              <span className="muted small num">{counts[a.key] ?? 0} opérations</span>
            </div>
            <div className="set-row">
              <select value={a.kind} onChange={(e) => app.saveAccount({ ...a, kind: e.target.value as AccountKind, share: e.target.value === "joint" ? (a.share < 1 ? a.share : 0.5) : 1 })}>
                {(Object.keys(KIND_LABELS) as AccountKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
              {a.kind === "joint" && (
                <label className="small muted">Ta part <input type="number" min={1} max={100} defaultValue={Math.round(a.share * 100)} className="tiny"
                  onBlur={(e) => { const v = Math.min(100, Math.max(1, Number(e.target.value) || 50)) / 100; if (v !== a.share) app.saveAccount({ ...a, share: v }); }} /> %</label>
              )}
              <span className="grow" />
              {confirm === a.key
                ? <button className="link neg" onClick={() => { setConfirm(null); app.deleteAccount(a.key); }}>Supprimer ses {counts[a.key] ?? 0} opérations ?</button>
                : <button className="link muted" onClick={() => setConfirm(a.key)}>Supprimer</button>}
            </div>
          </div>
        ))}
      </div>
      {app.accounts.some((a) => a.kind === "joint") && (
        <>
          <h3 className="set-sub">Compte joint dans ton budget</h3>
          <label className="toggle">
            <input type="radio" name="joint" checked={app.settings.jointMode === "commune"} onChange={() => app.updateSettings({ jointMode: "commune" }, "Mode Vie commune activé")} />
            <span>Vie commune (recommandé)<small>Seuls tes virements vers le joint comptent, en une dépense « Vie commune ». Les aides et versements de l&apos;autre titulaire ne faussent plus tes chiffres. Le détail est dans l&apos;onglet Vie commune.</small></span>
          </label>
          <label className="toggle">
            <input type="radio" name="joint" checked={app.settings.jointMode === "part"} onChange={() => app.updateSettings({ jointMode: "part" }, "Mode part du joint activé")} />
            <span>Ta part de chaque opération<small>Chaque dépense et rentrée du joint compte à hauteur de ta part (ex. 50 %).</small></span>
          </label>
        </>
      )}
      <p className="foot">Changer le type s&apos;applique aux prochains imports. Pour reclasser un relevé déjà importé, supprime le compte puis réimporte-le.</p>
    </>
  );
}

/* ---------------- Catégories ---------------- */
function Categories() {
  const app = useApp();
  const s = app.settings;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [picking, setPicking] = useState<string | null>(null);
  const custom = new Set(s.customCategories.map((c) => c.name));

  const toggleNeed = (c: string) => app.updateSettings({ needs: isNeed(c) ? s.needs.filter((x) => x !== c) : [...s.needs, c] });
  const toggleHidden = (c: string) => app.updateSettings({ hidden: s.hidden.includes(c) ? s.hidden.filter((x) => x !== c) : [...s.hidden, c] });
  const setColor = (c: string, color: string) => { setPicking(null); app.updateSettings({ colors: { ...s.colors, [c]: color } }); };
  const add = () => {
    const n = name.trim();
    if (!n || allCategories().includes(n)) return;
    app.updateSettings({ customCategories: [...s.customCategories, { name: n, kind, color: PALETTE[s.customCategories.length % PALETTE.length] }] }, `Catégorie « ${n} » créée`);
    setName("");
  };
  const remove = (c: string) => app.updateSettings({ customCategories: s.customCategories.filter((x) => x.name !== c) }, `Catégorie « ${c} » supprimée`);

  const Row = ({ c, expense }: { c: string; expense: boolean }) => (
    <div className="cat-set">
      <button className="swatch" style={{ background: colorOf(c) }} onClick={() => setPicking(picking === c ? null : c)} aria-label={`Couleur de ${c}`} />
      <span className={`grow ${s.hidden.includes(c) ? "muted" : ""}`}>{c}</span>
      {expense && (
        <div className="segmented small">
          <button className={isNeed(c) ? "on" : ""} onClick={() => !isNeed(c) && toggleNeed(c)}>Besoin</button>
          <button className={!isNeed(c) ? "on" : ""} onClick={() => isNeed(c) && toggleNeed(c)}>Envie</button>
        </div>
      )}
      <button className="link muted" onClick={() => toggleHidden(c)}>{s.hidden.includes(c) ? "Afficher" : "Masquer"}</button>
      {custom.has(c) && <button className="link neg" onClick={() => remove(c)}>Supprimer</button>}
      {picking === c && (
        <div className="palette">
          {PALETTE.map((p) => <button key={p} style={{ background: p }} onClick={() => setColor(c, p)} aria-label={p} />)}
        </div>
      )}
    </div>
  );

  return (
    <>
      <H title="Catégories">Touche une pastille pour changer sa couleur. « Besoin » ou « Envie » alimente la répartition 50/30/20. Masquer retire la catégorie des listes de choix.</H>
      <h3 className="set-sub">Dépenses</h3>
      {expenseCategories().map((c) => <Row key={c} c={c} expense />)}
      <h3 className="set-sub">Rentrées</h3>
      {incomeCategories().map((c) => <Row key={c} c={c} expense={false} />)}
      <h3 className="set-sub">Mouvements</h3>
      {[SAVINGS, INTERNAL].map((c) => <Row key={c} c={c} expense={false} />)}

      <h3 className="set-sub">Nouvelle catégorie</h3>
      <div className="set-row">
        <input placeholder="Nom (ex. Animaux)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select value={kind} onChange={(e) => setKind(e.target.value as "expense" | "income")}>
          <option value="expense">Dépense</option>
          <option value="income">Rentrée</option>
        </select>
        <button className="pill" onClick={add} disabled={!name.trim()}>Créer</button>
      </div>
    </>
  );
}

/* ---------------- Règles de tri ---------------- */
function Sorting() {
  const app = useApp();
  const s = app.settings;
  const [kw, setKw] = useState("");
  const [cat, setCat] = useState(expenseCategories()[0]);
  const learned = Object.entries(app.rules).sort((a, b) => a[0].localeCompare(b[0]));
  const add = () => {
    if (!kw.trim()) return;
    app.updateSettings({ keywordRules: [...s.keywordRules, { keyword: kw.trim(), category: cat }] }, `Règle « ${kw.trim()} » ajoutée`);
    setKw("");
  };
  return (
    <>
      <H title="Règles de tri">Tes règles passent avant le tri automatique. Après une modification, re-trie tes opérations pour l&apos;appliquer à l&apos;existant.</H>
      <button className="pill" onClick={app.resortAll} disabled={app.busy}>Re-trier toutes les opérations</button>
      <p className="foot">Les opérations que tu as corrigées à la main ne sont jamais modifiées.</p>

      <h3 className="set-sub">Par mot-clé</h3>
      <p className="muted small">Si le libellé contient ce mot, l&apos;opération va dans cette catégorie.</p>
      <div className="set-row">
        <input placeholder="Mot-clé (ex. NETFLIX)" value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>{allCategories().map((c) => <option key={c}>{c}</option>)}</select>
        <button className="pill" onClick={add} disabled={!kw.trim()}>Ajouter</button>
      </div>
      <ul className="plainlist">
        {s.keywordRules.map((r, i) => (
          <li key={i}>
            <span className="name"><code>{r.keyword}</code> → <span className="dot" style={{ background: colorOf(r.category) }} />{r.category}</span>
            <button className="link muted" onClick={() => app.updateSettings({ keywordRules: s.keywordRules.filter((_, j) => j !== i) }, "Règle supprimée")}>Supprimer</button>
          </li>
        ))}
        {!s.keywordRules.length && <li className="muted">Aucune règle par mot-clé.</li>}
      </ul>

      <h3 className="set-sub">Marchands mémorisés <span className="muted small">({learned.length})</span></h3>
      <p className="muted small">Créés quand tu changes la catégorie d&apos;une opération.</p>
      <ul className="plainlist">
        {learned.map(([key, c]) => (
          <li key={key}>
            <span className="name"><code>{key}</code></span>
            <span className="set-row">
              <select value={c} onChange={(e) => app.changeRule(key, e.target.value)}>{allCategories().map((x) => <option key={x}>{x}</option>)}</select>
              <button className="link muted" onClick={() => app.removeRule(key)}>Oublier</button>
            </span>
          </li>
        ))}
        {!learned.length && <li className="muted">Aucun marchand mémorisé pour l&apos;instant.</li>}
      </ul>
    </>
  );
}

/* ---------------- Objectifs ---------------- */
function Targets() {
  const app = useApp();
  const t = app.settings.targets;
  const set = (k: "savings" | "needs" | "wants", v: number) => app.updateSettings({ targets: { ...t, [k]: Math.max(0, Math.min(100, v)) / 100 } });
  const rest = Math.round((1 - t.needs - t.wants) * 100);
  const Field = ({ k, label, hint }: { k: "savings" | "needs" | "wants"; label: string; hint: string }) => (
    <label className="target">
      <span><b>{label}</b><small>{hint}</small></span>
      <span><input type="number" min={0} max={100} defaultValue={Math.round(t[k] * 100)} onBlur={(e) => Number(e.target.value) !== Math.round(t[k] * 100) && set(k, Number(e.target.value))} /> %</span>
    </label>
  );
  return (
    <>
      <H title="Objectifs">Ils pilotent l&apos;anneau d&apos;épargne, la répartition et les conseils.</H>
      <Field k="savings" label="Objectif d'épargne" hint="Part de tes rentrées à ne pas dépenser" />
      <Field k="needs" label="Besoins, au maximum" hint="Logement, courses, voiture, assurances…" />
      <Field k="wants" label="Envies, au maximum" hint="Restos, loisirs, shopping, abonnements…" />
      <p className={`foot ${rest < 0 ? "neg" : ""}`}>Il reste {rest} % pour l&apos;épargne et l&apos;imprévu.</p>
      <label className="toggle">
        <input type="checkbox" checked={app.settings.coach} onChange={(e) => app.updateSettings({ coach: e.target.checked })} />
        <span>Afficher les conseils dans la synthèse</span>
      </label>
    </>
  );
}

/* ---------------- Profil bancaire ---------------- */
function Profile() {
  const app = useApp();
  const s = app.settings;
  const [names, setNames] = useState(s.ownerNames.join(", "));
  const [salary, setSalary] = useState(s.salaryKeywords.join(", "));
  const split = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  return (
    <>
      <H title="Profil bancaire">Ces mots servent au tri automatique. Ils restent dans ta base, jamais dans le code.</H>
      <label className="field">Ton nom tel qu&apos;il apparaît sur les virements
        <input value={names} placeholder="PRÉNOM NOM, NOM PRÉNOM" onChange={(e) => setNames(e.target.value)} onBlur={() => app.updateSettings({ ownerNames: split(names) })} />
        <small>Un virement à ton nom (entre tes comptes, vers le joint) n&apos;est ni une dépense ni une rentrée.</small>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={s.salaryShiftDay > 0} onChange={(e) => app.updateSettings({ salaryShiftDay: e.target.checked ? 20 : 0 }, e.target.checked ? "Salaire compté pour le mois suivant" : "Salaire compté le mois où il arrive")} />
        <span>Mon salaire de fin de mois finance le mois suivant<small>Payé fin octobre pour novembre : il compte dans les rentrées de novembre. Tes budgets et ta marge comparent ce que tu dépenses avec le salaire qui le finance.</small></span>
      </label>
      {s.salaryShiftDay > 0 && (
        <label className="target">
          <span><b>À partir du</b><small>Un salaire reçu ce jour-là ou après compte pour le mois suivant</small></span>
          <span><input type="number" min={1} max={31} defaultValue={s.salaryShiftDay} onBlur={(e) => { const v = Math.min(31, Math.max(1, Number(e.target.value) || 20)); if (v !== s.salaryShiftDay) app.updateSettings({ salaryShiftDay: v }); }} /> du mois</span>
        </label>
      )}
      <label className="field">Prénom de l&apos;autre titulaire du compte joint
        <input defaultValue={s.partnerName} placeholder="Prénom" onBlur={(e) => e.target.value.trim() !== s.partnerName && app.updateSettings({ partnerName: e.target.value.trim() })} />
        <small>Affiché dans l&apos;onglet Vie commune.</small>
      </label>
      <label className="field">Ton employeur sur le relevé
        <input value={salary} placeholder="NOM DE L'EMPLOYEUR" onChange={(e) => setSalary(e.target.value)} onBlur={() => app.updateSettings({ salaryKeywords: split(salary) })} />
        <small>Les virements reçus contenant ce mot sont classés en Salaire.</small>
      </label>
    </>
  );
}

/* ---------------- IA ---------------- */
function Ai() {
  const app = useApp();
  return (
    <>
      <H title="Intelligence artificielle">Trois fonctions : le tri des opérations que les règles ratent (onglet Opérations), le bilan du mois (Synthèse) et l&apos;assistant à qui poser tes questions.</H>
      <p className={`status ${app.aiEnabled ? "on" : ""}`}><i />{app.aiEnabled ? "Branchée et prête" : "Pas encore branchée"}</p>
      {!app.aiEnabled && (
        <>
          <h3 className="set-sub">La brancher</h3>
          <p className="muted small">Deux options gratuites, sans carte bancaire. Choisis-en une :</p>
          <h3 className="set-sub">Groq (recommandé : n&apos;entraîne pas ses modèles sur tes données)</h3>
          <ol className="steps">
            <li>Crée un compte sur console.groq.com (email, Google ou GitHub).</li>
            <li>Menu API Keys → Create API Key, copie la clé.</li>
            <li>Dans Vercel → projet finance-flow → Settings → Environment Variables : ajoute <code>GROQ_API_KEY</code>, coche Production, enregistre.</li>
            <li>Deployments → « … » du dernier déploiement → Redeploy.</li>
          </ol>
          <h3 className="set-sub">Google Gemini (quotas plus larges)</h3>
          <ol className="steps">
            <li>Va sur aistudio.google.com avec ton compte Google → Get API key → Create API key.</li>
            <li>Dans Vercel, ajoute <code>GEMINI_API_KEY</code> de la même façon, puis Redeploy.</li>
          </ol>
          <p className="foot">Attention : en gratuit, Google peut utiliser tes requêtes pour améliorer ses modèles.</p>
          <p className="foot">La clé reste sur le serveur : elle n&apos;est jamais dans le code public ni dans ton navigateur.</p>
        </>
      )}
      <h3 className="set-sub">Ce qui part vers l&apos;IA</h3>
      <p className="muted small">Quand tu l&apos;utilises : tes libellés, montants, catégories et réglages utiles (objectifs, budgets). Ton nom et les numéros (comptes, cartes, références) sont retirés avant l&apos;envoi. Rien n&apos;est envoyé tant que tu ne cliques pas.</p>
    </>
  );
}

/* ---------------- Affichage ---------------- */
function Display() {
  const app = useApp();
  const s = app.settings;
  return (
    <>
      <H title="Affichage" />
      <label className="field">Thème
        <div className="segmented">
          {([["light", "Clair"], ["dark", "Sombre"], ["auto", "Automatique"]] as const).map(([v, l]) =>
            <button key={v} className={s.theme === v ? "on" : ""} onClick={() => app.updateSettings({ theme: v })}>{l}</button>)}
        </div>
      </label>
      <label className="field">Onglet d&apos;ouverture
        <select value={s.startTab} onChange={(e) => app.updateSettings({ startTab: e.target.value as typeof s.startTab })}>
          <option value="synthese">Synthèse</option><option value="operations">Opérations</option>
          <option value="budgets">Budgets</option><option value="commune">Vie commune</option><option value="analyse">Analyse</option>
        </select>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={s.privacy} onChange={(e) => app.updateSettings({ privacy: e.target.checked })} />
        <span>Mode discret <small>Floute les montants (survole pour les voir), pratique en public.</small></span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={s.cents} onChange={(e) => app.updateSettings({ cents: e.target.checked })} />
        <span>Afficher les centimes dans les listes</span>
      </label>
    </>
  );
}

/* ---------------- Données ---------------- */
function Data() {
  const app = useApp();
  const [confirm, setConfirm] = useState("");
  const [csv, setCsv] = useState<string | null>(null);

  const exportCsv = () => {
    const rows = [["date", "libelle", "libelle_banque", "montant", "categorie", "compte"]];
    for (const t of [...(app.txs ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([t.date, t.label, t.raw, t.amount.toFixed(2).replace(".", ","), t.category, app.labels[t.account] ?? t.account]);
    }
    const text = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `gfp-operations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setCsv(`${rows.length - 1} opérations exportées.`);
  };

  return (
    <>
      <H title="Données">Tes données sont dans ta base Supabase, visibles par toi seul.</H>
      <div className="set-item">
        <b>Exporter mes opérations</b>
        <p className="muted small">Un fichier CSV lisible dans Excel ou Numbers.</p>
        <button className="pill" onClick={exportCsv}>Télécharger le CSV</button>
        {csv && <p className="foot">{csv}</p>}
      </div>
      <div className="set-item">
        <b>Se déconnecter</b>
        <p className="muted small">Connecté avec {app.session.user.email}.</p>
        <button className="pill" onClick={() => supabase().auth.signOut()}>Se déconnecter</button>
      </div>
      <div className="set-item danger-zone">
        <b>Tout supprimer</b>
        <p className="muted small">Opérations, comptes, budgets, règles et réglages. Irréversible.</p>
        <input placeholder="Écris SUPPRIMER pour confirmer" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button className="danger" disabled={confirm !== "SUPPRIMER"} onClick={() => { setConfirm(""); app.wipeAll(); }}>Supprimer toutes mes données</button>
      </div>
    </>
  );
}
