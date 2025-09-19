import { stripOuterQuotesAndAsterisks, normalizeSpacesAndTabs, stripHtmlToText, onlyDigits, toFloatPtBR, toNumber, mapSituacao } from "./utils.js";

/**
 * Parser da linha BN (22 colunas) com tolerância:
 * - Remove aspas envolventes e * do início/fim
 * - Une quebras de linha do conteúdo colado
 * - Converte NCM para 8 dígitos (somente números)
 * - Junta múltiplas URLs de imagem no final (separadas por "|" no Excel) em array
 * - Remove HTML da descrição curta
 * - NÃO envia Fornecedor/Tags no PATCH
 *
 * Mapeamento (1-based):
 *  1 ID, 2 Código, 3 Nome, 4 Unidade, 5 NCM, 7 Preço, 10 Situação,
 * 12 Preço de custo, 13 Cód fornecedor, 18 Peso líquido, 19 Peso bruto,
 * 20 GTIN/EAN, 22 Largura, 23 Altura, 24 Profundidade, 39 Marca,
 * 41 Volumes, 42 Descrição curta, 44+ Imagens (urls extras)
 */
export function parseBNAndNormalize(bnText: string) {
  const raw = bnText.replace(/\r\n/g, "\n").trim();

  // consolida tudo numa linha (o usuário às vezes cola HTML com quebras)
  let line = raw;
  // tira aspas e asteriscos externos
  line = stripOuterQuotesAndAsterisks(line);
  // remove tabs e normaliza espaços
  line = normalizeSpacesAndTabs(line);

  // substitui "|    |" e "| \t|" edge-cases -> "| |" já cobertos pelo normalize
  // split primário por "|"
  let parts = line.split("|").map((p) => p.trim());

  // Se o usuário traz pipes dentro de HTML, já removemos HTML ao extrair col 42
  const get = (idx1: number) => (parts[idx1 - 1] ?? "").trim();

  // imagens: podem vir nas colunas 44 em diante OU tudo na mesma coluna separado por vírgula
  let imagesRaw: string[] = [];
  if (parts.length >= 44) {
    imagesRaw = parts.slice(44 - 1).flatMap((p) =>
      p.split(",").map((u) => u.trim()).filter(Boolean)
    );
    // reduz vetor original para 43 posições para não confundir contagem
    parts = parts.slice(0, 43);
  }

  // campos
  const idStr = get(1);
  const id = onlyDigits(idStr) || idStr; // mantém string caso ID não seja só dígitos
  const code = get(2) || undefined;
  const name = get(3) || undefined;
  const unit = get(4) || undefined;
  const ncm = onlyDigits(get(5)) || undefined; // "94049000"
  const price = toFloatPtBR(get(7));
  const situacao = mapSituacao(get(10)); // "A"/"I"
  const costPrice = toFloatPtBR(get(12));
  const supplierCode = get(13) || undefined; // NÃO será enviado
  const netWeight = toFloatPtBR(get(18));
  const grossWeight = toFloatPtBR(get(19));
  const ean = onlyDigits(get(20)) || undefined;
  const width = toFloatPtBR(get(22));
  const height = toFloatPtBR(get(23));
  const depth = toFloatPtBR(get(24));
  const brand = (get(39) || "").toUpperCase() || undefined;
  const volumes = toNumber(get(41));
  const shortDesc = stripHtmlToText(get(42) || "");

  // normaliza imagens (http/https apenas)
  const images = imagesRaw
    .map((u) => u.replace(/^\s+|\s+$/g, ""))
    .filter((u) => /^https?:\/\//i.test(u));

  // monta payload de PATCH (somente presentes)
  const patch: Record<string, any> = {};
  if (code) patch.codigo = code;
  if (name) patch.nome = name;
  if (unit) patch.unidade = unit;
  if (ncm) patch.ncm = ncm;
  if (typeof price === "number") patch.preco = price;
  if (situacao) patch.situacao = situacao;
  if (typeof costPrice === "number") patch.precoCusto = costPrice;
  // fornecedor/tag não enviamos no PATCH
  if (typeof netWeight === "number") patch.pesoLiquido = netWeight;
  if (typeof grossWeight === "number") patch.pesoBruto = grossWeight;
  if (ean) patch.gtin = ean;
  if (typeof width === "number") patch.larguraProduto = width;
  if (typeof height === "number") patch.alturaProduto = height;
  if (typeof depth === "number") patch.profundidadeProduto = depth;
  if (brand) patch.marca = brand;
  if (typeof volumes === "number") patch.volumes = volumes;
  if (shortDesc) patch.descricaoCurta = shortDesc;

  // imagens ficam para uma 2ª chamada dedicada, mas retornamos aqui para a rota decidir
  const resultItem = {
    id,
    bnLine: parts.join("|"),
    patchPayload: patch,
    images,
  };

  return {
    cleaned_lines: [resultItem.bnLine + (images.length ? "|" + images.join(",") : "")],
    errors: [], // validações críticas podem ser adicionadas aqui
    items: [resultItem],
  };
}

/**
 * Constrói corpo final do PATCH (já vem "seletivo")
 * (mantido por semântica/legibilidade na rota)
 */
export function toBlingPatchBody(patch: Record<string, any>) {
  return patch;
}
