import {
  stripOuterQuotesAndAsterisks,
  normalizeSpacesAndTabs,
  stripHtmlToText,
  onlyDigits,
  toFloatPtBR,
  toNumber,
  mapSituacao
} from "./utils.js";

/** Parser BN (22 colunas + imgs extras). Atualiza tudo que vier (exceto Fornecedor/Tags). */
export function parseBNAndNormalize(bnText: string) {
  const raw = bnText.replace(/\r\n/g, "\n").trim();
  let line = stripOuterQuotesAndAsterisks(raw);
  line = normalizeSpacesAndTabs(line);

  let parts = line.split("|").map((p) => p.trim());
  const get = (idx1: number) => (parts[idx1 - 1] ?? "").trim();

  // imagens da col. 44 em diante (ou CSV)
  let imagesRaw: string[] = [];
  if (parts.length >= 44) {
    imagesRaw = parts.slice(43).flatMap((p) => p.split(",").map((u) => u.trim()).filter(Boolean));
    parts = parts.slice(0, 43);
  }
  const images = imagesRaw.filter((u) => /^https?:\/\//i.test(u));

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
  const supplierCode = get(13) || undefined; // não enviaremos nome do fornecedor (col. 14)
  const netWeight = toFloatPtBR(get(18));
  const grossWeight = toFloatPtBR(get(19));
  const ean = onlyDigits(get(20)) || undefined;
  const width = toFloatPtBR(get(22));
  const height = toFloatPtBR(get(23));
  const depth = toFloatPtBR(get(24));
  const brand = (get(39) || "").toUpperCase() || undefined;
  const volumes = toNumber(get(41));
  const shortDesc = stripHtmlToText(get(42) || "");

  const patch: Record<string, any> = {};
  if (id) patch.id = id;
  if (code) patch.codigo = code;
  if (name) patch.nome = name;
  if (unit) patch.unidade = unit;
  if (ncm) patch.ncm = ncm;
  if (typeof price === "number") patch.preco = price;
  if (situacao) patch.situacao = situacao;
  if (typeof costPrice === "number") patch.precoCusto = costPrice;
  if (supplierCode) patch.codigoFornecedor = supplierCode; // OK atualizar código, não o “nome”
  if (typeof netWeight === "number") patch.pesoLiquido = netWeight;
  if (typeof grossWeight === "number") patch.pesoBruto = grossWeight;
  if (ean) patch.gtin = ean;
  if (typeof width === "number") patch.larguraProduto = width;
  if (typeof height === "number") patch.alturaProduto = height;
  if (typeof depth === "number") patch.profundidadeProduto = depth;
  if (brand) patch.marca = brand;
  if (typeof volumes === "number") patch.volumes = volumes;
  if (shortDesc) patch.descricaoCurta = shortDesc;

  const cleaned = parts.join("|") + (images.length ? "|" + images.join(",") : "");
  return {
    cleaned_lines: [cleaned],
    errors: [],
    items: [{ id, bnLine: cleaned, patchPayload: patch, images }]
  };
}

export function toBlingPatchBody(patch: Record<string, any>) {
  const body: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === "" || v === null || v === undefined) continue;
    if (k === "tags" || k === "fornecedor" || k === "supplier") continue; // nunca envia
    body[k] = v;
  }
  return body;
}
