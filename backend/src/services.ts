import axios from 'axios';

// ======== Tipos ========
export type BNRow = [
  string, string, string, string, string, string, string, string, string, string, string,
  string, string, string, string, string, string, string, string, string, string, string
];

export interface BNParseItem {
  input: string;
  cleaned: string;
  warnings: string[];
  bnLine: string;           // 22 colunas garantidas
  patchPayload: Record<string, any>; // payload filtrado para PATCH (policy)
}

export interface BNParseResponse {
  cleaned_lines: string[];
  errors: string[];
  items: BNParseItem[];
}

export const PatchPolicy = {
  // Campos que NÃO vão no PATCH
  BLOCKLIST: new Set<string>(['supplier','tags','parent_code','fornecedor','grupo_tags','codigo_pai']),
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

// ======== Helpers ========
const ONLY_DIGITS = /[^0-9]/g;
const HTML_TAG = /<[^>]+>/g;

function stripWrappers(s: string): string {
  let t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1).trim();
  if (t.startsWith('*') && t.endsWith('*')) t = t.slice(1, -1).trim();
  if ((t.startsWith('*"') && t.endsWith('"*')) || (t.startsWith("*'") && t.endsWith("'*"))) t = t.slice(2, -2).trim();
  return t;
}

function sanitizeDelimiters(s: string): string {
  return s.replace(/\t/g, ' ').replace(/\s*\|\s*/g, '|').trim();
}

function parsePTBRNumber(x: string | number | null | undefined): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'number') return x;
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
  if (digits.length !== 8) return '';
  return `${digits.slice(0,4)}.${digits.slice(4,6)}.${digits.slice(6,8)}`;
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
  return text;
}
function isHttpUrl(u: string): boolean {
  try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; }
}

// ======== BN parsing/normalização ========
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
      (parts[6] || 'Ativo'), // 7 Situação
      (() => { const n = parsePTBRNumber(parts[7] || ''); return n !== null ? n.toFixed(2).replace('.', ',') : ''; })(), // 8 Preço de custo
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

    const pesoLiq = toFloat(_22[10]);
    const pesoBru = toFloat(_22[11]);
    if (pesoLiq !== null && pesoBru !== null && pesoBru < pesoLiq) {
      const tmp = _22[11];
      _22[11] = _22[10];
      _22[10] = tmp;
      warnings.push('weight_swap: peso_bruto < peso_liquido — valores invertidos');
    }

    const dimCols = [13, 14, 15];
    for (const i of dimCols) {
      const n = toFloat(_22[i]);
      if (n !== null && (n < 0.5 || n > 200)) {
        warnings.push('dims_out_of_range: dimensões fora de [0,5–200] cm; corrigido');
      }
    }

    if ((parts[4] || '').replace(ONLY_DIGITS, '').length !== 8 && _22[4] === '') {
      warnings.push('ncm_invalid_digits: NCM deve ter 8 dígitos; mantido vazio');
    }
    if ((parts[12] || '').replace(ONLY_DIGITS, '').length > 0 && _22[12] === '') {
      warnings.push('ean_invalid: EAN deve ter 13 dígitos; mantido vazio');
    }
    if (_22[9]) warnings.push('supplier_not_patched: Fornecedor não é enviado no PATCH');
    if (_22[16]) warnings.push('tags_not_patched: Tags não são enviadas no PATCH');
    if (_22[17]) warnings.push('parent_not_patched: Código Pai não é enviado no PATCH');
    if ((parts[20] || '').match(HTML_TAG)) warnings.push('html_stripped: tags HTML removidas da descrição curta');

    const cleaned = _22.join('|');
    cleaned_lines.push(cleaned);

    const patchPayload = PatchPolicy.filterOutgoing({
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
    });

    items.push({
      input: raw,
      cleaned,
      warnings,
      bnLine: cleaned,
      patchPayload
    });
  }

  return { cleaned_lines, errors, items };
}

// ===== Buscar & Montar =====
export function buildSkeletonFromSeeds(seeds: string[]) {
  return seeds.map(seed => {
    let s = seed.trim();
    if (s.startsWith('*') && s.endsWith('*')) s = s.slice(1, -1);
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
    s = s.replace(/\t/g, ' ').replace(/\s*\|\s*/g, '|');

    const [id, code, name] = (s.split('|').concat(['', '', ''])).slice(0, 3);

    const skeleton: BNRow = [
      id || '',
      code || '',
      name || '',
      'UN',
      '',
      '',
      'Ativo',
      '',
      '',
      '',
      '',
      '',
      '',
      '', '', '',
      '',
      '',
      '',
      '0',
      '',
      ''
    ];

    return { seed, skeletonBn22: skeleton.join('|'), warnings: [] as string[] };
  });
}

