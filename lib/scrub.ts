import { ownerTokens } from "./categories.ts";

/** Retire de ce qui part vers l'IA : ton nom et les numéros (comptes, cartes, IBAN, références longues). */
export function scrub(s: string): string {
  let out = s.replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,}(?:\s?[A-Z0-9]{1,3})?\b/gi, "•••").replace(/\d{5,}/g, "•••");
  for (const tokens of ownerTokens()) {
    for (const w of tokens) out = out.replace(new RegExp(`\\b${w}\\b`, "gi"), "[moi]");
  }
  return out.replace(/\[moi\](\s+\[moi\])+/g, "[moi]");
}
