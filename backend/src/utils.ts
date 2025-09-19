export function stripOuterQuotesAndAsterisks(s: string): string {
  let t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1);
  if (t.startsWith("*")) t = t.slice(1);
  if (t.endsWith("*")) t = t.slice(0, -1);
  return t.trim();
}
export function normalizeSpacesAndTabs(s: string): string {
  return s.replace(/\t+/g, "|").replace(/\s*\|\s*/g, "|").replace(/\s{2,}/g, " ").trim();
}
export function stripHtmlToText(s: string): string {
  return s.replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|h[1-6]|div|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
export function onlyDigits(s: string): string { return (s || "").replace(/\D+/g, ""); }
export function toFloatPtBR(s: string): number | undefined {
  if (!s) return undefined; const t = s.replace(/\./g, "").replace(",", "."); const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
export function toNumber(s: string): number | undefined { const n = Number(s); return Number.isFinite(n) ? n : undefined; }
export function mapSituacao(str: string): "A" | "I" | undefined {
  if (!str) return undefined; const t = str.toLowerCase(); if (t.startsWith("a")) return "A"; if (t.startsWith("i")) return "I"; return undefined;
}
