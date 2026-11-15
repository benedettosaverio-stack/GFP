import { norm, parseAmountFR } from "../text.ts";
import type { ParsedStatement, ParsedTx } from "../types.ts";

/** Fragment de texte d'une page PDF (issu de pdf.js). */
export type TextItem = { str: string; x: number; y: number; width?: number; rotated?: boolean };

const TX_LINE = /(?:^|\s)(\d{2})\/(\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+(\d{1,3}(?:[  ]\d{3})*,\d{2})$/;
const CREDIT_SECTION = /VIREMENTS RECUS|REMISES|CREDITS|VERSEMENTS/;
const DEBIT_SECTION = /VIREMENTS EMIS|PRELEVEMENTS|PAIEMENTS PAR CARTE|RETRAITS|FRAIS|CHEQUES/;
const SKIP_LINE = /^TOTAL DES OPERATIONS|^NOUVEAU SOLDE|^ANCIEN SOLDE|SOUS-TOTAL|^EMIS LE|RELEVE DE COMPTE|^PAGE \d|TITULAIRE/;

/**
 * Relevé PDF au format « JJ/MM  JJ/MM/AAAA  Libellé  Montant » (Allianz Banque et formats proches).
 * Le sens (débit/crédit) vient de la section du relevé, sinon de la colonne du montant.
 */
export function parseStatementPages(pages: TextItem[][]): ParsedStatement {
  const out: ParsedTx[] = [];
  let section = 0; // +1 crédits, -1 débits
  let debitX: number | null = null;
  let creditX: number | null = null;
  let current: ParsedTx | null = null;
  const flush = () => {
    if (current) out.push(current);
    current = null;
  };

  for (const items of pages) {
    const rows: { y: number; items: TextItem[] }[] = [];
    items
      .filter((i) => i.str.trim() && !i.rotated) // les mentions verticales en marge cassent les lignes
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .forEach((i) => {
        let row = rows.find((r) => Math.abs(r.y - i.y) < 2.5);
        if (!row) rows.push((row = { y: i.y, items: [] }));
        row.items.push(i);
      });
    rows.sort((a, b) => b.y - a.y);

    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      const text = row.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      const T = norm(text);
      const hasFullDate = /\d{2}\/\d{2}\/\d{4}/.test(T);

      const d = row.items.find((i) => /^D[ée]bit$/i.test(i.str.trim()));
      const c = row.items.find((i) => /^Cr[ée]dit$/i.test(i.str.trim()));
      if (d && c) { debitX = d.x; creditX = c.x; continue; }
      if (CREDIT_SECTION.test(T) && !hasFullDate) { flush(); section = 1; continue; }
      if (DEBIT_SECTION.test(T) && !hasFullDate) { flush(); section = -1; continue; }
      if (SKIP_LINE.test(T)) { flush(); continue; }

      const m = text.match(TX_LINE);
      if (m) {
        flush();
        let sign = section || -1;
        if (!section && debitX !== null && creditX !== null) {
          const last = row.items[row.items.length - 1];
          const right = last.x + (last.width ?? 0);
          sign = Math.abs(right - (creditX + 30)) < Math.abs(right - (debitX + 25)) ? 1 : -1;
        }
        let year = Number(m[5]);
        if (Number(m[4]) === 1 && Number(m[2]) === 12) year -= 1; // opération de décembre valeur janvier
        current = { date: `${year}-${m[2]}-${m[1]}`, raw: m[6], amount: sign * parseAmountFR(m[7]), extra: "" };
      } else if (current && !/^\d{2}\/\d{2}\s/.test(text) && current.extra.length < 200) {
        current.extra += " " + text;
      }
    }
    flush();
  }

  const all = norm(pages.flat().map((i) => i.str).join(" "));
  const source = /ALLIANZ BANQUE/.test(all) ? "Allianz" : /REVOLUT/.test(all) ? "Revolut" : "Banque";
  const acc = all.match(/COMPTE\s+(\d[\d ]{5,}\d)/);
  const account = source + (acc ? " ••" + acc[1].replace(/\s/g, "").slice(-4) : "");
  return { source, account, transactions: out };
}
