// Utilidades de parsing/normalização BN22, mapeamento p/ Bling (PT-BR)
// e stubs de Buscar & Montar (buildSkeletonFromSeeds / fetchEnrichment)

export type BNRow = [
  string, string, string, string, string, string, string, string, string, string, string,
  string, string, string, string, string, string, string, string, string, string, string
];

export interface BNParseItem {
  input: string;
  cleaned: string;
  warnings: string[];
  bnLine: string;
  patchPayload: Record<string, any>;
}

export interface BNParseResponse {
  cleaned_lines: string[];
  errors: string[];
  items: BNParseItem[];
}

export const PatchPolicy = {
  // Campos NÃO enviados ao PUT do produto
  BLOCKLIST: new Set<string>([
    'supplier','tags','parent_code','fornecedor','grupo_tags','codigo_pai','images','status'
  ]),
  filterOutgoing(data: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (this.BLOCKLIST.has(k)) continue;
      if (v === undefined) continue;
      out[k] = v;
    }
    return out;
  }
};

// ----------------- Helpers comuns -----------------
const ONLY_DIGITS = /[^0-9]/g;
const HTML_TAG = /<[^>]+>/g;

function stripWrappers(s: string): string {
  let t = String(s ?? '').trim();
  // remove aspas externas
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1).trim();
  // remove asteriscos externos *...*
  if (t.startsWith('*') && t.endsWith('*')) t = t.slice(1, -1).trim();
  // remove combinações *" ... "* / *' ... '*
  if ((t.startsWith('*"') && t.endsWith('"*')) || (t.startsWith("*'") && t.endsWith("'*"))) t = t.slice(2, -2).trim();
  return t;
}
function sanitizeDelimiters(s: string): string {
  return s.replace(/\t/g, ' ').replace(/\s*\|\s*/g, '|').trim();
}
function parsePTBRNumber(x: string | number | null | undefined): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  const s = String(x).trim();
  if (!s) return null;
  const norm = s.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}
function ceil1(n: number | null): number | null {
  if (n === null) return null;
  return Math.ceil(n * 10) / 10;
}
function clampDim(n: number | null): number | null {
  if (n === null) return null;
  const c = Math.min(200, Math.max(0.5, n));
  return ceil1(c);
}
function normalizeNCM(ncm: string): string | '' {
  const digits = (ncm || '').replace(ONLY_DIGITS, '');
  return digits.length === 8 ? digits : '';
}
function normalizeEAN13(ean: string): string | '' {
  const d = (ean || '').replace(ONLY_DIGITS, '');
  return d.length === 13 ? d : '';
}
function normalizeTags(s: string): string {
  if (!s) return '';
  const parts = s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const seen = new Set<string>(); const out: string[] = [];
  for (const p of parts) if (!seen.has(p)) { seen.add(p); out.push(p); }
  return out.join(',');
}
function stripHtmlShortDesc(s: string): string {
  if (!s) return '';
  const text = s.replace(HTML_TAG, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 255);
}
function isHttpUrl(u: string): boolean {
  try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; }
}

