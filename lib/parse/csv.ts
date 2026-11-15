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

const SUB_PRODUCT = /SAVING|EPARGNE|DEPOSIT|INVEST|ROBO|VAULT|COFFRE|POCHE|CRYPTO|COMMODIT|STOCK|ACTION|PENSION/;

const decodeEntities = (s: string) =>
  s.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Export CSV : Revolut, ou export bancaire générique (Date / Libellé / Montant ou Débit+Crédit). */
export function parseCSV(text: string, fileName = "CSV"): ParsedStatement {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  let head = lines.findIndex((l) => /date/i.test(l) && /(montant|amount|d[ée]bit|cr[ée]dit)/i.test(l));
  if (head < 0) head = 0;
  const headerLine = lines[head] ?? "";
  const sep = (headerLine.match(/;/g) ?? []).length >= (headerLine.match(/,/g) ?? []).length ? ";" : ",";
  const H = splitLine(headerLine, sep).map(norm);
  const find = (...keys: string[]) => H.findIndex((h) => keys.some((k) => h === k || h.includes(k)));

  // Revolut : export anglais (Product, Completed Date…) ou français (Produit, Date de fin…)
  const iProduct = H.findIndex((h) => h === "PRODUCT" || h === "PRODUIT");
  const isRevolut = iProduct >= 0 && H.some((h) => /COMPLETED DATE|STARTED DATE|DATE DE FIN|DATE DE DEBUT/.test(h));
  let iDate = H.findIndex((h) => h === "COMPLETED DATE" || h === "DATE DE FIN");
  if (iDate < 0) iDate = H.findIndex((h) => h === "STARTED DATE" || h === "DATE DE DEBUT");
  const iStart = H.findIndex((h) => h === "STARTED DATE" || h === "DATE DE DEBUT");
  if (iDate < 0) iDate = find("DATE OPERATION", "DATE DE L OPERATION", "DATE");
  const iLabel = find("DESCRIPTION", "LIBELLE", "LABEL", "OPERATION", "INTITULE", "DETAIL");
  const iAmount = find("MONTANT", "AMOUNT");
  const iDebit = find("DEBIT");
  const iCredit = find("CREDIT");
  const iFee = H.findIndex((h) => h === "FEE" || h === "FRAIS");
  const iState = H.findIndex((h) => h === "STATE" || h === "ETAT");
  const iType = H.indexOf("TYPE");

  const transactions: ParsedTx[] = [];
  for (const line of lines.slice(head + 1)) {
    const c = splitLine(line, sep);
    // Revolut liste aussi les mouvements internes de ses sous-comptes (coffre d'épargne, investissement…) :
    // ils doublonnent ceux du compte courant, on ne garde que le compte principal.
    if (isRevolut && SUB_PRODUCT.test(norm(c[iProduct]))) continue;
    const date = parseDateAny(c[iDate]) ?? (iStart >= 0 ? parseDateAny(c[iStart]) : null);
    if (!date) continue;
    if (iState >= 0 && c[iState] && !/COMPLETED|TERMIN/.test(norm(c[iState]))) continue; // en attente, annulées, refusées
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
    let raw = decodeEntities(c[iLabel] ?? "");
    if (isRevolut && iType >= 0 && /TOPUP|TOP-UP|EXCHANGE/i.test(c[iType] ?? "")) raw = "TOP-UP " + raw;
    transactions.push({ date, raw, amount, extra: "" });
  }

  const source = isRevolut ? "Revolut" : "CSV";
  return { source, account: isRevolut ? "Revolut" : fileName.replace(/\.[^.]+$/, ""), transactions };
}
