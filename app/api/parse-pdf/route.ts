import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parsePdf } from "@/lib/parse/pdf";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/parse-pdf (multipart, champ "file") → { source, account, transactions }
 * Réservé aux utilisateurs connectés (jeton Supabase dans Authorization). Rien n'est stocké côté serveur.
 */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { data: auth } = await createClient(url, anon).auth.getUser(token);
  if (!auth.user) return NextResponse.json({ error: "Session expirée" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Fichier trop lourd (10 Mo max)" }, { status: 413 });

  try {
    const statement = await parsePdf(new Uint8Array(await file.arrayBuffer()));
    if (!statement.transactions.length) {
      return NextResponse.json({ error: "Aucune opération trouvée dans ce PDF. Essaie l'export CSV de ta banque." }, { status: 422 });
    }
    return NextResponse.json(statement);
  } catch (e) {
    console.error("parse-pdf", e);
    return NextResponse.json({ error: "PDF illisible" }, { status: 422 });
  }
}