// ----------------- Parser BN 22 colunas -----------------
export function parseBNAndNormalize(lines: string[]): BNParseResponse {
  const cleaned_lines: string[] = [];
  const errors: string[] = [];
  const items: BNParseItem[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx] ?? '';
    let s = stripWrappers(raw);
    s = sanitizeDelimiters(s);

    let parts = s.split('|');

    if (parts.length < 22) {
      errors.push(`Linha ${idx+1}: ${parts.length} colunas (<22)`);
      while (parts.length < 22) parts.push('');
    }

    // Imagens extras após col 22 -> consolidar na 22
    let extraImgs: string[] = [];
    if (parts.length > 22) {
      extraImgs = parts.slice(21);
      parts = parts.slice(0, 21);
    }

    const imgColRaw = extraImgs.length ? extraImgs.join('|') : (parts[21] || '');
    const imgList = imgColRaw
      .split(/[|,]/g)
      .map(x => x.trim())
      .filter(Boolean)
      .filter(isHttpUrl);

    const seen = new Set<string>(); const imgs: string[] = [];
    for (const u of imgList) if (!seen.has(u)) { seen.add(u); imgs.push(u); }

    const _22: BNRow = [
      (parts[0] || ''),   // 1 ID
      (parts[1] || ''),   // 2 Código
      (parts[2] || ''),   // 3 Descrição
      (parts[3] || 'UN'), // 4 Unidade
      normalizeNCM(parts[4] || ''), // 5 NCM
      (() => { const n = parsePTBRNumber(parts[5] || ''); return n !== null ? n.toFixed(2).replace('.', ',') : ''; })(), // 6 Preço
      (parts[6] || 'Ativo'), // 7 Situação texto
      (() => { const n = parsePTBRNumber(parts[7] || ''); return n !== null ? n.toFixed(2).replace('.', ',') : ''; })(), // 8 Preço custo
      (parts[8] || ''),   // 9 Cód fornecedor
      (parts[9] || '').toUpperCase(), // 10 Fornecedor (não patch)
      (() => { const n = ceil1(parsePTBRNumber(parts[10] || '')); return n !== null ? n.toFixed(1).replace('.', ',') : ''; })(), // 11 Peso liq
      (() => { const n = ceil1(parsePTBRNumber(parts[11] || '')); return n !== null ? n.toFixed(1).replace('.', ',') : ''; })(), // 12 Peso bruto
      normalizeEAN13(parts[12] || ''), // 13 EAN
      (() => { const n = clampDim(parsePTBRNumber(parts[13] || '')); return n !== null ? n.toFixed(1).replace('.', ',') : ''; })(), // 14 L
      (() => { const n = clampDim(parsePTBRNumber(parts[14] || '')); return n !== null ? n.toFixed(1).replace('.', ',') : ''; })(), // 15 A
      (() => { const n = clampDim(parsePTBRNumber(parts[15] || '')); return n !== null ? n.toFixed(1).replace('.', ',') : ''; })(), // 16 P
      normalizeTags(parts[16] || ''), // 17 Tags (não patch)
      (parts[17] || ''),              // 18 Código Pai (não patch)
      (parts[18] || '').toUpperCase(),// 19 Marca
      String(parts[19] || '0'),       // 20 Volumes
      stripHtmlShortDesc(parts[20] || ''), // 21 Descrição curta
      imgs.join(',')                  // 22 Imagens (CSV)
    ];

    const warnings: string[] = [];

    const toFloat = (val: string): number | null => {
      const t = (val || '').trim().replace(',', '.');
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    };

    // Swap de pesos se bruto < líquido
    const pesoLiq = toFloat(_22[10]);
    const pesoBru = toFloat(_22[11]);
    if (pesoLiq !== null && pesoBru !== null && pesoBru < pesoLiq) {
      const tmp = _22[11];
      _22[11] = _22[10];
      _22[10] = tmp;
      warnings.push('weight_swap: peso_bruto < peso_liquido — valores invertidos');
    }

    // Avisos
    const dimCols = [13, 14, 15];
    for (const i of dimCols) {
      const n = toFloat(_22[i]);
      if (n !== null && (n < 0.5 || n > 200)) warnings.push('dims_out_of_range: dimensões fora de [0,5–200] cm; corrigido');
    }
    if ((parts[4] || '').replace(ONLY_DIGITS, '').length !== 8 && _22[4] === '') warnings.push('ncm_invalid_digits: NCM deve ter 8 dígitos; mantido vazio');
    if ((parts[12] || '').replace(ONLY_DIGITS, '').length > 0 && _22[12] === '') warnings.push('ean_invalid: EAN deve ter 13 dígitos; mantido vazio');
    if (_22[9]) warnings.push('supplier_not_patched: Fornecedor não é enviado no PUT');
    if (_22[16]) warnings.push('tags_not_patched: Tags não são enviadas no PUT');
    if (_22[17]) warnings.push('parent_not_patched: Código Pai não é enviado no PUT');
    if ((parts[20] || '').match(HTML_TAG)) warnings.push('html_stripped: tags HTML removidas da descrição curta');

    const cleaned = _22.join('|');
    cleaned_lines.push(cleaned);

    // BN22 -> payload interno (EN)
    const patchPayload = {
      code: _22[1] || undefined,
      name: _22[2] || undefined,
      unit: _22[3] || undefined,
      ncm: _22[4] || undefined,
      price: _22[5] ? Number(_22[5].replace('.', '').replace(',', '.')) : undefined,
      status: (_22[6] || '').toLowerCase().startsWith('a') ? 'A' : 'I',
      cost_price: _22[7] ? Number(_22[7].replace('.', '').replace(',', '.')) : undefined,
      supplier_code: _22[8] || undefined,
      net_weight: _22[10] ? Number(_22[10].replace('.', '').replace(',', '.')) : undefined,
      gross_weight: _22[11] ? Number(_22[11].replace('.', '').replace(',', '.')) : undefined,
      ean: _22[12] || undefined,
      width_cm: _22[13] ? Number(_22[13].replace('.', '').replace(',', '.')) : undefined,
      height_cm: _22[14] ? Number(_22[14].replace('.', '').replace(',', '.')) : undefined,
      depth_cm: _22[15] ? Number(_22[15].replace('.', '').replace(',', '.')) : undefined,
      brand: _22[18] || undefined,
      volumes: _22[19] ? Number(_22[19]) : undefined,
      short_description: _22[20] || undefined,
      images: _22[21] ? _22[21].split(',').map(s => s.trim()).filter(Boolean) : undefined,
    };

    items.push({ input: raw, cleaned, warnings, bnLine: cleaned, patchPayload });
  }

  return { cleaned_lines, errors, items };
}

