import { EXPENSE_RULES, INCOME_RULES, INTERNAL, OWNER_TOKENS, SAVINGS } from "./categories.ts";
import { hash, merchantKey, norm, prettyLabel, round2 } from "./text.ts";
import type { AccountKind, NewTransaction, ParsedStatement, Rules } from "./types.ts";

/** Catégorie d'une opération : d'abord les choix mémorisés, puis les mots-clés. */
export function categorize(raw: string, amount: number, extra: string, rules: Rules = {}): string {
  const learned = rules[merchantKey(raw)];
  if (learned) return learned;
  const label = norm(raw).replace(/-/g, " ");
  const words = new Set(label.split(/[^A-Z0-9]+/));
  if (OWNER_TOKENS.some((tokens) => tokens.length > 1 && tokens.every((t) => words.has(t)))) return INTERNAL;
  const full = norm(raw + " " + extra).replace(/-/g, " ");
  const table = amount > 0 ? INCOME_RULES : EXPENSE_RULES;
  for (const [category, keywords] of table) {
    const haystack = category === INTERNAL || category === SAVINGS ? label : full;
    if (keywords.some((k) => haystack.includes(k.replace(/-/g, " ")))) return category;
  }
  return amount > 0 ? "Autres revenus" : "Divers";
}

/**
 * Règle propre au type de compte, appliquée après les règles apprises :
 * - épargne (livret…) : tout est un mouvement entre tes comptes, sauf les intérêts ;
 * - joint : les versements reçus sont des apports (les tiens ou ceux de l'autre titulaire), pas des revenus.
 */
function byAccountKind(category: string, raw: string, amount: number, kind: AccountKind): string {
  const t = norm(raw);
  if (kind === "epargne") return amount > 0 && /INTERET|INTEREST/.test(t) ? "Autres revenus" : INTERNAL;
  if (kind === "joint" && amount > 0 && category !== "Remboursements") return INTERNAL;
  return category;
}

/** Relevé analysé → lignes prêtes pour ff_transactions (empreinte anti-doublon incluse). */
export function toNewTransactions(statement: ParsedStatement, rules: Rules = {}, kind: AccountKind = "courant"): NewTransaction[] {
  const seen: Record<string, number> = {};
  return statement.transactions.map((t) => {
    const base = `${t.date}|${t.amount.toFixed(2)}|${norm(t.raw)}|${statement.account}`;
    seen[base] = (seen[base] ?? 0) + 1; // deux achats identiques le même jour restent distincts
    return {
      fingerprint: hash(base) + "-" + seen[base],
      date: t.date,
      label: prettyLabel(t.raw),
      raw: t.raw,
      amount: round2(t.amount),
      category: rules[merchantKey(t.raw)] ?? byAccountKind(categorize(t.raw, t.amount, t.extra), t.raw, t.amount, kind),
      account: statement.account,
      source: statement.source,
      manual: false,
    };
  });
}
