import { config, expenseCategories, isExpense, isNeed } from "./categories.ts";
import { myAmount, summarize, type MonthSummary, type Shares } from "./stats.ts";
import { merchantKey, shiftMonth } from "./text.ts";
import type { Budgets, Transaction } from "./types.ts";

type Tx = Pick<Transaction, "date" | "amount" | "category" | "account" | "raw" | "label">;

/** Les catégories « besoins » se règlent dans Réglages → Catégories ; le reste des dépenses = envies. */
const inMonth = (txs: Tx[], m: string) => txs.filter((t) => t.date.startsWith(m));
const round10 = (n: number) => Math.ceil(n / 10) * 10;
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
export const daysIn = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo, 0).getDate(); };

/** Les `count` derniers mois jusqu'à `month` (inclus) qui ont des données. */
export function monthlySeries(txs: Tx[], month: string, shares: Shares, count = 6) {
  const out: { month: string; spent: number; income: number; saved: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = shiftMonth(month, -i);
    const list = inMonth(txs, m);
    if (!list.length) continue;
    const s = summarize(list, shares);
    out.push({ month: m, spent: s.spent, income: s.income, saved: s.saved });
  }
  return out;
}

/** Dépenses cumulées jour après jour (index 0 = 1er du mois). */
export function cumulative(txs: Tx[], month: string, shares: Shares): number[] {
  const days = daysIn(month);
  const perDay = new Array(days).fill(0);
  for (const t of inMonth(txs, month)) {
    if (!isExpense(t.category)) continue;
    perDay[Number(t.date.slice(8, 10)) - 1] -= myAmount(t, shares);
  }
  let acc = 0;
  return perDay.map((v) => (acc += v));
}

export type Split = { income: number; needs: number; wants: number; rest: number };

/** Répartition des rentrées : besoins / envies / ce qui reste (épargné ou disponible). */
export function needsWants(s: MonthSummary): Split {
  let needs = 0, wants = 0;
  for (const [c, v] of Object.entries(s.byCategory)) (isNeed(c) ? (needs += v) : (wants += v));
  return { income: s.income, needs: Math.max(0, needs), wants: Math.max(0, wants), rest: s.income - needs - wants };
}

export const savingsRate = (s: MonthSummary) => (s.income > 0 ? (s.income - s.spent) / s.income : 0);

export type Advice = {
  tone: "good" | "warn" | "tip";
  title: string;
  text: string;
  action?: { label: string; budgets: Budgets };
};

/**
 * Conseils de gestion calculés sur tes opérations : rien de générique,
 * chaque conseil cite tes chiffres. Triés du plus important au moins important.
 */
