"use client";
import { supabase } from "./supabase";
import { INTERNAL, SAVINGS } from "./categories";
import { scrub } from "./scrub";
import { summarize, type Shares } from "./stats";
import { monthLabel, norm } from "./text";
import type { Account, Budgets, Transaction } from "./types";
import type { Settings } from "./settings";

export type ChatMsg = { role: "user" | "assistant"; content: string };

async function call<T>(body: object): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
  return json as T;
}

export async function aiStatus(): Promise<boolean> {
  try { return Boolean((await (await fetch("/api/ai")).json()).enabled); } catch { return false; }
}

export async function aiCategorize(items: Transaction[], categories: string[]): Promise<Record<string, string>> {
  const { suggestions } = await call<{ suggestions: Record<string, string> }>({
    action: "categorize",
    categories,
    items: items.map((t) => ({ id: t.id, label: scrub(`${t.label} ${norm(t.raw) !== norm(t.label) ? t.raw : ""}`.trim()), amount: t.amount })),
  });
  return suggestions;
}

export const aiChat = (context: string, messages: ChatMsg[]) => call<{ answer: string }>({ action: "chat", context, messages }).then((r) => r.answer);
export const aiReview = (context: string, month: string) => call<{ answer: string }>({ action: "review", context, month: monthLabel(month) }).then((r) => r.answer);

const e = (n: number) => `${Math.round(n)} €`;

/**
 * Contexte envoyé à l'IA : réglages utiles, synthèse mois par mois (12 mois), puis le détail
 * des opérations des 6 derniers mois — libellés nettoyés, sans nom ni numéro de compte.
 */
export function buildContext(o: {
  txs: Transaction[]; months: string[]; month: string; shares: Shares; accounts: Account[]; budgets: Budgets; settings: Settings;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const accName: Record<string, string> = {};
  const kinds: Record<string, string> = { courant: "compte courant", epargne: "épargne", joint: "compte joint" };
  o.accounts.forEach((a, i) => (accName[a.key] = `${scrub(a.label)} (${kinds[a.kind] ?? a.kind}${a.kind === "joint" ? `, part ${Math.round(a.share * 100)} %` : ""})` || `compte ${i + 1}`));

  const lines: string[] = [];
  lines.push(`Aujourd'hui : ${today}. Mois affiché dans l'appli : ${monthLabel(o.month)}.`);
  lines.push(`Comptes : ${o.accounts.map((a) => accName[a.key]).join(" ; ") || "aucun"}.`);
  lines.push(o.settings.jointMode === "commune"
    ? "Compte joint : mode Vie commune (seuls ses versements au joint comptent dans son budget perso)."
    : "Compte joint : sa part de chaque opération compte dans son budget.");
  if (o.settings.partnerName) lines.push(`L'autre titulaire du compte joint s'appelle ${o.settings.partnerName}.`);
  if (o.settings.salaryShiftDay > 0) lines.push(`Salaire versé à partir du ${o.settings.salaryShiftDay} : compté pour le mois suivant.`);
  const t = o.settings.targets;
  lines.push(`Objectifs : épargner ${Math.round(t.savings * 100)} % des rentrées, besoins ≤ ${Math.round(t.needs * 100)} %, envies ≤ ${Math.round(t.wants * 100)} %.`);
  const budgets = Object.entries(o.budgets).filter(([, v]) => v > 0);
  if (budgets.length) lines.push(`Budgets mensuels : ${budgets.map(([c, v]) => `${c} ${e(v)}`).join(", ")}.`);

  lines.push("", "Synthèse par mois (son budget perso) :");
  for (const m of o.months.slice(-12)) {
    const s = summarize(o.txs.filter((x) => x.date.startsWith(m)), o.shares);
    const cats = Object.entries(s.byCategory).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${e(v)}`).join(", ");
    lines.push(`- ${monthLabel(m)} : rentrées ${e(s.income)}, dépenses ${e(s.spent)}, épargne ${e(s.saved)}. Détail : ${cats || "—"}`);
  }

  const since = o.months.slice(-6)[0] ?? o.month;
  const recent = o.txs.filter((x) => x.date.slice(0, 7) >= since).sort((a, b) => a.date.localeCompare(b.date)).slice(-900);
  lines.push("", `Opérations depuis ${monthLabel(since)} (date | libellé | montant | catégorie | compte) :`);
  for (const x of recent) {
    const note = x.paidOn ? ` (versé le ${x.paidOn}, compté pour le mois suivant)` : "";
    const kind = x.category === INTERNAL ? " [entre ses comptes]" : x.category === SAVINGS ? " [épargne]" : "";
    lines.push(`${x.date} | ${scrub(x.label)} | ${x.amount.toFixed(2)} | ${x.category}${kind} | ${accName[x.account] ?? "compte"}${note}`);
  }
  return lines.join("\n");
}
