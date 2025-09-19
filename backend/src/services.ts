import {
  stripOuterQuotesAndAsterisks,
  normalizeSpacesAndTabs,
  stripHtmlToText,
  onlyDigits,
  toFloatPtBR,
  toNumber,
  mapSituacao
} from "./utils.js";

/**
 * Parser da BN (22 colunas + URLs extras de imagens).
 * Atualiza TUDO que vier preenchido (exceto Fornecedor/Tags).
 * Imagens: REPLACE quando vierem (a rota decide enviar).
 */
export function parseBNAndNormalize(bnText: string) {
  const raw = bnText.replace(/\r\n/g, "\n").trim();

  let line = stripOuterQuotesAndAsterisks(raw);
  line = normalizeSpacesAndTabs(line);

  let parts = line.split("|").map((p) => p.trim());
  const get = (idx1: number) => (parts[idx1 - 1] ?? "").trim();

  // Coleta imagens da col. 44 em diante
  let imagesRaw: string[] = [];
  if (parts.length >= 44) {
    imagesRaw = parts.slice(43).flatMap((p) => p.split(",").map((u) => u.trim()).filter(Boolean));
    parts = parts.slice(0, 43);
  }

  // Campos (1..22)
  const idStr = get(1);
  const id = onlyDigits(idStr) || idStr;
  const code = get(2) || undefined;
  const name = get(3) || undefined;
  const unit = get(4) || undefined;
  const ncm = onlyDigits(get(5)) || undefined;
  const price = toFloatPtBR(get(7));
  const situacao = mapSituacao(get(10));
  const costPrice = toFloatPtBR(get(12));
  const supplierCode = get(13) || undefined; // NÃO enviar nome do fornecedor (col. 14)
  const netWeight = toFloatPtBR(get(18));
  const grossWeight = toFloatPtBR(get(19));
  const ean = onlyDigits(get(20)) || undefined;
  const width = toFloatPtBR(get(22));
  const height = toFloatPtBR(get(23));
  const depth = toFloatPtBR(get(24));
  const brand = (get(39) || "").toUpperCase() || undefined;
  const volumes = toNumber(get(41));
  const shortDesc = stripHtmlToText(get(42) || "");

  // Normaliza imagens (http/https)
  const images = imagesRaw.filter((u) => /^https?:\/\//i.test(u));

  // Corpo PATCH (dialeto Bling v3 — campos em pt)
  const patch: Record<string, any> = {};
  if (id) patch.id = id; // usado só para resolver
  if (code) patch.codigo = code;
  if (name) patch.nome = name;
  if (unit) patch.unidade = unit;
  if (ncm) patch.ncm = ncm;
  if (typeof price === "number") patch.preco = price;
  if (situacao) patch.situacao = situacao;
  if (typeof costPrice === "number") patch.precoCusto = costPrice;
  if (supplierCode) patch.codigoFornecedor = supplierCode; // OBS: nome do fornecedor não enviamos
  if (typeof netWeight === "number") patch.pesoLiquido = netWeight;
  if (typeof grossWeight === "number") patch.pesoBruto = grossWeight;
  if (ean) patch.gtin = ean;
  if (typeof width === "number") patch.larguraProduto = width;
  if (typeof height === "number") patch.alturaProduto = height;
  if (typeof depth === "number") patch.profundidadeProduto = depth;
  if (brand) patch.marca = brand;
  if (typeof volumes === "number") patch.volumes = volumes;
  if (shortDesc) patch.descricaoCurta = shortDesc;

  // BN limpa para preview (mantém primeiras 43 colunas + CSV de imagens no final)
  const cleaned = parts.join("|") + (images.length ? "|" + images.join(",") : "");

  return {
    cleaned_lines: [cleaned],
    errors: [],
    items: [
      {
        id,
        bnLine: cleaned,
        patchPayload: patch,
        images
      }
    ]
  };
}

export function toBlingPatchBody(patch: Record<string, any>) {
  const body: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === "" || v === null || v === undefined) continue;
    if (k === "tags" || k === "fornecedor" || k === "supplier") continue;
    body[k] = v;
  }
  return body;
}
