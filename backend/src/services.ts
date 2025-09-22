import { v4 as uuid } from "uuid";
import { blingPatch } from "./blingClient.js";

/** --------- Helpers de parsing/normalização --------- */

const trimOuterQuotesAndStars = (s: string) => {
  let out = s.trim();
  // tira aspas globais
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1);
  }
  // tira * globais
  if (out.startsWith("*")) out = out.slice(1);
  if (out.endsWith("*")) out = out.slice(0, -1);
  return out.trim();
};

const isNumLike = (s: string) => /^[\s\-+]?\d{1,3}(\.\d{3})*(,\d+)?$|^[\s\-+]?\d+([.,]\d+)?$/.test(s.trim());

const toNumber = (s: string): number | undefined => {
  const raw = (s ?? "").toString().trim();
  if (!raw) return undefined;
  if (!isNumLike(raw)) return undefined;
  const normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
};

const toOneDecimal = (n: number | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined;

const onlyDigits = (s: string) => (s ?? "").replace(/\D+/g, "");

const toStatus = (s: string): "A" | "I" | undefined => {
  const t = (s ?? "").toString().trim().toLowerCase();
  if (!t) return undefined;
  if (t === "a" || t === "ativo" || t === "active") return "A";
  if (t === "i" || t === "inativo" || t === "inactive") return "I";
  return undefined;
};

type PreviewItem = {
  input: string;
  cleaned: string;
  bnLine: string;
  warnings: string[];
  patchPayload: any;
};

type Preview = {
  cleaned_lines: string[];
  errors: string[];
  items: PreviewItem[];
};

const joinSpaces = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Divide o input em blocos *...* (resistente a quebras de linha dentro).
 * Se não houver '*', trata como um único bloco (linha única).
 */
const splitBlocks = (raw: string): string[] => {
  const txt = (raw ?? "").toString().replace(/\r/g, "");
  const blocks: string[] = [];
  let buf = "";
  let open = false;
  for (const ch of txt) {
    if (ch === "*") {
      if (!open) {
        // abrindo
        buf = "*";
        open = true;
      } else {
        // fechando
        buf += "*";
        blocks.push(buf);
        buf = "";
        open = false;
      }
    } else {
      if (open) buf += ch;
    }
  }
  // fallback: se não teve *…*
  if (blocks.length === 0) {
    const line = txt.trim();
    if (line) blocks.push(line);
  }
  return blocks;
};

/** --------- Parsing principal --------- */

/**
 * parseBNAndNormalize:
 * - limpa cada bloco
 * - normaliza \t->| e preserva vazios
 * - garante 22 colunas e captura imagens extras
 * - monta preview e payload de PATCH (parcial)
 */
export function parseBNAndNormalize(raw: string): Preview {
  const errors: string[] = [];
  const cleaned_lines: string[] = [];
  const items: PreviewItem[] = [];

  const blocks = splitBlocks(raw);
  for (const original of blocks) {
    if (!original.trim()) continue;

    // 1) limpar * e aspas externas
    let cleaned = trimOuterQuotesAndStars(original);

    // 2) normalizar tabs para pipe e comprimir espaços ao redor
    cleaned = cleaned.replace(/\t/g, "|");
    // não mexer no HTML interno, só higienizar múltiplos espaços fora dos pipes
    // (na prática, o split por '|' preserva vazios)
    // 3) montar array de colunas preservando vazios
    const fields = cleaned.split("|").map((x) => x); // sem trim agressivo agora

    // 4) garantir mínimo de 22 colunas (preenche vazios sem deslocar)
    while (fields.length < 22) fields.push("");

    // 5) imagens extras (22ª em diante). A 22ª (idx 21) é a primeira URL, extras = idx >= 22
    const imgStart = 21;
    const extraImages = fields.slice(22).filter(Boolean);
    // reconstruir linha BN "canônica" para debug (mantém 22 primeiras + imagens extras separados por vírgula)
    const canonicalImages = [fields[imgStart] ?? "", ...extraImages].filter(Boolean).join(",");

    // 6) mapear colunas (índices 0..21)
    // Convenção das 22 colunas acordadas:
    // 0 ID, 1 Código, 2 Nome, 3 Unidade, 4 NCM, 5 Preço, 6 Situação, 7 Preço custo,
    // 8 Cód fornecedor, 9 Fornecedor (NÃO enviar), 10 Peso líquido, 11 Peso bruto,
    // 12 EAN, 13 Largura, 14 Altura, 15 Profundidade,
    // 16 Tags (NÃO enviar), 17 Código Pai (NÃO enviar), 18 Marca, 19 Volumes,
    // 20 Descrição curta (HTML permitido), 21 URL Imagens (primeira)
    const F = (i: number) => (fields[i] ?? "").toString();

    const id = F(0).trim();
    const code = F(1).trim();
    const name = joinSpaces(F(2));
    const unit = F(3).trim() || "UN";
    const ncmDigits = onlyDigits(F(4));
    const price = toNumber(F(5));
    const status = toStatus(F(6));
    const costPrice = toNumber(F(7));
    const supplierCode = F(8).trim(); // NÃO remover — mas só envia se houver
    // F(9) fornecedor -> NÃO enviar

    const netWeight = toOneDecimal(toNumber(F(10)));
    const grossWeight = toOneDecimal(toNumber(F(11)));
    const ean = onlyDigits(F(12));
    const width = toOneDecimal(toNumber(F(13)));
    const height = toOneDecimal(toNumber(F(14)));
    const depth = toOneDecimal(toNumber(F(15)));
    // F(16) tags -> NÃO enviar
    // F(17) código pai -> NÃO enviar
    const brand = F(18).trim().toUpperCase();
    const volumes = toNumber(F(19));
    const shortDescription = F(20); // manter HTML
    const firstImage = (F(21) || "").trim();
    const images = [firstImage, ...extraImages].filter(Boolean);

    // 7) validações brandas
    const warns: string[] = [];
    if (!id) {
      errors.push("Linha sem ID (coluna 1) — será ignorada no PATCH.");
    }
    if (ncmDigits && ncmDigits.length !== 8) {
      warns.push("ncm_invalid_digits: NCM deve ter 8 dígitos; mantendo como enviado.");
    }
    // limites de dimensão (0.5–200) se existirem
    const inRange = (n?: number) => (typeof n === "number" ? n >= 0.5 && n <= 200 : true);
    if (!inRange(width) || !inRange(height) || !inRange(depth)) {
      warns.push("dims_out_of_range: dimensões fora de [0,5–200] cm; mantendo como enviado.");
    }

    // 8) montar payload parcial (só com o que veio populado)
    const body: any = {};
    const set = (k: string, v: any) => {
      if (v === undefined) return;
      if (typeof v === "string" && v.trim() === "") return;
      body[k] = v;
    };

    set("code", code);
    set("name", name);
    set("unit", unit);
    if (ncmDigits) set("ncm", ncmDigits); // só envia se veio válido
    set("price", price);
    set("status", status); // "A" / "I"
    set("cost_price", costPrice);
    set("supplier_code", supplierCode);
    set("net_weight", netWeight);
    set("gross_weight", grossWeight);
    if (ean) set("ean", ean);
    set("width_cm", width);
    set("height_cm", height);
    set("depth_cm", depth);
    set("brand", brand);
    set("volumes", volumes);
    // mantém HTML
    set("short_description", shortDescription);
    // imagens: só envia se houver ao menos uma
    if (images.length > 0) set("images", images);

    // 9) linha BN “limpa” para exibir no preview (22 colunas + imagens em CSV)
    const first22 = fields.slice(0, 22);
    first22[21] = canonicalImages; // substitui col 22 pela lista consolidada
    const bnLine = first22.join("|");

    cleaned_lines.push(bnLine);

    items.push({
      input: original,
      cleaned,
      bnLine,
      warnings: warns,
      patchPayload: body,
    });
  }

  return { cleaned_lines, errors, items };
}

/** --------- PATCH em lote a partir do BN --------- */
export async function patchFromBN(raw: string) {
  const preview = parseBNAndNormalize(raw);
  const idempotencyKey = uuid();

  const results: any[] = [];
  const failures: any[] = [];

  for (const it of preview.items) {
    // extrair ID da primeira coluna da linha BN reconstruída
    const id = (it.bnLine.split("|")[0] || "").trim();
    if (!id) {
      failures.push({
        id: null,
        idempotencyKey,
        error: { status: 400, message: "missing_id" },
      });
      continue;
    }

    try {
      // PATCH parcial no produto pelo ID
      const resp = await blingPatch(id, it.patchPayload, { idempotencyKey });
      results.push({
        id,
        idempotencyKey,
        ok: true,
        response: resp,
      });
    } catch (e: any) {
      const status = e?.response?.status || e?.status || 500;
      const payload = e?.response?.data || e?.payload || null;
      failures.push({
        id,
        idempotencyKey,
        error: {
          status,
          message: `bling_error ${status}: ${JSON.stringify(payload)}`,
          payload,
        },
      });
    }
  }

  return {
    ok: failures.length === 0,
    idempotencyKey,
    results,
    failures,
    preview: { errors: preview.errors },
  };
}
