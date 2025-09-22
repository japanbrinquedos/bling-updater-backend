import { clamp, dedupe, hasHtml, onlyDigits, parseBNLineToColumns, parseNumber, splitBNRecords, stripHtml, truncate } from "./utils.js";

// Índices (0-based) nas 22 colunas BN
const IDX = {
  ID: 0,
  CODIGO: 1,
  NOME: 2,
  UNIDADE: 3,
  NCM: 4,
  PRECO: 5,
  SITUACAO: 6,
  PRECO_CUSTO: 7,
  COD_FORNEC: 8,
  FORNEC: 9,               // NÃO ENVIAR
  PESO_LIQ: 10,
  PESO_BRU: 11,
  EAN: 12,
  LARGURA: 13,
  ALTURA: 14,
  PROFUNDIDADE: 15,
  TAGS: 16,                // NÃO ENVIAR
  COD_PAI: 17,             // NÃO ENVIAR
  MARCA: 18,
  VOLUMES: 19,
  DESC_CURTA: 20,          // texto simples OU HTML
  IMAGENS: 21              // pode conter muitas (e extras após 22)
};

function normUnidade(v: string) {
  return (v || "UN").toUpperCase().slice(0, 6);
}

function normSituacao(v: string) {
  const s = (v || "").toLowerCase();
  if (s.startsWith("a")) return "A";
  if (s.startsWith("i")) return "I";
  return undefined;
}

function normMarca(v: string) {
  return (v || "").trim().toUpperCase();
}

function ncmDigits(v: string) {
  const d = onlyDigits(v);
  if (d.length === 8) return d;
  return "";
}

function normPeso(v: string) {
  const n = parseNumber(v, 1);
  if (n === undefined) return undefined;
  return clamp(n, 0, 50);
}

function normDim(v: string) {
  const n = parseNumber(v, 1);
  if (n === undefined) return undefined;
  return clamp(n, 0.5, 200);
}

