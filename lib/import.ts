"use client";
import { supabase } from "./supabase";
import { parseCSV } from "./parse/csv";
import { toNewTransactions } from "./categorize";
import { importTransactions } from "./db";
import type { Account, ParsedStatement, Rules } from "./types";

export async function readStatement(file: File): Promise<ParsedStatement> {
  const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  if (!isPdf) return parseCSV(await file.text(), file.name);

  const { data } = await supabase().auth.getSession();
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/parse-pdf", {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body,
  });
  const json = await res.json().catch(() => ({ error: "Réponse illisible" }));
  if (!res.ok) throw new Error(json.error ?? "Import impossible");
  return json as ParsedStatement;
}

export type ImportResult = { added: number; duplicates: number; linked: number; months: string[] };

/** Enregistre un relevé déjà lu, rattaché au compte choisi. */
export async function importStatement(statement: ParsedStatement, account: Account, rules: Rules): Promise<ImportResult> {
  const rows = toNewTransactions({ ...statement, account: account.key }, rules, account.kind);
  const r = await importTransactions(rows);
  return { ...r, months: [...new Set(rows.map((t) => t.date.slice(0, 7)))].sort() };
}
