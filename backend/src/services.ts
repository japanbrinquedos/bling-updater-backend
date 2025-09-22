// backend/src/services.ts
import { randomUUID } from "crypto";

/** Util: normaliza vírgula decimal para ponto */
function toNum(x?: string) {
  if (!x) return undefined;
  const s = x.replace(/\./g, "").replace(",", ".").replace(/\s+/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Remove * e aspas ao redor; normaliza \t -> |; colapsa espaços; preserva HTML */
export function sanitizeRawRecord(raw: string): string {
  let s = raw.trim();

  // recorta entre * ... * se houver
  if ((s.match(/\*/g) || []).length >= 2) {
    const first = s.indexOf("*");
    const last = s.lastIndexOf("*");
    s = s.slice(first + 1, last);
  }

  // remove aspas únicas ao redor
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }

  // tabs -> pipe
  s = s.replace(/\t/g, "|");

  // normaliza espaços em torno dos pipes, mas sem tocar em HTML
  s = s
    .split("|")
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .join("|");

  return s;
}

/** Quebra texto do textarea em registros BN.
 *  Aceita:
 *  - bloco com *...* (HTML multiline no meio)
 *  - ou uma linha por registro (sem *)
 */
export function extractRecords(rawTextarea: string): string[] {
  const txt = rawTextarea.replace(/\r/g, "");

  // Caso haja muitos asteriscos, dividir por eles e filtrar trechos com '|'
  if (txt.includes("*")) {
    return txt
      .split("*")
      .map((s) => s.trim())
      .filter((s) => s.includes("|"))
      .map((s) => sanitizeRawRecord(`*${s}*`));
  }

  // fallback: uma linha por registro
  return txt
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length)
    .map(sanitizeRawRecord);
}

/** Sempre retorna exatamente 22 colunas (+ imagens extras após 22) */
export function splitBNKeeping22(line: string) {
  const parts = line.split("|"); // preserva vazios do meio; trailing vazios podem sumir
  // garante pelo menos 22 posições
  while (parts.length < 22) parts.push("");

  // tudo além da 22 é imagem extra (se for URL)
  const base22 = parts.slice(0, 22);
  const extras = parts.slice(22);

  return { cols: base22, extras };
}

export type PreviewItem = {
  id: string;
  cleaned: string; // linha BN “normalizada” (22 colunas + imagens extras agregadas na col 22 por vírgula)
  warnings: string[];
  patch: any; // corpo do PATCH (parcial)
};

const STATUS_MAP: Record<string, "A" | "I"> = {
  ativo: "A",
  inativo: "I",
};

function isUrl(s: string) {
  return /^https?:\/\/\S+/i.test(s || "");
}

/** Monta array de imagens a partir da col 22 + extras (pipe) e vírgulas dentro da col 22 */
function collectImages(col22: string, extras: string[]) {
  const imgs: string[] = [];

  const seed = (col22 || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  for (const u of seed) if (isUrl(u)) imgs.push(u);
  for (const e of extras) if (isUrl(e)) imgs.push(e);

  // remove duplicadas preservando ordem
  return Array.from(new Set(imgs));
}

/** Constrói o corpo de PATCH respeitando os contratos: parcial, não toca fornecedor, tags, código pai */
export function buildPatchFromCols(cols: string[], extras: string[]): { id: string; body: any; warnings: string[] } {
  const warnings: string[] = [];

  // Colunas (base no seu BN)
  const [
    col01_id,
    col02_code,
    col03_name,
    col04_unit,
    col05_ncm,
    col06_price,
    col07_statusText,
    col08_cost,
    _col09_supplierCode, // NÃO ALTERAR
    _col10_supplierName, // NÃO ALTERAR
    col11_netWeight,
    col12_grossWeight,
    col13_ean,
    col14_width,
    col15_height,
    col16_depth,
    _col17_skip, // reservado
    _col18_tags, // NÃO ALTERAR (Grupo de Tags/Tags)
    col19_brand,
    col20_volumes,
    col21_shortHtml, // manter HTML
    col22_imagesSeed,
  ] = cols;

  const id = (col01_id || "").replace(/\D/g, ""); // só dígitos; evita confundir com HTML acidental
  if (!id) warnings.push("id_vazio: ID (coluna 1) não encontrado.");

  const body: any = {};

  // Atualizações parciais — só envia se houver valor útil
  if (col02_code?.trim()) body.code = col02_code.trim();
  if (col03_name?.trim()) body.name = col03_name.trim();
  if (col04_unit?.trim()) body.unit = col04_unit.trim();

  // NCM: aceita 8 dígitos. Remove pontuação.
  if (col05_ncm?.trim()) {
    const ncm = col05_ncm.replace(/\D/g, "");
    if (ncm && ncm.length === 8) {
      body.ncm = ncm;
    } else {
      warnings.push("ncm_invalido: mantendo original no Bling.");
    }
  }

  const price = toNum(col06_price);
  if (price !== undefined) body.price = price;

  const statusRaw = (col07_statusText || "").toLowerCase().trim();
  if (statusRaw) {
    const s = STATUS_MAP[statusRaw] ?? (statusRaw.startsWith("a") ? "A" : statusRaw.startsWith("i") ? "I" : undefined);
    if (s) body.status = s;
  }

  const cost = toNum(col08_cost);
  if (cost !== undefined) body.cost_price = cost;

  const netW = toNum(col11_netWeight);
  if (netW !== undefined) body.net_weight = netW;

  const grossW = toNum(col12_grossWeight);
  if (grossW !== undefined) body.gross_weight = grossW;

  if (col13_ean?.trim()) body.ean = col13_ean.trim();

  const width = toNum(col14_width);
  if (width !== undefined) body.width_cm = width;

  const height = toNum(col15_height);
  if (height !== undefined) body.height_cm = height;

  const depth = toNum(col16_depth);
  if (depth !== undefined) body.depth_cm = depth;

  // col18 (tags) — **não enviar**
  if (col19_brand?.trim()) body.brand = col19_brand.trim();

  const volumes = toNum(col20_volumes);
  if (volumes !== undefined) body.volumes = volumes;

  // Descrição curta (HTML **preservado**)
  if (col21_shortHtml?.trim()) body.short_description = col21_shortHtml.trim();

  // Imagens
  const images = collectImages(col22_imagesSeed, extras);
  if (images.length) {
    body.images = images;
  }

  return { id, body, warnings };
}

export function previewRecords(rawTextarea: string) {
  const errors: string[] = [];
  const items: PreviewItem[] = [];

  const records = extractRecords(rawTextarea);
  for (const rec of records) {
    try {
      const { cols, extras } = splitBNKeeping22(rec);

      // Normaliza uma "linha BN" legível para exibir no preview (agrega imagens extras por vírgula)
      const normalizedLine = (() => {
        const copy = [...cols];
        const imgs = collectImages(cols[21], extras);
        copy[21] = imgs.join(",");
        return copy.join("|");
      })();

      const { id, body, warnings } = buildPatchFromCols(cols, extras);
      items.push({
        id,
        cleaned: normalizedLine,
        warnings,
        patch: body,
      });
    } catch (e: any) {
      errors.push(`parse_error: ${String(e?.message || e)}`);
    }
  }

  return {
    idempotencyKey: randomUUID(),
    errors,
    items,
    cleaned_lines: items.map((it) => it.cleaned),
  };
}
