/** Majuscules, sans accents, espaces normalisés. */
export const norm = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Clé « marchand » (2 premiers mots significatifs) pour mémoriser les choix de catégorie. */
export function merchantKey(raw: string): string {
  return norm(raw)
    .replace(/^(CARTE|PRLV SEPA|PRLV|VIR INST|VIR SEPA|VIR|PAIEMENT CB|CB)\s+/, "")
    .replace(/^\d{2}\/\d{2}\s+/, "")
    .replace(/[0-9*#/\-.,:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");
}

/** Libellé lisible à partir du libellé bancaire brut. */
export function prettyLabel(raw: string): string {
  let s = raw
    .replace(/^CB\s+/i, "")
    .replace(/^CARTE\s+\d{2}\/\d{2}\s+/i, "")
    .replace(/^PRLV SEPA\s+/i, "")
    .replace(/^VIR INST\s+/i, "")
    .replace(/^VIR\s+/i, "Vir. ")
    .replace(/\s+\d+,\d{2} EUR$/i, "")
    .replace(/\s+\d{6,}.*$/, "")
    .replace(/,\s*SUCCURSALE.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/(^|[\s\-/(])([a-zà-ÿ])/g, (_m, a: string, b: string) => a + b.toUpperCase());
  }
  return s.slice(0, 60);
}

/** Hash FNV-1a court, stable entre navigateur et serveur. */
export function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** "1 234,56" → 1234.56 */
export const parseAmountFR = (s: string): number =>
  parseFloat(String(s).replace(/[\s ]/g, "").replace(/\./g, "").replace(",", "."));

/** Montant au format FR ou US, avec ou sans symbole €. */
export function parseNumberAny(s: string | undefined): number {
  let v = String(s ?? "").replace(/[€\s ]/g, "");
  if (!v) return NaN;
  if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/,/g, "");
  return parseFloat(v);
}

/** Date FR (JJ/MM/AAAA), ISO ou Revolut ("2026-10-17 10:01:05") → AAAA-MM-JJ. */
export function parseDateAny(s: string | undefined): string | null {
  const v = (s ?? "").trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export const monthKey = (date: string) => date.slice(0, 7);

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function eur(n: number, digits = 2): string {
  const v = Math.abs(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (n < 0 ? "−" : "") + v + " €";
}
