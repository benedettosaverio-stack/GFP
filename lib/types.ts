/** Opération telle que stockée dans Supabase (table ff_transactions). */
export type Transaction = {
  id: string;
  fingerprint: string;
  date: string; // AAAA-MM-JJ
  label: string;
  raw: string;
  amount: number; // négatif = sortie
  category: string;
  account: string;
  source: string;
  manual: boolean;
};

/** Opération sortie d'un relevé, avant enregistrement. */
export type ParsedTx = {
  date: string;
  raw: string;
  amount: number;
  extra: string; // lignes de détail sous le libellé (aident à catégoriser)
};

export type ParsedStatement = {
  source: string; // "Allianz", "Revolut", "CSV"…
  account: string; // ex. "Allianz ••4440"
  transactions: ParsedTx[];
};

/** Nouvelle opération prête à être insérée. */
export type NewTransaction = Omit<Transaction, "id">;

export type Rules = Record<string, string>; // merchant_key → catégorie
export type Budgets = Record<string, number>; // catégorie → montant mensuel

export type AccountKind = "courant" | "epargne" | "joint";

/** Compte bancaire (table ff_accounts). `share` = ta part des dépenses (compte joint). */
export type Account = { key: string; label: string; kind: AccountKind; share: number; detected: string | null };
