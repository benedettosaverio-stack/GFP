import { HOUSEHOLD_INCOME, INTERNAL, VIE_COMMUNE, isExpense, ownerTokens } from "./categories.ts";
import { norm } from "./text.ts";
import type { Transaction } from "./types.ts";

type Tx = Pick<Transaction, "id" | "date" | "label" | "amount" | "account" | "category" | "raw" | "manual">;
const days = (d: string) => Date.parse(d) / 864e5;

/**
 * Virements entre tes comptes perso et le compte joint (même montant, sens opposé, 4 jours max).
 * - `mine` : les lignes côté compte perso → elles deviennent ta dépense « Vie commune » ;
 * - `fromMe` : les lignes côté compte joint → tes versements, vus depuis le joint.
 */
export function jointLinks(txs: Tx[], jointKeys: Set<string>): { mine: Set<string>; fromMe: Set<string> } {
  const mine = new Set<string>();
  const fromMe = new Set<string>();
  if (!jointKeys.size) return { mine, fromMe };
  const joint = txs.filter((t) => jointKeys.has(t.account) && t.category === INTERNAL);
  for (const p of txs) {
    if (jointKeys.has(p.account) || p.category !== INTERNAL) continue;
    const j = joint.find((t) => !fromMe.has(t.id) && Math.abs(t.amount + p.amount) < 0.005 && Math.abs(days(t.date) - days(p.date)) <= 4);
    if (!j) continue;
    mine.add(p.id);
    fromMe.add(j.id);
  }
  return { mine, fromMe };
}

/** Opérations telles que tu les vis : un virement vers le joint compte comme une dépense « Vie commune ». */
export function withVieCommune<T extends Tx>(txs: T[], mine: Set<string>): T[] {
  return txs.map((t) => (mine.has(t.id) && !t.manual ? { ...t, category: VIE_COMMUNE } : t));
}

export type Household = {
  /** Ce que tu as versé au foyer (net), comptes perso → joint. */
  myContribution: number;
  /** Entrées du compte joint par origine. */
  inflows: { me: number; partner: number; aids: number; other: number };
  /** Dépenses du compte joint, montant total (pas seulement ta part). */
  spent: number;
  byCategory: Record<string, number>;
  /** Variation du compte joint sur le mois. */
  balance: number;
  jointTxs: Tx[];
};

/** Vue du foyer pour un mois : qui alimente le compte joint, et où part l'argent commun. */
export function household(monthTxs: Tx[], jointKeys: Set<string>, fromMe: Set<string>): Household {
  const h: Household = { myContribution: 0, inflows: { me: 0, partner: 0, aids: 0, other: 0 }, spent: 0, byCategory: {}, balance: 0, jointTxs: [] };
  const owner = ownerTokens();
  const isMine = (raw: string) => {
    const words = new Set(norm(raw).split(/[^A-Z0-9]+/));
    return owner.some((tokens) => tokens.length > 1 && tokens.every((w) => words.has(w)));
  };
  for (const t of monthTxs) {
    if (!jointKeys.has(t.account)) {
      if (t.category === VIE_COMMUNE) h.myContribution -= t.amount;
      continue;
    }
    h.jointTxs.push(t);
    h.balance += t.amount;
    if (t.amount > 0) {
      if (HOUSEHOLD_INCOME.includes(t.category)) h.inflows.aids += t.amount;
      else if (fromMe.has(t.id) || isMine(t.raw)) h.inflows.me += t.amount;
      else if (t.category === INTERNAL) h.inflows.partner += t.amount;
      else if (isExpense(t.category)) { h.spent -= t.amount; h.byCategory[t.category] = (h.byCategory[t.category] ?? 0) - t.amount; }
      else h.inflows.other += t.amount;
    } else if (isExpense(t.category)) {
      h.spent -= t.amount;
      h.byCategory[t.category] = (h.byCategory[t.category] ?? 0) - t.amount;
    } else if (fromMe.has(t.id) || isMine(t.raw)) {
      h.inflows.me += t.amount; // le joint te reverse de l'argent : ton apport net baisse
    } else {
      h.inflows.other += t.amount;
    }
  }
  return h;
}

/**
 * Salaire versé en fin de mois pour le mois suivant (ex. payé le 28 octobre pour novembre) :
 * on le rattache au 1er du mois suivant, pour que chaque mois ait les rentrées qui le financent.
 * La date réelle reste dans `paidOn`.
 */
export function shiftSalary<T extends { date: string; category: string; amount: number; paidOn?: string }>(txs: T[], fromDay: number, categories = ["Salaire"]): T[] {
  return txs.map((t) => {
    if (t.amount <= 0 || !categories.includes(t.category) || Number(t.date.slice(8, 10)) < fromDay) return t;
    const [y, m] = t.date.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return { ...t, date: next, paidOn: t.date };
  });
}
