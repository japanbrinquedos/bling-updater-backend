import { getAccessToken } from "./tokenStore.js";
import { blingGetProduct, blingFindByCodeOrEan, blingPatchProduct, blingPutImages } from "./blingClient.js";

type PreviewItem = {
  id?: string;
  code?: string;
  ean?: string;
  images?: string[];
  patchPayload: Record<string, any>;
  warnings: string[];
};

const DEC = /(\d+),(\d{1,})/g;

function toNum(v?: string) {
  if (!v) return undefined;
  const n = Number(v.replace(DEC, "$1.$2"));
  return Number.isFinite(n) ? n : undefined;
}
function onlyDigits(s?: string) { return s ? s.replace(/\D+/g, "") : s; }

function sanitizeRawBlock(raw: string) {
  let s = raw.trim();
  if (s.startsWith("*")) s = s.slice(1);
  if (s.endsWith("*")) s = s.slice(0, -1);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  s = s.replaceAll("\t", "|");
  s = s.replace(/\r?\n+/g, " ");
  return s;
}

function split22(line: string) {
  const parts = line.split("|").map(p => p.trim());
  if (parts.length < 22) {
    while (parts.length < 22) parts.push("");
  } else if (parts.length > 22) {
    const extra = parts.splice(22);
    parts[21] = [parts[21], ...extra].filter(Boolean).join(",");
  }
  return parts;
}

function mapToPatch(line: string): PreviewItem {
  const p = split22(line);

  const id      = p[0] || undefined;
  const code    = p[1] || undefined;
  const name    = p[2] || undefined;

  const unit    = p[3] || undefined;
  const ncm     = onlyDigits(p[4]) || undefined;

  const price   = toNum(p[5]);
  const status  = (p[6] || "").toLowerCase().startsWith("a") ? "A" :
                  (p[6] || "").toLowerCase().startsWith("i") ? "I" : undefined;

  const cost    = toNum(p[7]);
  const supplier_code = p[8] || undefined;
  // p[9] fornecedor -> não envia

  const net_weight   = toNum(p[10]);
  const gross_weight = toNum(p[11]);
  const ean          = onlyDigits(p[12]) || undefined;

  const width_cm  = toNum(p[13]);
  const height_cm = toNum(p[14]);
  const depth_cm  = toNum(p[15]);

  // p[16] tags (ignorar)
  // p[17] codigo_pai (ignorar)

  const brand   = (p[18] || "").toUpperCase() || undefined;
  const volumes = p[19] !== "" ? Number(p[19]) : undefined;

  const short_description = p[20] || undefined; // **HTML preservado**
  const images = (p[21] || "")
    .split(",")
    .map(s => s.trim())
    .filter(s => !!s);

  const patchPayload: Record<string, any> = {
    // contratos Bling – parcial:
    tipo: "P",
    formato: "S",
  };
  if (code)  patchPayload.codigo = code;
  if (name)  patchPayload.nome = name;
  if (unit)  patchPayload.unidade = unit;
  if (ncm)   patchPayload.ncm = ncm;
  if (typeof price === "number") patchPayload.preco = price;
  if (status) patchPayload.situacao = status;
  if (typeof cost === "number") patchPayload.precoCusto = cost;
  if (supplier_code) patchPayload.codigoFornecedor = supplier_code;
  if (typeof net_weight === "number") patchPayload.pesoLiquido = net_weight;
  if (typeof gross_weight === "number") patchPayload.pesoBruto = gross_weight;
  if (ean)   patchPayload.gtin = ean;
  if (typeof width_cm  === "number") patchPayload.largura = width_cm;
  if (typeof height_cm === "number") patchPayload.altura = height_cm;
  if (typeof depth_cm  === "number") patchPayload.profundidade = depth_cm;
  if (brand) patchPayload.marca = brand;
  if (typeof volumes === "number") patchPayload.volumes = volumes;
  if (short_description) patchPayload.descricaoCurta = short_description;

  return { id, code, ean, images, patchPayload, warnings: [] };
}

export function parseBNAndNormalize(bn: string) {
  const blocks: string[] = [];
  const starMatches = bn.match(/\*[\s\S]*?\*/g);
  if (starMatches?.length) {
    for (const m of starMatches) blocks.push(sanitizeRawBlock(m));
  } else {
    bn.split(/\r?\n/).forEach(L => {
      const s = sanitizeRawBlock(L);
      if (s) blocks.push(s);
    });
  }
  const items = blocks.map(mapToPatch);
  return { ok: true, cleaned_lines: blocks, items, errors: [] };
}

async function resolveBlingId(item: PreviewItem, token: string): Promise<{ id?: string }> {
  if (item.id) {
    const got = await blingGetProduct(item.id, token);
    if (got?.ok) return { id: item.id };
  }
  const found = await blingFindByCodeOrEan(item.code, item.ean, token);
  if (found?.id) return { id: String(found.id) };
  return { id: undefined };
}

export async function patchFromBN(bn: string) {
  const token = await getAccessToken();
  const preview = parseBNAndNormalize(bn);
  const results: any[] = [];
  const failures: any[] = [];

  for (const it of preview.items) {
    try {
      const { id: blingId } = await resolveBlingId(it, token);
      if (!blingId) {
        failures.push({ id: it.id || it.code || it.ean, error: { status: 404, message: "product_not_found" } });
        continue;
      }
      const patchRes = await blingPatchProduct(blingId, it.patchPayload, token);

      // imagens = best-effort (warning, não falha do lote)
      let imageWarn: string | undefined;
      if (it.images && it.images.length) {
        try { await blingPutImages(blingId, it.images, token); }
        catch { imageWarn = "images_update_failed"; }
      }

      results.push({
        id: blingId,
        source: it.id || it.code || it.ean,
        imageWarn,
        patchPayload: it.patchPayload,
        bling: patchRes?.data ?? null
      });
    } catch (e: any) {
      failures.push({
        id: it.id || it.code || it.ean,
        error: { status: e?.status || 500, message: e?.message || String(e) }
      });
    }
  }

  return { ok: failures.length === 0, results, failures, preview };
}
