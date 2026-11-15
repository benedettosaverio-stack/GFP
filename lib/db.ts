"use client";
import { supabase } from "./supabase";
import { merchantKey, shiftMonth } from "./text";
import { linkTransfers } from "./transfers";
import type { Budgets, NewTransaction, Rules, Transaction } from "./types";

const TX = "ff_transactions";

type Row = Omit<Transaction, "amount"> & { amount: number | string };
const fromRow = (r: Row): Transaction => ({ ...r, amount: Number(r.amount) });
const COLS = "id,fingerprint,date,label,raw,amount,category,account,source,manual";

async function userId(): Promise<string> {
  const { data } = await supabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Session expirée, reconnecte-toi.");
  return id;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Toutes les opérations (pagination Supabase par 1000). */
export async function loadTransactions(): Promise<Transaction[]> {
  const out: Transaction[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await supabase().from(TX).select(COLS).order("date", { ascending: false }).range(from, from + 999)) as Row[];
    out.push(...rows.map(fromRow));
    if (rows.length < 1000) return out;
  }
}

export async function loadRules(): Promise<Rules> {
  const rows = check(await supabase().from("ff_rules").select("merchant_key,category")) as { merchant_key: string; category: string }[];
  return Object.fromEntries(rows.map((r) => [r.merchant_key, r.category]));
}

export async function loadBudgets(): Promise<Budgets> {
  const rows = check(await supabase().from("ff_budgets").select("category,amount")) as { category: string; amount: number | string }[];
  return Object.fromEntries(rows.map((r) => [r.category, Number(r.amount)]));
}

/**
 * Enregistre un import : ignore les doublons (même empreinte), puis repère les virements
 * entre comptes sur les mois concernés et leurs voisins.
 */
export async function importTransactions(rows: NewTransaction[]): Promise<{ added: number; duplicates: number; linked: number }> {
  if (!rows.length) return { added: 0, duplicates: 0, linked: 0 };
  const user_id = await userId();
  let added = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, user_id }));
    const inserted = check(
      await supabase().from(TX).upsert(chunk, { onConflict: "user_id,fingerprint", ignoreDuplicates: true }).select("id"),
    ) as { id: string }[];
    added += inserted.length;
  }

  const months = rows.map((r) => r.date.slice(0, 7)).sort();
  const from = shiftMonth(months[0], -1) + "-01";
  const to = shiftMonth(months[months.length - 1], 2) + "-01";
  const window = (check(await supabase().from(TX).select(COLS).gte("date", from).lt("date", to)) as Row[]).map(fromRow);
  const changes = linkTransfers(window);
  for (const [fingerprint, category] of changes) {
    check(await supabase().from(TX).update({ category }).eq("fingerprint", fingerprint));
  }
  return { added, duplicates: rows.length - added, linked: Math.ceil(changes.size / 2) };
}

/**
 * Change la catégorie d'une opération, l'applique aux autres opérations du même marchand
 * (même sens) et mémorise la règle pour les prochains imports.
 */
export async function recategorize(tx: Transaction, category: string, all: Transaction[]): Promise<string[]> {
  const key = merchantKey(tx.raw);
  const ids = all
    .filter((t) => merchantKey(t.raw) === key && t.amount > 0 === tx.amount > 0 && (t.category !== category || t.id === tx.id))
    .map((t) => t.id);
  check(await supabase().from(TX).update({ category, manual: true }).in("id", ids));
  check(await supabase().from("ff_rules").upsert({ user_id: await userId(), merchant_key: key, category, updated_at: new Date().toISOString() }));
  return ids;
}

export async function setBudget(category: string, amount: number | null): Promise<void> {
  if (amount && amount > 0) {
    check(await supabase().from("ff_budgets").upsert({ user_id: await userId(), category, amount, updated_at: new Date().toISOString() }));
  } else {
    check(await supabase().from("ff_budgets").delete().eq("category", category));
  }
}

export async function deleteMonth(month: string): Promise<void> {
  check(await supabase().from(TX).delete().gte("date", month + "-01").lt("date", shiftMonth(month, 1) + "-01"));
}
