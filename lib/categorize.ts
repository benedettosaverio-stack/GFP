import { EXPENSE_RULES, INCOME_RULES, INTERNAL, SAVINGS } from "./categories.ts";
import { hash, merchantKey, norm, prettyLabel, round2 } from "./text.ts";
import type { NewTransaction, ParsedStatement, Rules } from "./types.ts";

/** Catégorie d'une opération : d'abord les choix mémorisés, puis les mots-clés. */
export function categorize(raw: string, amount: number, extra: string, rules: Rules = {}): string {
  const learned = rules[merchantKey(raw)];
  if (learned) return learned;
  const label = norm(raw).replace(/-/g, " ");
  const full = norm(raw + " " + extra).replace(/-/g, " ");
  const table = amount > 0 ? INCOME_RULES : EXPENSE_RULES;
  for (const [category, keywords] of table) {
    const haystack = category === INTERNAL || category === SAVINGS ? label : full;
    if (keywords.some((k) => haystack.includes(k.replace(/-/g, " ")))) return category;
  }
  return amount > 0 ? "Autres revenus" : "Divers";
}

/** Relevé analysé → lignes prêtes pour ff_transactions (empreinte anti-doublon incluse). */
export function toNewTransactions(statement: ParsedStatement, rules: Rules = {}): NewTransaction[] {
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
      category: categorize(t.raw, t.amount, t.extra, rules),
      account: statement.account,
      source: statement.source,
      manual: false,
    };
  });
}
