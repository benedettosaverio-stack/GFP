"use client";
import { useMemo, useState } from "react";
import { eur, monthLabel } from "@/lib/text";
import type { Account, AccountKind, ParsedStatement } from "@/lib/types";

export const KIND_LABELS: Record<AccountKind, string> = {
  courant: "Compte courant",
  epargne: "Épargne (livret…)",
  joint: "Compte joint",
};

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "compte";

type Props = {
  fileName: string;
  statement: ParsedStatement;
  accounts: Account[];
  onConfirm: (account: Account) => void;
  onCancel: () => void;
};

/** Avant d'enregistrer un relevé : à quel compte appartient-il ? */
export default function AccountPicker({ fileName, statement, accounts, onConfirm, onCancel }: Props) {
  const matches = accounts.filter((a) => a.detected === statement.account);
  const [choice, setChoice] = useState<string>(matches.length === 1 ? matches[0].key : accounts.length ? accounts[0].key : "__new");
  const [label, setLabel] = useState(statement.source === "CSV" ? "" : statement.account.replace(/ ••\d+$/, ""));
  const [kind, setKind] = useState<AccountKind>("courant");
  const [share, setShare] = useState(50);

  const info = useMemo(() => {
    const dates = statement.transactions.map((t) => t.date).sort();
    const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
    const net = statement.transactions.reduce((s, t) => s + t.amount, 0);
    return { n: dates.length, period: months.map(monthLabel).join(", "), net };
  }, [statement]);

  function confirm() {
    if (choice !== "__new") {
      const a = accounts.find((x) => x.key === choice)!;
      onConfirm({ ...a, detected: a.detected ?? statement.account });
      return;
    }
    const name = label.trim() || "Mon compte";
    let key = slug(name);
    while (accounts.some((a) => a.key === key)) key += "-2";
    onConfirm({ key, label: name, kind, share: kind === "joint" ? Math.min(100, Math.max(1, share)) / 100 : 1, detected: statement.account });
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="sheet">
        <h3>Ce relevé, c&apos;est quel compte ?</h3>
        <p className="muted small">
          {fileName} · {info.n} opérations · {info.period} · solde des mouvements {eur(info.net, 0)}
        </p>

        <div className="choices">
          {accounts.map((a) => (
            <label key={a.key} className={`choice ${choice === a.key ? "on" : ""}`}>
              <input type="radio" name="acc" checked={choice === a.key} onChange={() => setChoice(a.key)} />
              <span><b>{a.label}</b><small>{KIND_LABELS[a.kind]}{a.kind === "joint" ? ` · ta part ${Math.round(a.share * 100)} %` : ""}</small></span>
            </label>
          ))}
          <label className={`choice ${choice === "__new" ? "on" : ""}`}>
            <input type="radio" name="acc" checked={choice === "__new"} onChange={() => setChoice("__new")} />
            <span><b>Nouveau compte</b></span>
          </label>
        </div>

        {choice === "__new" && (
          <div className="newacc">
            <input placeholder="Nom (ex. Revolut joint)" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
            <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {(Object.keys(KIND_LABELS) as AccountKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
            {kind === "joint" && (
              <label className="small muted">
                Ta part des dépenses <input type="number" min={1} max={100} value={share} onChange={(e) => setShare(Number(e.target.value))} /> %
              </label>
            )}
            <p className="small muted">
              {kind === "epargne" && "Rien sur ce compte ne compte comme dépense ou rentrée, sauf les intérêts."}
              {kind === "joint" && "Seule ta part des dépenses compte ; l'argent versé sur le joint n'est pas un revenu."}
              {kind === "courant" && "Dépenses et rentrées comptent normalement."}
            </p>
          </div>
        )}

        <div className="actions">
          <button className="ghost" onClick={onCancel}>Annuler</button>
          <button className="primary" onClick={confirm}>Importer</button>
        </div>
      </div>
    </div>
  );
}
