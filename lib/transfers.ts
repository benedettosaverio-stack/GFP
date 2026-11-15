import { INTERNAL, SAVINGS, isExpense } from "./categories.ts";

type Linkable = { fingerprint: string; date: string; amount: number; category: string; account: string; raw: string; manual: boolean };

const days = (d: string) => Date.parse(d) / 864e5;
const TRANSFER_LIKE = /^(VIR|PRLV|VIREMENT|TRANSFER|PAYMENT FROM|TO |TOP-UP)/i;

/**
 * Un débit et un crédit du même montant, à 4 jours max, sur deux comptes différents
 * = un virement entre tes comptes : ni dépense, ni rentrée.
 * Si un côté est déjà en épargne (ex. « vers Livret A »), il le reste — on ne compte qu'une fois ce qui est mis de côté.
 * Retourne les empreintes modifiées et leur nouvelle catégorie.
 */
export function linkTransfers<T extends Linkable>(txs: T[]): Map<string, string> {
  const changes = new Map<string, string>();
  const used = new Set<string>();
  const candidates = txs.filter((t) => !t.manual && (!isExpense(t.category) || TRANSFER_LIKE.test(t.raw)));
  for (const out of candidates) {
    if (out.amount >= 0 || used.has(out.fingerprint)) continue;
    const inc = candidates.find(
      (t) =>
        t.amount > 0 &&
        !used.has(t.fingerprint) &&
        t.account !== out.account &&
        Math.abs(t.amount + out.amount) < 0.005 &&
        Math.abs(days(t.date) - days(out.date)) <= 4,
    );
    if (!inc) continue;
    used.add(out.fingerprint);
    used.add(inc.fingerprint);
    const set = (t: T, c: string) => { if (t.category !== c) changes.set(t.fingerprint, c); };
    if (out.category === SAVINGS) set(inc, INTERNAL);
    else if (inc.category === SAVINGS) set(out, INTERNAL);
    else { set(out, INTERNAL); set(inc, INTERNAL); }
  }
  return changes;
}
