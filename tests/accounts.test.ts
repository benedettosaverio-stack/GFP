// npm test — plusieurs comptes : Revolut (export français), livret, compte joint
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_OWNER_NAMES = "JEAN DUPONT";
const { parseCSV } = await import("../lib/parse/csv.ts");
const { toNewTransactions } = await import("../lib/categorize.ts");
const { linkTransfers } = await import("../lib/transfers.ts");
const { summarize } = await import("../lib/stats.ts");

const REVOLUT_FR = [
  "Type,Produit,Date de début,Date de fin,Description,Montant,Frais,Devise,État,Solde",
  "Virement,Courant,2026-10-01 09:00:00,2026-10-01 09:00:01,À EUR Compte d&#39;épargne,-1500.00,0.00,EUR,TERMINÉ,100.00",
  "Virement,Épargne,2026-10-01 09:00:00,2026-10-01 09:00:01,À EUR Compte d&#39;épargne,1500.00,0.00,EUR,TERMINÉ,1500.00",
  "Intérêts,Épargne,2026-10-02 01:00:00,2026-10-02 01:00:00,Intérêts nets versés pour Compte d&#39;épargne,0.06,0.00,EUR,TERMINÉ,1500.06",
  "Virement,Courant,2026-10-02 10:00:00,2026-10-02 10:00:01,Virement à : MARIE MARTIN & JEAN PAUL DUPONT,-500.00,0.00,EUR,TERMINÉ,0.00",
  "Recharge,Courant,2026-10-04 10:00:00,2026-10-04 10:00:01,Recharge sur Apple Pay via *****,23.00,0.00,EUR,TERMINÉ,23.00",
  "Paiement par carte,Courant,2026-10-06 12:00:00,2026-10-07 08:00:00,Carrefour,-9.04,0.00,EUR,TERMINÉ,13.96",
  "Paiement par carte,Courant,2026-10-26 12:00:00,2026-10-27 08:00:00,Resto Sas Friterie,-13.30,0.00,EUR,TERMINÉ,0.66",
  "Paiement par carte,Courant,2026-10-28 12:00:00,,Ryanair,-89.00,0.00,EUR,EN ATTENTE,0.66",
  "Virement,Courant,2026-10-05 10:00:00,2026-10-05 10:00:01,Paiement envoyé par CAF DU NORD,369.00,0.00,EUR,TERMINÉ,369.66",
].join("\n");

test("Revolut export français : sous-comptes ignorés, opérations en attente ignorées, catégories", () => {
  const st = parseCSV(REVOLUT_FR, "account-statement.csv");
  assert.equal(st.source, "Revolut");
  const tx = toNewTransactions({ ...st, account: "revolut-perso" });
  const cat = Object.fromEntries(tx.map((t) => [t.raw, t.category]));
  assert.equal(tx.length, 6); // 2 lignes du coffre « Épargne » et 1 en attente écartées
  assert.equal(cat["À EUR Compte d'épargne"], "Épargne & placements");
  assert.equal(cat["Virement à : MARIE MARTIN & JEAN PAUL DUPONT"], "Virement interne"); // vers le compte joint
  assert.equal(cat["Recharge sur Apple Pay via *****"], "Virement interne");
  assert.equal(cat["Carrefour"], "Courses");
  assert.equal(cat["Resto Sas Friterie"], "Restos & sorties");
  assert.equal(cat["Paiement envoyé par CAF DU NORD"], "Autres revenus");
});

test("livret : rien n'est dépense ni rentrée, sauf les intérêts ; l'épargne n'est comptée qu'une fois", () => {
  const courant = toNewTransactions({ source: "Banque", account: "courant", transactions: [
    { date: "2026-10-28", raw: "VIR vers LIVRET A", amount: -400, extra: "" },
  ] });
  const livret = toNewTransactions({ source: "Banque", account: "livret", transactions: [
    { date: "2026-10-28", raw: "VIR RECU 7788", amount: 400, extra: "" },
    { date: "2026-10-31", raw: "INTERETS ANNUELS", amount: 3.1, extra: "" },
    { date: "2026-10-15", raw: "VIR EMIS 1122", amount: -50, extra: "" },
  ] }, {}, "epargne");
  assert.deepEqual(livret.map((t) => t.category), ["Virement interne", "Autres revenus", "Virement interne"]);
  const s = summarize([...courant, ...livret]);
  assert.equal(s.saved, 400);
  assert.equal(s.income, 3.1);
  assert.equal(s.spent, 0);
});

test("compte joint : seule ta part des dépenses compte, les versements ne sont pas des revenus", () => {
  const perso = toNewTransactions({ source: "Revolut", account: "perso", transactions: [
    { date: "2026-10-02", raw: "Virement à : MARIE MARTIN & JEAN PAUL DUPONT", amount: -500, extra: "" },
  ] });
  const joint = toNewTransactions({ source: "Revolut", account: "joint", transactions: [
    { date: "2026-10-02", raw: "Paiement envoyé par JEAN DUPONT", amount: 500, extra: "" },
    { date: "2026-10-03", raw: "Paiement envoyé par MARIE MARTIN", amount: 500, extra: "" },
    { date: "2026-10-10", raw: "Lidl", amount: -120, extra: "" },
    { date: "2026-10-12", raw: "EDF", amount: -80, extra: "" },
  ] }, {}, "joint");
  const all = [...perso, ...joint];
  const changes = linkTransfers(all);
  const after = all.map((t) => ({ ...t, category: changes.get(t.fingerprint) ?? t.category }));
  const s = summarize(after, { joint: 0.5 });
  assert.equal(s.income, 0);
  assert.equal(s.spent, 100); // (120 + 80) × 50 %
  assert.equal(s.byCategory["Courses"], 60);
  assert.equal(s.byCategory["Logement & charges"], 40);
});
