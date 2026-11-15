// npm test — compte joint en mode « Vie commune »
import { test } from "node:test";
import assert from "node:assert/strict";
import { household, jointLinks, shiftSalary, withVieCommune } from "../lib/household.ts";
import { summarize } from "../lib/stats.ts";
import { categorize, toNewTransactions } from "../lib/categorize.ts";

let n = 0;
const tx = (account: string, date: string, raw: string, amount: number, category: string) =>
  ({ id: String(++n), date, label: raw, raw, amount, category, account, manual: false });

const txs = [
  tx("perso", "2026-10-01", "VIR SALAIRE", 2000, "Salaire"),
  tx("perso", "2026-10-02", "LIDL", -50, "Courses"),
  tx("perso", "2026-10-03", "VIR VERS COMPTE JOINT", -400, "Virement interne"),
  tx("joint", "2026-10-04", "FROM MOI", 400, "Virement interne"),
  tx("joint", "2026-10-04", "FROM MANON", 400, "Virement interne"),
  tx("joint", "2026-10-05", "CAF DU NORD", 300, "Aides & allocations"),
  tx("joint", "2026-10-06", "LOYER", -900, "Logement & charges"),
  tx("joint", "2026-10-07", "CARREFOUR", -150, "Courses"),
];
const joint = new Set(["joint"]);

test("un virement vers le joint devient ta dépense Vie commune, le joint sort de ton budget", () => {
  const links = jointLinks(txs, joint);
  assert.equal(links.mine.size, 1);
  const mine = withVieCommune(txs, links.mine);
  const s = summarize(mine, { joint: 0 });
  assert.equal(s.income, 2000); // la CAF du foyer ne gonfle pas tes revenus
  assert.equal(s.spent, 450); // 50 de courses + 400 de vie commune
  assert.equal(s.byCategory["Vie commune"], 400);
});

test("le compte joint : qui l'alimente et où part l'argent", () => {
  const links = jointLinks(txs, joint);
  const h = household(withVieCommune(txs, links.mine), joint, links.fromMe);
  assert.equal(h.myContribution, 400);
  assert.deepEqual(h.inflows, { me: 400, partner: 400, aids: 300, other: 0 });
  assert.equal(h.spent, 1050);
  assert.equal(h.balance, 50);
});

test("la CAF reçue sur le joint reste une aide, pas un simple versement", () => {
  assert.equal(categorize("VIR CAF DU NORD PRESTATIONS", 312, ""), "Aides & allocations");
  const [row] = toNewTransactions({ account: "j", source: "Revolut", transactions: [{ date: "2026-10-05", raw: "CAF DU NORD", amount: 312, extra: "" }] }, {}, "joint");
  assert.equal(row.category, "Aides & allocations");
  assert.equal(categorize("CAFE DE LA GARE", -4, ""), "Restos & sorties");
});

test("le salaire de fin de mois compte pour le mois suivant", () => {
  const list = [
    { date: "2026-10-28", category: "Salaire", amount: 1800 },
    { date: "2026-12-30", category: "Salaire", amount: 1800 },
    { date: "2026-10-05", category: "Salaire", amount: 100 },
    { date: "2026-10-29", category: "Courses", amount: -40 },
  ];
  const out = shiftSalary(list, 20);
  assert.deepEqual(out.map((t) => t.date), ["2026-11-01", "2027-01-01", "2026-10-05", "2026-10-29"]);
  assert.equal(out[0].paidOn, "2026-10-28");
});
