import { norm, parseDateAny, parseNumberAny } from "../text.ts";
import type { ParsedStatement, ParsedTx } from "../types.ts";

function splitLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let quoted = false;
  let cell = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (ch === sep && !quoted) { cells.push(cell); cell = ""; }
    else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

/** Export CSV : Revolut, ou export bancaire générique (Date / Libellé / Montant ou Débit+Crédit). */
export function parseCSV(text: string, fileName = "CSV"): ParsedStatement {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  let head = lines.findIndex((l) => /date/i.test(l) && /(montant|amount|d[ée]bit|cr[ée]dit)/i.test(l));
  if (head < 0) head = 0;
  const headerLine = lines[head] ?? "";
  const sep = (headerLine.match(/;/g) ?? []).length >= (headerLine.match(/,/g) ?? []).length ? ";" : ",";
  const H = splitLine(headerLine, sep).map(norm);
  const find = (...keys: string[]) => H.findIndex((h) => keys.some((k) => h === k || h.includes(k)));

  const isRevolut = H.includes("PRODUCT") && H.includes("COMPLETED DATE");
  let iDate = H.indexOf("COMPLETED DATE");
  if (iDate < 0) iDate = H.indexOf("STARTED DATE");
  if (iDate < 0) iDate = find("DATE OPERATION", "DATE DE L OPERATION", "DATE");
  const iLabel = find("DESCRIPTION", "LIBELLE", "LABEL", "OPERATION", "INTITULE", "DETAIL");
  const iAmount = find("MONTANT", "AMOUNT");
  const iDebit = find("DEBIT");
  const iCredit = find("CREDIT");
  const iFee = H.indexOf("FEE");
  const iState = H.indexOf("STATE");
  const iType = H.indexOf("TYPE");

  const transactions: ParsedTx[] = [];
  for (const line of lines.slice(head + 1)) {
    const c = splitLine(line, sep);
    const date = parseDateAny(c[iDate]);
    if (!date) continue;
    if (iState >= 0 && c[iState] && !/COMPLETED|TERMIN/i.test(c[iState])) continue; // opérations en attente
    let amount: number;
    if (iAmount >= 0 && c[iAmount] !== "") amount = parseNumberAny(c[iAmount]);
    else {
      const de = parseNumberAny(c[iDebit]);
      const cr = parseNumberAny(c[iCredit]);
      amount = (isNaN(cr) ? 0 : Math.abs(cr)) - (isNaN(de) ? 0 : Math.abs(de));
    }
    if (iFee >= 0) {
      const fee = parseNumberAny(c[iFee]);
      if (!isNaN(fee) && fee) amount -= Math.abs(fee);
    }
    if (isNaN(amount) || amount === 0) continue;
    let raw = c[iLabel] ?? "";
    if (isRevolut && iType >= 0 && /TOPUP|TOP-UP|EXCHANGE/i.test(c[iType] ?? "")) raw = "TOP-UP " + raw;
    transactions.push({ date, raw, amount, extra: "" });
  }

  const source = isRevolut ? "Revolut" : "CSV";
  return { source, account: isRevolut ? "Revolut" : fileName.replace(/\.[^.]+$/, ""), transactions };
}
