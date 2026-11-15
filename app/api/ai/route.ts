import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.AI_MODEL || "claude-haiku-5-5";
const KEY = () => process.env.ANTHROPIC_API_KEY;
/** Liste d'identifiants Supabase autorisés (séparés par des virgules). Vide = tout utilisateur connecté. */
const ALLOWED = () => (process.env.AI_ALLOWED_USERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

type Msg = { role: "user" | "assistant"; content: string };
type Body =
  | { action: "categorize"; categories: string[]; items: { id: string; label: string; amount: number }[] }
  | { action: "chat"; context: string; messages: Msg[] }
  | { action: "review"; context: string; month: string };

const STYLE = `Tu es l'assistant financier intégré à GFP, l'appli de suivi des dépenses de l'utilisateur.
Tu réponds en français, sur un ton direct et bienveillant, en tutoyant.
Format : phrases courtes, gras pour les chiffres clés, listes à puces quand il y a plusieurs points. Pas de titres.
Tu t'appuies uniquement sur les données fournies ; si une info manque, dis-le simplement.
Tu n'es pas conseiller financier : pas de recommandation d'achat ou de vente de placements précis.
Montants en euros, format français (1 234 €).`;

const RULES = `Comment lire les données :
- Montant négatif = sortie d'argent, positif = entrée.
- « Virement interne » = argent qui passe d'un de ses comptes à un autre : ni dépense ni revenu.
- « Épargne & placements » = argent mis de côté, pas une dépense.
- « Vie commune » = ce qu'il verse au compte joint du couple ; c'est sa dépense pour le foyer. Le détail du compte joint (loyer, courses communes, CAF du foyer) n'entre pas dans son budget perso.
- Un salaire marqué « compté pour le mois suivant » a été versé fin de mois pour financer le mois d'après.`;

async function claude(system: string, messages: Msg[], maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY()!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message ?? res.statusText;
    if (res.status === 401) throw new Error("Clé API refusée : vérifie ANTHROPIC_API_KEY dans Vercel.");
    if (res.status === 429) throw new Error("Trop de demandes d'un coup, réessaie dans une minute.");
    throw new Error(`L'IA n'a pas pu répondre (${res.status}) : ${msg}`);
  }
  return (data?.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("").trim();
}

/** GET : l'IA est-elle configurée ? (sans rien révéler de la clé) */
export async function GET() {
  return NextResponse.json({ enabled: Boolean(KEY()), model: MODEL });
}

export async function POST(req: Request) {
  if (!KEY()) return NextResponse.json({ error: "IA non configurée : ajoute ANTHROPIC_API_KEY dans Vercel." }, { status: 503 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!token) return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  const { data: auth } = await createClient(url, anon).auth.getUser(token);
  if (!auth.user) return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  const allowed = ALLOWED();
  if (allowed.length && !allowed.includes(auth.user.id)) return NextResponse.json({ error: "IA réservée au propriétaire de l'appli." }, { status: 403 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requête illisible" }, { status: 400 }); }

  try {
    if (body.action === "categorize") {
      const items = body.items.slice(0, 120);
      if (!items.length) return NextResponse.json({ suggestions: {} });
      const list = items.map((t) => `${t.id}\t${t.label}\t${t.amount.toFixed(2)}`).join("\n");
      const text = await claude(
        `Tu ranges des opérations bancaires françaises dans des catégories. Réponds UNIQUEMENT avec un objet JSON {"id": "catégorie"}, sans texte autour.
Catégories autorisées (orthographe exacte) : ${body.categories.join(" | ")}.
Montant négatif = dépense, positif = entrée : n'utilise une catégorie de rentrée que pour un montant positif.
Si tu ne sais vraiment pas, mets "Divers" pour une dépense et "Autres revenus" pour une entrée.`,
        [{ role: "user", content: `id\tlibellé\tmontant\n${list}` }],
        2000,
      );
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const raw = JSON.parse(json || "{}") as Record<string, string>;
      const ok = new Set(body.categories);
      const suggestions = Object.fromEntries(Object.entries(raw).filter(([id, c]) => ok.has(c) && items.some((t) => t.id === id)));
      return NextResponse.json({ suggestions });
    }

    if (body.action === "chat") {
      const messages = body.messages.slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
      if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "Pose une question" }, { status: 400 });
      const answer = await claude(`${STYLE}\n\n${RULES}\n\nDonnées de l'utilisateur :\n${body.context.slice(0, 120_000)}`, messages, 1200);
      return NextResponse.json({ answer });
    }

    if (body.action === "review") {
      const answer = await claude(
        `${STYLE}\n\n${RULES}\n\nDonnées de l'utilisateur :\n${body.context.slice(0, 120_000)}`,
        [{ role: "user", content: `Fais le bilan de ${body.month} en 5 à 7 puces maximum : ce qui a changé par rapport aux mois précédents, ce qui va bien, ce qui mérite attention, et une action concrète pour le mois prochain. Commence directement par les puces.` }],
        900,
      );
      return NextResponse.json({ answer });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
