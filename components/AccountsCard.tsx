"use client";
import { useState } from "react";
import type { Account, AccountKind } from "@/lib/types";
import { KIND_LABELS } from "./AccountPicker";

type Props = {
  accounts: Account[];
  counts: Record<string, number>;
  onSave: (a: Account) => void;
  onDelete: (key: string) => void;
};

/** Mes comptes : type, part du compte joint, suppression des opérations d'un compte. */
export default function AccountsCard({ accounts, counts, onSave, onDelete }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (!accounts.length) return null;
  return (
    <>
      <h2>Mes comptes</h2>
      <section className="card">
        {accounts.map((a) => (
          <div key={a.key} className="acc">
            <div className="acc-head">
              <b>{a.label}</b>
              <span className="muted small">{counts[a.key] ?? 0} opérations</span>
            </div>
            <div className="acc-row">
              <select value={a.kind} onChange={(e) => onSave({ ...a, kind: e.target.value as AccountKind, share: e.target.value === "joint" ? (a.share < 1 ? a.share : 0.5) : 1 })}>
                {(Object.keys(KIND_LABELS) as AccountKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
              {a.kind === "joint" && (
                <label className="small muted">
                  ta part{" "}
                  <input
                    type="number" min={1} max={100} defaultValue={Math.round(a.share * 100)}
                    onBlur={(e) => { const v = Math.min(100, Math.max(1, Number(e.target.value) || 50)) / 100; if (v !== a.share) onSave({ ...a, share: v }); }}
                  /> %
                </label>
              )}
              {confirming === a.key ? (
                <button className="link neg" onClick={() => { setConfirming(null); onDelete(a.key); }}>Confirmer la suppression</button>
              ) : (
                <button className="link muted" onClick={() => setConfirming(a.key)}>Supprimer</button>
              )}
            </div>
          </div>
        ))}
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          Changer le type s&apos;applique aux prochains imports. Pour reclasser ce qui est déjà importé, supprime le compte puis réimporte son relevé.
        </p>
      </section>
    </>
  );
}
