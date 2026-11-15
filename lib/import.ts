"use client";
import { supabase } from "./supabase";
import { parseCSV } from "./parse/csv";
import { toNewTransactions } from "./categorize";
import { importTransactions } from "./db";
import type { ParsedStatement, Rules } from "./types";

async function readStatement(file: File): Promise<ParsedStatement> {
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

export type ImportResult = { added: number; duplicates: number; linked: number; failed: string[]; months: string[] };

/** Lit chaque fichier (PDF via le serveur, CSV dans le navigateur), catégorise et enregistre. */
export async function importFiles(files: File[], rules: Rules): Promise<ImportResult> {
  const result: ImportResult = { added: 0, duplicates: 0, linked: 0, failed: [], months: [] };
  for (const file of files) {
    try {
      const statement = await readStatement(file);
      if (!statement.transactions.length) throw new Error("vide");
      const rows = toNewTransactions(statement, rules);
      const r = await importTransactions(rows);
      result.added += r.added;
      result.duplicates += r.duplicates;
      result.linked += r.linked;
      result.months.push(...rows.map((t) => t.date.slice(0, 7)));
    } catch (e) {
      console.error(file.name, e);
      result.failed.push(file.name);
    }
  }
  result.months = [...new Set(result.months)].sort();
  return result;
}
