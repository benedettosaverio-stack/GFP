// npm test — indicateurs et conseils
import { test } from "node:test";
import assert from "node:assert/strict";
import { advise, cumulative, needsWants, savingsRate } from "../lib/analysis.ts";
import { summarize } from "../lib/stats.ts";

const tx = (date: string, raw: string, amount: number, category: string) => ({ date, raw, label: raw, amount, category, account: "a" });
const oct = [
  tx("2026-10-28", "VIR SALAIRE", 2000, "Salaire"),
  tx("2026-10-02", "LIDL", -100, "Courses"),
  tx("2026-10-05", "PIZZA", -300, "Restos & sorties"),
  ...[3, 9, 12, 20, 25].map((d) => tx(`2026-10-${String(d).padStart(2, "0")}`, "CARTE PLAYSTATION", -20, "Loisirs & jeux")),
  tx("2026-10-07", "SPOTIFY", -12, "Abonnements & téléphone"),
];

test("taux d'épargne et répartition besoins / envies", () => {
  const s = summarize(oct);
  assert.equal(s.spent, 512);
  assert.equal(Math.round(savingsRate(s) * 1000), 744);
  const n = needsWants(s);
  assert.deepEqual([n.needs, n.wants, n.rest], [100, 412, 1488]);
});

test("dépenses cumulées sur le mois", () => {
  const c = cumulative(oct, "2026-10", {});
  assert.equal(c.length, 31);
  assert.equal(c[0], 0);
  assert.equal(c[1], 100);
  assert.equal(c[30], 512);
});

test("conseils : achats répétés avec plafond proposé, restos, budgets proposés", () => {
  const a = advise(oct, "2026-10", {}, {}, new Date("2026-11-20"));
  const titles = a.map((x) => x.title);
  assert.ok(titles.some((t) => t.startsWith("5 achats")));
  assert.ok(titles.some((t) => t.includes("en restos")));
  const repeat = a.find((x) => x.title.startsWith("5 achats"))!;
  assert.deepEqual(repeat.action?.budgets, { "Loisirs & jeux": 50 });
  assert.ok(a.some((x) => x.action?.label === "Appliquer ces budgets"));
});
