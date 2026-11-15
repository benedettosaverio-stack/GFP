// npm test — logique métier sur des données fictives
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatementPages, type TextItem } from "../lib/parse/statement.ts";
import { parseCSV } from "../lib/parse/csv.ts";
import { categorize, toNewTransactions } from "../lib/categorize.ts";
import { linkTransfers } from "../lib/transfers.ts";
import { summarize } from "../lib/stats.ts";
import { merchantKey } from "../lib/text.ts";

// Construit une page PDF fictive : une ligne = [texte à gauche…, montant, x du montant]
function page(lines: (string | [string, string, number])[], startY = 700): TextItem[] {
  const items: TextItem[] = [];
  lines.forEach((l, i) => {
    const y = startY - i * 10;
    if (typeof l === "string") items.push({ str: l, x: 60, y });
    else {
      items.push({ str: l[0], x: 60, y });
      items.push({ str: l[1], x: l[2], y });
    }
  });
  return items;
}

test("relevé PDF : sections, montants, lignes de détail, pied de page vertical", () => {
  const p1 = page([
    "Relevé de Compte Compte 12345678 90",
    "ALLIANZ BANQUE",
    "VIREMENTS RECUS Sous-total : +1 662,71 €",
    ["28/10 28/10/2026 VIR EMPLOYEUR SA", "1 562,71", 520],
    ["19/10 19/10/2026 VIR de LIVRET A", "100,00", 520],
    "VIREMENTS EMIS ET PRELEVEMENTS Sous-total : -56,99 €",
    ["02/10 02/10/2026 PRLV SEPA AMAZON EU SARL, SUCCURSALE F", "6,99", 450],
    "D01-6021681 Amazon Prime FR",
    ["07/10 07/10/2026 PRLV SEPA Nemoris Legacy", "50,00", 450],
    "PAIEMENTS PAR CARTES Sous-total : -12,14 €",
    ["13/10 13/10/2026 CARTE 12/10 Spotify France PARIS", "12,14", 450],
  ]);
  p1.push({ str: "Émis le 31/10/2026", x: 20, y: 640, rotated: true }); // mention verticale en marge
  const st = parseStatementPages([p1]);
  assert.equal(st.source, "Allianz");
  assert.equal(st.transactions.length, 5);
  const [salary, livret, prime, , spotify] = st.transactions;
  assert.deepEqual([salary.date, salary.amount], ["2026-10-28", 1562.71]);
  assert.equal(livret.amount, 100);
  assert.equal(prime.amount, -6.99);
  assert.match(prime.extra, /Amazon Prime/);
  assert.equal(spotify.amount, -12.14);
});

test("catégorisation par mots-clés et règles apprises", () => {
  assert.equal(categorize("CARTE 11/10 SHELL 7603 QUIEVRAIN", -50, ""), "Carburant & péages");
  assert.equal(categorize("CARTE 09/10 PLAYSTATION Hilversum", -9.99, ""), "Loisirs & jeux"); // pas « carburant » via STATION
  assert.equal(categorize("CARTE 01/10 DAC AUCHAN CARBU VALENCIENNES", -60, ""), "Carburant & péages");
  assert.equal(categorize("PRLV SEPA AMAZON EU SARL", -6.99, "Amazon Prime FR"), "Abonnements & téléphone");
  assert.equal(categorize("VIR vers LIVRET A", -400, ""), "Épargne & placements");
  assert.equal(categorize("VIR INST vers COMPTE REVOLUT", -150, ""), "Virement interne");
  assert.equal(categorize("VIR CPAM DU HAINAUT", 62.48, ""), "Remboursements");
  assert.equal(categorize("VIR INCONNU", 20, ""), "Autres revenus");
  const rules = { [merchantKey("CARTE 05/10 NOUVEL HAIR SC")]: "Shopping & vêtements" };
  assert.equal(categorize("CARTE 06/11 NOUVEL HAIR SC VALENCIENNES", -22, "", rules), "Shopping & vêtements");
});

test("CSV Revolut : opérations terminées seulement, recharges = virement interne", () => {
  const csv = [
    "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
    "TOPUP,Current,2026-10-17 10:01:02,2026-10-17 10:01:05,Payment from X,150.00,0.00,EUR,COMPLETED,150.00",
    "CARD_PAYMENT,Current,2026-10-18 12:00:00,2026-10-19 08:00:00,Uber Eats,-23.50,0.00,EUR,COMPLETED,126.50",
    "CARD_PAYMENT,Current,2026-10-22 12:00:00,,Ryanair,-89.00,0.00,EUR,PENDING,37.50",
  ].join("\n");
  const st = parseCSV(csv);
  assert.equal(st.source, "Revolut");
  const tx = toNewTransactions(st);
  assert.equal(tx.length, 2);
  assert.equal(tx[0].category, "Virement interne");
  assert.equal(tx[1].category, "Restos & sorties");
});

test("CSV bancaire générique Débit / Crédit au format français", () => {
  const st = parseCSV("Date;Libellé;Débit;Crédit\n03/11/2026;CB CARREFOUR MARLY;45,20;\n05/11/2026;VIR SALAIRE NOVEMBRE;;1 562,71\n", "export.csv");
  const tx = toNewTransactions(st);
  assert.deepEqual(tx.map((t) => [t.date, t.amount, t.category]), [
    ["2026-11-03", -45.2, "Courses"],
    ["2026-11-05", 1562.71, "Salaire"],
  ]);
});

test("virements entre deux comptes : ni rentrée ni dépense, épargne comptée une fois", () => {
  const courant = toNewTransactions({ source: "Banque", account: "Courant", transactions: [
    { date: "2026-10-28", raw: "VIR vers LIVRET A", amount: -400, extra: "" },
    { date: "2026-10-17", raw: "VIR SEPA EMIS XYZ", amount: -150, extra: "" },
    { date: "2026-10-20", raw: "CARTE LIDL", amount: -30, extra: "" },
  ] });
  const autre = toNewTransactions({ source: "Banque", account: "Livret", transactions: [
    { date: "2026-10-29", raw: "VIR RECU REF 123", amount: 400, extra: "" },
    { date: "2026-10-18", raw: "VIR RECU REF 456", amount: 150, extra: "" },
    { date: "2026-10-31", raw: "INTERETS", amount: 1.2, extra: "" },
  ] });
  const all = [...courant, ...autre];
  const changes = linkTransfers(all);
  const after = all.map((t) => ({ ...t, category: changes.get(t.fingerprint) ?? t.category }));
  const s = summarize(after);
  assert.equal(s.income, 1.2); // seuls les intérêts sont une vraie rentrée
  assert.equal(s.spent, 30);
  assert.equal(s.saved, 400);
});

test("empreintes : réimporter le même relevé ne crée pas de doublon, deux achats identiques restent distincts", () => {
  const st = { source: "Banque", account: "Courant", transactions: [
    { date: "2026-10-12", raw: "CARTE PLAYSTATION", amount: -4.99, extra: "" },
    { date: "2026-10-12", raw: "CARTE PLAYSTATION", amount: -4.99, extra: "" },
  ] };
  const a = toNewTransactions(st).map((t) => t.fingerprint);
  const b = toNewTransactions(st).map((t) => t.fingerprint);
  assert.notEqual(a[0], a[1]);
  assert.deepEqual(a, b);
});
