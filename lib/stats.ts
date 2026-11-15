import { INTERNAL, SAVINGS, isExpense, isIncome } from "./categories.ts";
import { merchantKey } from "./text.ts";
import type { Budgets, Transaction } from "./types.ts";

export type MonthSummary = {
  spent: number;
  income: number;
  saved: number;
  internal: number; // net des virements entre comptes (négatif = parti vers un autre compte)
  byCategory: Record<string, number>;
};

/** Part de chaque compte (1 par défaut, ex. 0.5 pour un compte joint partagé à deux). */
export type Shares = Record<string, number>;

/** Montant qui te revient : les dépenses d'un compte joint ne comptent qu'à hauteur de ta part. */
export const myAmount = (t: Pick<Transaction, "amount" | "account">, shares: Shares = {}) => t.amount * (shares[t.account] ?? 1);

export function summarize(all: Pick<Transaction, "amount" | "category" | "account">[], shares: Shares = {}): MonthSummary {
  const s: MonthSummary = { spent: 0, income: 0, saved: 0, internal: 0, byCategory: {} };
  for (const raw of all) {
    const t = { ...raw, amount: myAmount(raw, shares) };
    if (isExpense(t.category)) {
      s.spent -= t.amount; // un remboursement en catégorie de dépense vient en déduction
      s.byCategory[t.category] = (s.byCategory[t.category] ?? 0) - t.amount;
    } else if (isIncome(t.category)) s.income += t.amount;
    else if (t.category === SAVINGS) s.saved -= t.amount;
    else if (t.category === INTERNAL) s.internal += t.amount;
  }
  return s;
}

export type Insight = { icon: string; text: string };

export function insights(txs: Transaction[], s: MonthSummary, previous: MonthSummary | null, budgets: Budgets, shares: Shares = {}): Insight[] {
  const out: Insight[] = [];
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";

  for (const [cat, b] of Object.entries(budgets)) {
    const v = s.byCategory[cat] ?? 0;
    if (b > 0 && v > b) out.push({ icon: "⚠️", text: `${cat} : budget dépassé de ${fmt(v - b)}.` });
  }

  const groups: Record<string, { n: number; sum: number; label: string }> = {};
  for (const t of txs) {
    if (!isExpense(t.category) || t.amount >= 0) continue;
    const k = merchantKey(t.raw);
    groups[k] ??= { n: 0, sum: 0, label: t.label };
    groups[k].n++;
    groups[k].sum -= myAmount(t, shares);
  }
  const repeat = Object.values(groups).filter((g) => g.n >= 3).sort((a, b) => b.sum - a.sum)[0];
  if (repeat) out.push({ icon: "🔁", text: `${repeat.label} : ${repeat.n} achats ce mois, ${fmt(repeat.sum)} au total.` });

  const top = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1])[0];
  if (top && s.spent > 0) out.push({ icon: "📊", text: `${top[0]} représente ${Math.round((top[1] / s.spent) * 100)} % de tes dépenses (${fmt(top[1])}).` });

  const subs = s.byCategory["Abonnements & téléphone"];
  if (subs) out.push({ icon: "📅", text: `Abonnements : ${fmt(subs)} par mois, soit environ ${fmt(subs * 12)} par an.` });

  if (previous && previous.spent > 0) {
    const diff = s.spent - previous.spent;
    out.push({ icon: diff > 0 ? "📈" : "📉", text: `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))} de dépenses par rapport au mois précédent.` });
  }
  return out;
}