export async function fetchEnrichment(
  items: Array<{ ean?: string; code?: string; name?: string; id?: string | number }>,
  mode: 'safe'|'fast'
) {
  const out: Array<{
    seed: { id: string | number | '', code: string, name: string, ean: string };
    bn22_line: string;
    confidence: Record<string, number>;
    warnings: string[];
  }> = [];

  for (const it of items) {
    const name = (it.name || '').trim();
    const code = (it.code || '').trim();
    const ean = (it.ean || '').replace(ONLY_DIGITS, '');
    const isBook = ean.startsWith('978') || ean.startsWith('979') || ['livro','colorir','atividade'].some(t => name.toLowerCase().includes(t));
    const warnings: string[] = [];
    const confidence: Record<string, number> = {};
    const fill: any = {};

    try {
      if (isBook && ean.length === 13) {
        const r = await axios.get('https://www.googleapis.com/books/v1/volumes', { params: { q: `isbn:${ean}` }, timeout: mode === 'fast' ? 800 : 1500 });
        const vol = r.data?.items?.[0]?.volumeInfo;
        if (vol) {
          if (vol.publisher) { fill.brand = String(vol.publisher).toUpperCase(); confidence.brand = 0.9; }
          if (Array.isArray(vol.categories) && vol.categories.length) { fill.tags = vol.categories.map((c: string) => c.toLowerCase()); confidence.tags = 0.8; }
          if (vol.title && !name) { fill.name = vol.title; confidence.name = 0.9; }
          const dims = (vol as any).dimensions || {};
          const toNum = (x: any) => typeof x === 'string' ? Number(x.toLowerCase().replace(',', '.').replace('cm','').trim()) : null;
          const w = toNum(dims.width), h = toNum(dims.height), d = toNum(dims.thickness || dims.depth);
          if (w) { fill.width_cm = clampDim(w); confidence.width_cm = 0.6; }
          if (h) { fill.height_cm = clampDim(h); confidence.height_cm = 0.6; }
          if (d) { fill.depth_cm = clampDim(d); confidence.depth_cm = 0.6; }
        } else {
          warnings.push('google_books_nohit');
        }
      } else {
        warnings.push('no_external_source_non_book');
      }
    } catch {
      warnings.push('external_lookup_failed');
    }

    const skeleton = buildSkeletonFromSeeds([`*${it.id || ''}|${code}|${name}*`])[0].skeletonBn22.split('|');
    if (fill.name) skeleton[2] = fill.name;
    if (fill.brand) skeleton[18] = fill.brand;
    if (fill.width_cm) skeleton[13] = String(fill.width_cm).replace('.', ',');
    if (fill.height_cm) skeleton[14] = String(fill.height_cm).replace('.', ',');
    if (fill.depth_cm) skeleton[15] = String(fill.depth_cm).replace('.', ',');
    if (fill.tags?.length) skeleton[16] = fill.tags.join(',');

    out.push({
      seed: { id: it.id || '', code, name, ean },
      bn22_line: skeleton.join('|'),
      confidence,
      warnings
    });
  }
  return out;
}

// ===== Map interno(EN) -> corpo PT-BR do Bling =====
export function toBlingBody(n: Record<string, any>) {
  const body: Record<string, any> = {};

  if (n.code) body.codigo = n.code;
  if (n.name) body.nome = n.name;
  if (n.unit) body.unidade = n.unit;
  if (n.ncm) body.ncm = n.ncm;

  if (typeof n.price === 'number') body.preco = n.price;
  if (typeof n.cost_price === 'number') body.precoCusto = n.cost_price;

  if (n.supplier_code) body.codigoFornecedor = n.supplier_code;

  if (typeof n.net_weight === 'number') body.pesoLiq = n.net_weight;
  if (typeof n.gross_weight === 'number') body.pesoBruto = n.gross_weight;

  if (n.ean) body.gtin = n.ean;

  if (typeof n.width_cm === 'number') body.largura = n.width_cm;
  if (typeof n.height_cm === 'number') body.altura = n.height_cm;
  if (typeof n.depth_cm === 'number') body.profundidade = n.depth_cm;

  if (n.brand) body.marca = n.brand;
  if (typeof n.volumes === 'number') body.volumes = n.volumes;

  if (n.short_description) body.descricaoCurta = n.short_description;

  return body;
}
