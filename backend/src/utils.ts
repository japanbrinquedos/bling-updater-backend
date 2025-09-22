// Utilitários gerais: números, strings, HTML, idempotência, etc.
export const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export const normalizeDecimal = (s: string): string => {
  if (!s) return "";
  // vírgula -> ponto; remove espaços
  let clean = s.replace(/\s+/g, "").replace(",", ".");
  // remove milhar (.) quando número brasileiro tipo 1.234,56
  if (/^\d{1,3}(\.\d{3})+\,\d+$/.test(s)) clean = s.replace(/\./g, "").replace(",", ".");
  return clean;
};

export const parseNumber = (s: string, decimals = 2): number | undefined => {
  const n = Number(normalizeDecimal(s));
  if (Number.isFinite(n)) return Number(n.toFixed(decimals));
  return undefined;
};

export const parseIntStrict = (s: string): number | undefined => {
  const m = String(s ?? "").match(/^\d+$/);
  return m ? Number(m[0]) : undefined;
};

export const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

export const hasHtml = (s: string) => /<[^>]+>/.test(s);

export const stripHtml = (html: string) =>
  (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const truncate = (s: string, max = 500) =>
  (s || "").slice(0, max);

export const dedupe = <T>(arr: T[]) => Array.from(new Set(arr));

export const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

export const safeJson = (v: unknown) => {
  try { return JSON.stringify(v); } catch { return String(v); }
};

// Divide o BN em registros: entre *...* (quando houver), senão por linha
export function splitBNRecords(raw: string): string[] {
  if (!raw) return [];
  const s = raw.replace(/^\uFEFF/, ""); // BOM
  const star = [...s.matchAll(/\*([\s\S]*?)\*/g)].map(m => m[1]);
  if (star.length) return star;
  // fallback: quebra por linha (mantendo linhas não vazias)
  return s.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}

// Converte uma string BN bruta em array de 22 colunas + imagens extras
export function parseBNLineToColumns(raw: string): { cols: string[]; images: string[] } {
  let t = raw ?? "";
  t = t.replace(/^\uFEFF/, "");           // remove BOM
  t = t.trim();
  // remove aspas e asteriscos de borda
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1);
  }
  if (t.startsWith("*") && t.endsWith("*")) {
    t = t.slice(1, -1);
  }

  // tabs -> | ; importantíssimo o trimStart antes do split para não poluir o ID
  t = t.replace(/\t/g, "|").replace(/\u0009/g, "|").trimStart();

  // split preservando vazios
  let parts = t.split("|");

  // se faltarem colunas, padding até 22
  if (parts.length < 22) parts = parts.concat(Array(22 - parts.length).fill(""));

  // primeiras 22 colunas são fixas
  const cols = parts.slice(0, 22).map(x => (x ?? "").trim());

  // imagens: coluna 22 pode conter várias URLs separadas por '|'
  let images: string[] = [];
  if (cols[21]) images = images.concat(cols[21].split(",").flatMap(x => x.split("|")).map(s => s.trim()).filter(Boolean));
  // colunas extras (23+) também são imagens
  if (parts.length > 22) {
    images = images.concat(parts.slice(22).map(s => s.trim()).filter(Boolean));
  }

  // validação simples de URL http/https
  images = images.filter(u => /^https?:\/\//i.test(u));
  images = dedupe(images);

  return { cols, images };
}
