/* eslint-disable @typescript-eslint/no-explicit-any */
import { sanitizeHtmlToText } from "./utils.js";

/**
 * BN 22 colunas (com imagens extras após a 22ª, separadas por |).
 * Atualizamos TUDO que vier preenchido (exceto fornecedor/tags), via PATCH parcial.
 * Imagens: quando presentes, enviamos no payload (Replace).
 */

export type ParsedItem = {
  input: string;
  cleaned: string;
  warnings: string[];
  bnLine: string;
  patchPayload: Record<string, any>; // payload interno (EN) a ser enviado ao PATCH
};

export type ParsedResult = {
  cleaned_lines: string[];
  errors: string[];
  items: ParsedItem[];
};

/** Helpers */
function unbox(line: string): string {
  let s = line.trim();
  // tira aspas envoltórias
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  // tira asteriscos guardas da sua fórmula
  if (s.startsWith("*")) s = s.slice(1);
  if (s.endsWith("*")) s = s.slice(0, -1);
  // tabs viram pipes
  s = s.replace(/\t+/g, "|");
  // normaliza " | " -> "|"
  s = s.replace(/\s*\|\s*/g, "|").trim();
  return s;
}
function toNumberBR(v?: string): number | undefined {
  if (!v) return undefined;
  const s = v.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
function onlyDigitsNCM(v?: string): string | undefined {
  if (!v) return undefined;
  const d = v.replace(/\D/g, "");
  return d.length === 8 ? d : d || undefined;
}
function isHttp(u: string): boolean {
  try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:"; } catch { return false; }
}
function statusToAI(s?: string): "A" | "I" | undefined {
  if (!s) return undefined;
  const t = s.trim().toLowerCase();
  if (t.startsWith("ativo")) return "A";
  if (t.startsWith("inativo")) return "I";
  return undefined;
}

/** Quebra a BN em 22 colunas + imagens extras (| ou ,) */
function splitBN(s: string): { cols: string[]; images: string[] } {
  const parts = s.split("|");
  const cols = parts.slice(0, 22).map((c) => c?.trim() ?? "");
  const rest = parts.slice(22);
  const csvImgs = rest.join("|").trim();
  const images = csvImgs
    ? csvImgs.split(/[|,]/).map(x => x.trim()).filter(Boolean).filter(isHttp)
    : [];
  return { cols, images };
}

/** Monta linha BN “limpa” p/ preview (imagens no final, separadas por vírgula) */
function toCleanBNLine(cols: string[], images: string[]): string {
  return `${cols.join("|")}${images.length ? "|" + images.join(",") : ""}`;
}

/** Parser principal: retorna payload parcial (EN) + linha BN normalizada */
export function parseBNAndNormalize(bn: string): ParsedResult {
  const lines = bn.replace(/\r\n/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);

  const cleaned_lines: string[] = [];
  const errors: string[] = [];
  const items: ParsedItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const normalized = unbox(raw);
    const { cols, images } = splitBN(normalized);

    if (cols.length < 22) {
      errors.push(`Linha ${i + 1}: ${cols.length} colunas (<22)`);
      while (cols.length < 22) cols.push("");
    }

    // Colunas (1..22) -> indices 0..21
    const [
      id,            // 1
      code,          // 2
      name,          // 3
      unit,          // 4
      ncm,           // 5
      price,         // 6
      statusText,    // 7
      costPrice,     // 8
      supplierCode,  // 9
      _supplier,     // 10 (NÃO ENVIAR)
      netWeight,     // 11
      grossWeight,   // 12
      ean,           // 13
      width,         // 14
      height,        // 15
      depth,         // 16
      _tags,         // 17 (NÃO ENVIAR)
      _parent,       // 18 (N/A por enquanto)
      brand,         // 19
      volumes,       // 20
      shortDesc,     // 21
      _imagesCol     // 22 (já tratamos como “images” acima)
    ] = cols;

    // Normalizações leves para o preview
    if (cols[20]) cols[20] = sanitizeHtmlToText(cols[20]);
    if (cols[4])  cols[4]  = onlyDigitsNCM(cols[4]) ?? "";

    const toDec = (v?: string) => (v ? String(toNumberBR(v) ?? "").replace(".", ",") : "");
    [5, 7, 10, 11, 13, 14, 15].forEach(idx => { if (cols[idx]) cols[idx] = toDec(cols[idx]); });

    const cleaned = toCleanBNLine(cols, images);
    cleaned_lines.push(cleaned);

    // Payload parcial (EN) — SÓ campos presentes
    const payload: Record<string, any> = {};
    if (id?.trim())            payload.id = id.trim();
    if (code?.trim())          payload.code = code.trim();
    if (name?.trim())          payload.name = name.trim();
    if (unit?.trim())          payload.unit = unit.trim();
    const ncmDigits = onlyDigitsNCM(ncm);
    if (ncmDigits)             payload.ncm = ncmDigits;
    const p = toNumberBR(price);
    if (p !== undefined)       payload.price = p;
    const st = statusToAI(statusText);
    if (st)                    payload.status = st;
    const cp = toNumberBR(costPrice);
    if (cp !== undefined)      payload.cost_price = cp;
    if (supplierCode?.trim())  payload.supplier_code = supplierCode.trim();
    const nw = toNumberBR(netWeight);
    if (nw !== undefined)      payload.net_weight = nw;
    const gw = toNumberBR(grossWeight);
    if (gw !== undefined)      payload.gross_weight = gw;
    if (ean?.trim())           payload.ean = ean.trim();
    const w = toNumberBR(width);
    if (w !== undefined)       payload.width_cm = w;
    const h = toNumberBR(height);
    if (h !== undefined)       payload.height_cm = h;
    const d = toNumberBR(depth);
    if (d !== undefined)       payload.depth_cm = d;
    if (brand?.trim())         payload.brand = brand.trim().toUpperCase();
    const vol = toNumberBR(volumes);
    if (vol !== undefined)     payload.volumes = vol;
    if (shortDesc?.trim())     payload.short_description = sanitizeHtmlToText(shortDesc).slice(0, 2000);

    // Imagens: se vieram, enviamos — Replace (o backend vai mandar a lista final)
    if (images.length)         payload.images = images;

    // Nunca enviamos fornecedor (nome) nem tags
    // (já não entram no payload)

    items.push({
      input: raw,
      cleaned,
      warnings: [],
      bnLine: cleaned,
      patchPayload: payload,
    });
  }

  return { cleaned_lines, errors, items };
}