export function advise(txs: Tx[], month: string, shares: Shares, budgets: Budgets, today = new Date()): Advice[] {
  const cur = inMonth(txs, month);
  const s = summarize(cur, shares);
  const out: (Advice & { w: number })[] = [];
  if (!cur.length) return [];

  const T = config().targets;
  const P = (x: number) => Math.round(x * 100) + " %";
  // 1. Taux d'épargne
  const rate = savingsRate(s);
  if (s.income > 0) {
    if (rate < 0) {
      out.push({ w: 100, tone: "warn", title: "Mois dans le rouge", text: `Tu as dépensé ${fmt(s.spent - s.income)} de plus que tes rentrées. Repère les 2 ou 3 catégories à freiner en priorité ci-dessous.` });
    } else if (rate < 0.1) {
      const gap = 0.1 * s.income - (s.income - s.spent);
      out.push({ w: 80, tone: "warn", title: `Taux d'épargne de ${Math.round(rate * 100)} %`, text: `Vise au moins 10 % de tes rentrées : il manque ${fmt(gap)} ce mois-ci pour y arriver.` });
    } else if (rate >= T.savings) {
      out.push({ w: 30, tone: "good", title: `${Math.round(rate * 100)} % de tes rentrées non dépensés`, text: `Au-dessus de ton objectif de ${P(T.savings)}. Si ce n'est pas déjà fait, programme un virement automatique vers ton épargne dès le jour de paie : ce qui part tout seul ne se dépense pas.` });
    } else {
      out.push({ w: 40, tone: "tip", title: `Taux d'épargne de ${Math.round(rate * 100)} %`, text: `Ton objectif est de ${P(T.savings)} : il te manquerait ${fmt(T.savings * s.income - (s.income - s.spent))} par mois pour l'atteindre.` });
    }
  }

  // 2. Envies et besoins vs tes repères
  const split = needsWants(s);
  if (s.income > 0 && split.wants / s.income > T.wants) {
    const excess = split.wants - T.wants * s.income;
    out.push({ w: 70, tone: "warn", title: `Les envies pèsent ${P(split.wants / s.income)} de tes rentrées`, text: `Ton repère est ${P(T.wants)} maximum, soit ${fmt(T.wants * s.income)}. Ramener tes envies à ce niveau libérerait ${fmt(excess)} par mois.` });
  }
  if (s.income > 0 && split.needs / s.income > T.needs) {
    out.push({ w: 68, tone: "warn", title: `Les besoins pèsent ${P(split.needs / s.income)} de tes rentrées`, text: `Au-dessus de ton repère de ${P(T.needs)}. Ce sont des charges fixes : c'est en renégociant (assurance, énergie, forfait) qu'on les fait baisser.` });
  }

  // 3. Achats répétés chez un même marchand
  const groups: Record<string, { n: number; sum: number; label: string; cat: string }> = {};
  for (const t of cur) {
    if (!isExpense(t.category) || t.amount >= 0) continue;
    const k = merchantKey(t.raw);
    groups[k] ??= { n: 0, sum: 0, label: t.label, cat: t.category };
    groups[k].n++;
    groups[k].sum -= myAmount(t, shares);
  }
  const repeat = Object.values(groups).filter((g) => g.n >= 4 && g.cat !== "Abonnements & téléphone").sort((a, b) => b.sum - a.sum)[0];
  if (repeat) {
    const cap = round10(repeat.sum * 0.5);
    out.push({
      w: 65, tone: "tip", title: `${repeat.n} achats « ${repeat.label} »`,
      text: `${fmt(repeat.sum)} au total, en petits montants qui passent inaperçus. Un plafond mensuel en ${repeat.cat} t'aide à les voir venir.`,
      action: budgets[repeat.cat] ? undefined : { label: `Plafonner ${repeat.cat} à ${fmt(cap)}`, budgets: { [repeat.cat]: cap } },
    });
  }

  // 4. Abonnements : le détail, annualisé
  const subs = Object.values(groups).filter((g) => g.cat === "Abonnements & téléphone").sort((a, b) => b.sum - a.sum);
  const subsTotal = s.byCategory["Abonnements & téléphone"] ?? 0;
  if (subsTotal > 50) {
    const top = subs.slice(0, 3).map((g) => `${g.label} ${fmt(g.sum)}`).join(", ");
    out.push({ w: 55, tone: "tip", title: `${fmt(subsTotal * 12)} d'abonnements par an`, text: `Les plus chers : ${top}. Fais le tri une fois par trimestre : chaque abonnement de 10 € résilié, c'est 120 € par an.` });
  }

  // 5. Restos vs courses
  const restos = s.byCategory["Restos & sorties"] ?? 0;
  const courses = s.byCategory["Courses"] ?? 0;
  if (restos > 100 && restos > courses * 1.5) {
    out.push({ w: 50, tone: "tip", title: `${fmt(restos)} en restos, ${fmt(courses)} en courses`, text: `Tu dépenses ${(restos / Math.max(courses, 1)).toFixed(1).replace(".", ",")} fois plus dehors qu'en courses. Deux repas maison de plus par semaine à la place d'un fast-food, c'est environ 80 € gardés par mois.` });
  }

  // 6. Écart par rapport à ta moyenne (si historique)
  const prevMonths = [1, 2, 3].map((d) => shiftMonth(month, -d)).filter((m) => inMonth(txs, m).length);
  if (prevMonths.length) {
    const avg: Record<string, number> = {};
    for (const m of prevMonths) for (const [c, v] of Object.entries(summarize(inMonth(txs, m), shares).byCategory)) avg[c] = (avg[c] ?? 0) + v / prevMonths.length;
    const jumps = Object.entries(s.byCategory).map(([c, v]) => [c, v - (avg[c] ?? 0)] as const).sort((a, b) => b[1] - a[1]);
    if (jumps[0] && jumps[0][1] > 50) out.push({ w: 60, tone: "warn", title: `+${fmt(jumps[0][1])} en ${jumps[0][0]}`, text: `Par rapport à ta moyenne des ${prevMonths.length} mois précédents. Achat exceptionnel ou nouvelle habitude ?` });
  }

  // 7. Projection de fin de mois (mois en cours)
  const curKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  if (month === curKey && today.getDate() < daysIn(month)) {
    const proj = (s.spent / today.getDate()) * daysIn(month);
    out.push({ w: 75, tone: proj > s.income && s.income > 0 ? "warn" : "tip", title: `À ce rythme : ${fmt(proj)} ce mois-ci`, text: `Projection à partir de tes ${today.getDate()} premiers jours.` });
  }

  // 8. Pas encore de budgets : on les propose à partir de tes dépenses
  if (!Object.keys(budgets).length) {
    const months = [month, ...prevMonths];
    const proposal: Budgets = {};
    for (const c of expenseCategories()) {
      const mean = months.reduce((acc, m) => acc + (summarize(inMonth(txs, m), shares).byCategory[c] ?? 0), 0) / months.length;
      if (mean >= 20) proposal[c] = round10(isNeed(c) ? mean : mean * 0.85);
    }
    if (Object.keys(proposal).length) {
      const total = Object.values(proposal).reduce((a, b) => a + b, 0);
      out.push({ w: 45, tone: "tip", title: "Fixe-toi des budgets", text: `Je te propose ${Object.keys(proposal).length} budgets basés sur tes dépenses, avec 15 % de moins sur les envies. Total ${fmt(total)} par mois. Tu pourras les ajuster catégorie par catégorie.`, action: { label: "Appliquer ces budgets", budgets: proposal } });
    }
  }

  return out.sort((a, b) => b.w - a.w).slice(0, 6).map(({ w: _w, ...a }) => a);
}