// ----------------- EN (interno) -> Bling (PT-BR) -----------------
export function toBlingBody(n: Record<string, any>) {
  const body: Record<string, any> = {};

  const ncmDigits = (n.ncm || '').replace(/[^0-9]/g, '');
  if (n.code) body.codigo = n.code;
  if (n.name) body.nome = n.name;
  if (n.unit) body.unidade = n.unit;
  if (ncmDigits) body.ncm = ncmDigits;

  if (typeof n.price === 'number') body.preco = Number(n.price);
  if (typeof n.cost_price === 'number') body.precoCusto = Number(n.cost_price);

  if (n.supplier_code) body.codigoFornecedor = n.supplier_code;

  if (typeof n.net_weight === 'number') body.pesoLiq = Number(n.net_weight);
  if (typeof n.gross_weight === 'number') body.pesoBruto = Number(n.gross_weight);

  if (n.ean) body.gtin = n.ean;

  if (typeof n.width_cm === 'number') body.largura = Number(n.width_cm);
  if (typeof n.height_cm === 'number') body.altura = Number(n.height_cm);
  if (typeof n.depth_cm === 'number') body.profundidade = Number(n.depth_cm);

  if (n.brand) body.marca = String(n.brand).toUpperCase();
  if (typeof n.volumes === 'number') body.volumes = Number(n.volumes);

  if (n.short_description) body.descricaoCurta = String(n.short_description).replace(/<[^>]+>/g, ' ').slice(0, 255).trim();

  return body;
}

// ----------------- Buscar & Montar: stubs seguros -----------------

/**
 * Constrói “esqueletos” a partir de seeds no formato:
 * "*ID|Código|Descrição*" OU "*Código|Descrição*" OU apenas "*Código*"
 * Retorna objetos com { id?, code?, name? } prontos para enrichment.
 */
export function buildSkeletonFromSeeds(seeds: string[]) {
  const out: Array<{ seed: string; id?: string; code?: string; name?: string }> = [];

  for (const raw of seeds || []) {
    const s = sanitizeDelimiters(stripWrappers(raw));
    const parts = s.split('|').map(x => x.trim()).filter(Boolean);

    let id: string | undefined;
    let code: string | undefined;
    let name: string | undefined;

    if (parts.length >= 3) { // ID|Código|Descrição
      id = parts[0];
      code = parts[1];
      name = parts.slice(2).join(' ');
    } else if (parts.length === 2) { // Código|Descrição
      code = parts[0];
      name = parts[1];
    } else if (parts.length === 1) {
      // pode ser só o código
      code = parts[0];
    }

    out.push({ seed: raw, id, code, name });
  }

  return out;
}

/**
 * Enriquecimento “fast/safe” (stub): por ora só retorna os itens
 * (sem chamadas externas). Ponto de extensão futuro para web scraping/API.
 */
export async function fetchEnrichment(
  items: Array<{ ean?: string; code?: string; name?: string; id?: string | number }>,
  _mode: 'safe' | 'fast' = 'safe'
) {
  // No-op: devolve o que recebeu (mantém contrato da rota /search/fetch)
  return items || [];
}