export function parseBNAndNormalize(raw: string) {
  const records = splitBNRecords(raw);
  const cleaned_lines: string[] = [];
  const errors: string[] = [];
  const items: any[] = [];

  records.forEach((rec, idx) => {
    const { cols, images } = parseBNLineToColumns(rec);

    if (!cols[IDX.ID]) {
      errors.push(`Linha ${idx + 1}: ID ausente`);
    }

    // Normalizações de campos
    const id = cols[IDX.ID]?.trim();
    const codigo = cols[IDX.CODIGO]?.trim();
    const nome = cols[IDX.NOME]?.trim();
    const unidade = normUnidade(cols[IDX.UNIDADE]);
    const ncm = ncmDigits(cols[IDX.NCM]);
    const preco = parseNumber(cols[IDX.PRECO], 2);
    const situacao = normSituacao(cols[IDX.SITUACAO]);
    const precoCusto = parseNumber(cols[IDX.PRECO_CUSTO], 2);
    const codFornecedor = cols[IDX.COD_FORNEC]?.trim();
    const fornecedor = cols[IDX.FORNEC]?.trim(); // NÃO ENVIAR
    const pesoLiquido = normPeso(cols[IDX.PESO_LIQ]);
    const pesoBruto = normPeso(cols[IDX.PESO_BRU]);
    const ean = cols[IDX.EAN]?.trim();
    const largura = normDim(cols[IDX.LARGURA]);
    const altura = normDim(cols[IDX.ALTURA]);
    const profundidade = normDim(cols[IDX.PROFUNDIDADE]);
    const tags = cols[IDX.TAGS];                // NÃO ENVIAR
    const codigoPai = cols[IDX.COD_PAI];        // NÃO ENVIAR
    const marca = normMarca(cols[IDX.MARCA]);
    const volumes = parseNumber(cols[IDX.VOLUMES], 0) ?? 0;

    const descCol = cols[IDX.DESC_CURTA] || "";
    let descricaoCurta = "";
    let descricaoHtml: string | undefined = undefined;
    if (hasHtml(descCol)) {
      descricaoHtml = descCol.trim();
      descricaoCurta = truncate(stripHtml(descCol), 500);
    } else {
      descricaoCurta = truncate(descCol.trim(), 500);
    }

    // Monta cleaned_line (22 colunas) para preview
    const cleanedCols = [...cols];
    cleanedCols[IDX.UNIDADE] = unidade;
    cleanedCols[IDX.NCM] = ncm || cols[IDX.NCM];
    cleanedCols[IDX.PRECO] = preco !== undefined ? String(preco) : cols[IDX.PRECO];
    cleanedCols[IDX.SITUACAO] = situacao || cols[IDX.SITUACAO];
    cleanedCols[IDX.PRECO_CUSTO] = precoCusto !== undefined ? String(precoCusto) : cols[IDX.PRECO_CUSTO];
    cleanedCols[IDX.PESO_LIQ] = pesoLiquido !== undefined ? String(pesoLiquido) : cols[IDX.PESO_LIQ];
    cleanedCols[IDX.PESO_BRU] = pesoBruto !== undefined ? String(pesoBruto) : cols[IDX.PESO_BRU];
    cleanedCols[IDX.LARGURA] = largura !== undefined ? String(largura) : cols[IDX.LARGURA];
    cleanedCols[IDX.ALTURA] = altura !== undefined ? String(altura) : cols[IDX.ALTURA];
    cleanedCols[IDX.PROFUNDIDADE] = profundidade !== undefined ? String(profundidade) : cols[IDX.PROFUNDIDADE];
    cleanedCols[IDX.MARCA] = marca || cols[IDX.MARCA];
    cleanedCols[IDX.VOLUMES] = String(volumes);

    // Coluna de imagens no preview: juntar por vírgula
    cleanedCols[IDX.IMAGENS] = dedupe(images).join(",");

    // warnings
    const warnings: string[] = [];
    if (!ncm && cols[IDX.NCM]) warnings.push("ncm_invalid_digits");
    if (fornecedor) warnings.push("supplier_not_patched"); // lembrar que não envia
    if (tags) warnings.push("tags_not_patched");
    if (codigoPai) warnings.push("codigo_pai_not_patched");

    // PATCH payload parcial (SOMENTE campos presentes/válidos)
    const patch: Record<string, any> = {};
    if (codigo) patch.codigo = codigo;
    if (nome) patch.nome = nome;
    if (unidade) patch.unidade = unidade;
    if (ncm) patch.ncm = ncm;
    if (preco !== undefined) patch.preco = preco;
    if (situacao) patch.situacao = situacao;
    if (precoCusto !== undefined) patch.precoCusto = precoCusto;
    if (codFornecedor) patch.codigoFornecedor = codFornecedor;
    if (pesoLiquido !== undefined) patch.pesoLiquido = pesoLiquido;
    if (pesoBruto !== undefined) patch.pesoBruto = pesoBruto;
    if (ean) patch.ean = ean;
    if (largura !== undefined) patch.largura = largura;
    if (altura !== undefined) patch.altura = altura;
    if (profundidade !== undefined) patch.profundidade = profundidade;
    if (marca) patch.marca = marca;
    if (volumes !== undefined) patch.volumes = volumes;

    // descrição: curta sempre, html quando existir
    if (descricaoCurta) patch.descricaoCurta = descricaoCurta;
    if (descricaoHtml) patch.descricao = descricaoHtml;

    // NUNCA enviar estes campos:
    // tipo, formato, fornecedor (10), tags (17), codigoPai (18)

    cleaned_lines.push(cleanedCols.join("|"));

    items.push({
      id,
      bnLine: cleanedCols.join("|"),
      images,
      warnings,
      patchPayload: patch
    });
  });

  return { cleaned_lines, items, errors };
}

// Build skeleton (22 colunas) a partir de *ID|Codigo|Descricao*
export function buildSkeletonFromSeeds(seedsRaw: string) {
  const records = splitBNRecords(seedsRaw); // também aceita *…* e/ou linhas
  const out: string[] = [];

  for (const r of records) {
    let t = r.trim();
    if (t.startsWith("*") && t.endsWith("*")) t = t.slice(1, -1);
    t = t.replace(/\t/g, "|");
    const parts = t.split("|").map(s => s.trim());
    let id = "", codigo = "", nome = "";
    if (parts.length === 1) nome = parts[0];
    if (parts.length >= 2) { id = parts[0]; codigo = parts[1]; }
    if (parts.length >= 3) nome = parts[2];

    const cols = Array(22).fill("") as string[];
    cols[IDX.ID] = id;
    cols[IDX.CODIGO] = codigo;
    cols[IDX.NOME] = nome;
    cols[IDX.UNIDADE] = "UN";
    // demais defaults vazios; col 22 imagens vazia
    out.push(cols.join("|"));
  }
  return out;
}
