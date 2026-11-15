import { parseStatementPages, type TextItem } from "./statement.ts";
import type { ParsedStatement } from "../types.ts";

/** Lit un relevé PDF côté serveur (Node) avec pdf.js et en extrait les opérations. */
export async function parsePdf(data: Uint8Array): Promise<ParsedStatement> {
  // build "legacy" = compatible Node sans DOM ; chargé dynamiquement pour rester hors du bundle client
  const mod = await import("pdfjs-dist/legacy/build/pdf.js");
  // worker chargé dans le même processus : pas de require dynamique (fiable en serverless)
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error — module sans déclaration de types
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.js");
  type PdfJs = typeof import("pdfjs-dist");
  const pdfjs = ((mod as unknown as { default?: PdfJs }).default ?? mod) as unknown as PdfJs;
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: TextItem[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(
      content.items
        .filter((it): it is Extract<typeof it, { str: string }> => "str" in it)
        .map((it) => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width,
          rotated: Math.abs(it.transform[1]) > 0.01,
        })),
    );
  }
  await doc.destroy();
  return parseStatementPages(pages);
}
