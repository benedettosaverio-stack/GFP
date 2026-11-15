"use client";
import { colorOf, tint, INTERNAL } from "@/lib/categories";
import { eur } from "@/lib/text";
import { useApp } from "./store";
import type { Tab } from "./Shell";

const int = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const pct = (x: number) => Math.round(x * 100) + " %";
// palette validée (dataviz) : toi, l'autre titulaire, aides, autres
const C = { me: "#2a78d6", partner: "#eb6834", aids: "#1baf7a", other: "#c9ccd3" };

/** Vie commune : ce que tu verses au foyer, qui alimente le compte joint et où part l'argent commun. */
export default function VieCommune({ go }: { go: (t: Tab) => void }) {
  const app = useApp();
  const h = app.home;
  const partner = app.settings.partnerName.trim() || "L'autre titulaire";

  if (!app.jointKeys.size) {
    return (
      <div className="empty">
        <b>Aucun compte joint pour l&apos;instant</b>
        Importe le relevé de ton compte joint et choisis le type « Compte joint ». Tes virements vers lui deviendront ta dépense « Vie commune », et ce compte aura son propre suivi ici.
        <p><button className="pill" onClick={() => go("reglages")}>Ouvrir les réglages des comptes</button></p>
      </div>
    );
  }

  // Si ton compte perso n'est pas importé, on retrouve tes versements depuis le joint (libellé à ton nom).
  const mine = h.myContribution > 0.004 ? h.myContribution : Math.max(0, h.inflows.me);
  const parts = ([
    ["Toi", h.inflows.me, C.me],
    [partner, h.inflows.partner, C.partner],
    ["Aides (CAF…)", h.inflows.aids, C.aids],
    ["Autres", h.inflows.other, C.other],
  ] as const).filter(([, v]) => v > 0.004);
  const totalIn = parts.reduce((s, [, v]) => s + v, 0);
  const people = Math.max(0, h.inflows.me) + Math.max(0, h.inflows.partner);
  const myShare = people > 0 ? Math.max(0, h.inflows.me) / people : null;

  const cats = Object.entries(h.byCategory).filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map(([, v]) => v));
  const recent = [...h.jointTxs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  return (
    <div className="cols">
      <div>
        <section className="hero">
          <p className="amount num">{int(mine)}</p>
          <p className="caption">versés au compte commun ce mois-ci</p>
          <div className="facts">
            <span className="fact"><b className="num">{int(h.spent)}</b> de dépenses communes</span>
            <span className="fact"><b className={`num ${h.balance < 0 ? "neg" : ""}`}>{h.balance >= 0 ? "+" : "−"}{int(Math.abs(h.balance))}</b> sur le compte joint</span>
          </div>
          <p className="muted small hint">
            {app.settings.jointMode === "commune"
              ? "Dans ta synthèse et tes budgets, seul ce montant compte, en dépense « Vie commune ». Le détail du compte joint reste ici."
              : "Ta synthèse compte ta part de chaque opération du compte joint. Tu peux passer au mode « Vie commune » dans Réglages → Comptes."}
          </p>
        </section>

        <section className="section">
          <div className="section-title"><h2>Qui alimente le compte joint</h2></div>
          {totalIn > 0.004 ? (
            <div className="split">
              <div className="bar" role="img" aria-label="Origine de l'argent du compte joint">
                {parts.map(([label, v, color]) => <i key={label} style={{ width: `${(v / totalIn) * 100}%`, background: color }} title={`${label} ${int(v)}`} />)}
              </div>
              <ul className="split-legend wide">
                {parts.map(([label, v, color]) => (
                  <li key={label}>
                    <i style={{ background: color }} />
                    <span>{label}</span>
                    <b className="num">{int(v)}</b>
                    <span className="muted num">{pct(v / totalIn)}</span>
                  </li>
                ))}
              </ul>
              {myShare !== null && (
                <p className="foot">Entre vous deux, tu as apporté <b className="num">{pct(myShare)}</b> des versements ce mois-ci.</p>
              )}
            </div>
          ) : (
            <p className="muted">Aucune entrée sur le compte joint ce mois-ci.</p>
          )}
          {!app.settings.partnerName && (
            <p className="foot">Ajoute le prénom de l&apos;autre titulaire dans Réglages → Profil bancaire pour l&apos;afficher ici.</p>
          )}
        </section>
      </div>

      <div>
        <section className="section first">
          <div className="section-title"><h2>Dépenses communes</h2><span className="muted small num">{int(h.spent)}</span></div>
          {cats.length ? (
            <div className="cats">
              {cats.map(([c, v]) => (
                <div key={c} className="cat">
                  <span className="name"><span className="dot" style={{ background: colorOf(c) }} />{c}</span>
                  <span className="amt num">{int(v)}</span>
                  <span className="track"><i style={{ width: `${(v / max) * 100}%`, background: colorOf(c) }} /></span>
                </div>
              ))}
            </div>
          ) : <p className="muted">Aucune dépense commune ce mois-ci.</p>}
        </section>

        <section className="section">
          <div className="section-title"><h2>Opérations du compte joint</h2>
            <button className="link" onClick={() => { app.setOpsPreset({ account: [...app.jointKeys][0] }); go("operations"); }}>Tout voir</button>
          </div>
          {recent.map((t) => (
            <div key={t.id} className={`tx ${t.category === INTERNAL ? "dim" : ""}`}>
              <div className="l">
                <div className="t">{t.label}</div>
                <div className="meta">
                  <span className="chip" style={{ background: tint(t.category) }}><span className="dot" style={{ background: colorOf(t.category) }} />{t.category === INTERNAL ? (t.amount > 0 ? "Versement" : "Retrait") : t.category}</span>
                  <span>{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</span>
                </div>
              </div>
              <div className={`a num ${t.amount > 0 ? "pos" : ""}`}>{(t.amount > 0 ? "+" : "") + eur(t.amount)}</div>
            </div>
          ))}
          {!recent.length && <p className="muted">Aucune opération ce mois-ci sur le compte joint.</p>}
        </section>
      </div>
    </div>
  );
}
