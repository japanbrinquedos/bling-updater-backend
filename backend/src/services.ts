/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Parser / normalizador da coluna BN (22 colunas) com salvaguardas:
 * - Remove * e aspas no início/fim
 * - Converte \t -> | (sem perder vazios)
 * - Mantém vazios entre pipes
 * - Converte vírgula decimal -> ponto APENAS para campos numéricos
 * - Coluna 22 = imagens (aceita CSV). Qualquer coisa após a 22 vira imagem extra
 * - NÃO envia Grupo de Tags/Tags (col. 17) nem Código Pai (col. 18)
 * - Mantém HTML da descrição curta (col. 21)
 */

export type ParsedItem = {
  id: string;
  bnLine: string;
  patchPayload: Record<string, any>;
};

export type ParseResult = {
  cleaned_lines: string[];
  items: ParsedItem[];
  errors: string[];
};

const NUM = (v: string): number | undefined => {
  if (!v) return undefined;
  // troca vírgula decimal por ponto e remove espaços
  const s = v.replace(/\s+/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const cleanNCM = (v: string): string | undefined => {
  if (!v) return undefined;
  const s = v.replace(/\D/g, '');
  return s.length ? s : undefined;
};

const trimOrUndef = (v: string): string | undefined => {
  const s = (v ?? '').trim();
  return s ? s : undefined;
};

const normalizeLine = (line: string): string => {
  let s = (line ?? '').trim();

  // remove aspas/asteriscos de borde
  s = s.replace(/^[*"']+/, '').replace(/[*"']+$/, '');

  // \t -> |
  s = s.replace(/\t/g, '|');

  // remove espaços ao redor de pipes (preserva vazios)
  s = s.replace(/\s*\|\s*/g, '|');

  return s;
};

const split22 = (s: string): { cols: string[]; extras: string[] } => {
  const raw = s.split('|'); // preserva vazios
  const cols: string[] = [];
  for (let i = 0; i < 22; i++) cols.push(raw[i] ?? '');
  const extras = raw.slice(22);
  return { cols, extras };
};

const gatherImages = (col22: string, extras: string[]): string[] => {
  const urls: string[] = [];
  const pushCsv = (chunk: string) => {
    chunk
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean)
      .forEach((u) => urls.push(u));
  };
  if (col22) pushCsv(col22);
  if (extras?.length) {
    extras
      .map((x) => x?.trim())
      .filter(Boolean)
      .forEach((x) => pushCsv(x));
  }
  // filtra o que parece URL http/https
  return urls.filter((u) => /^https?:\/\//i.test(u));
};

export function parseBNAndNormalize(lines: string[]): ParseResult {
  const cleaned_lines: string[] = [];
  const items: ParsedItem[] = [];
  const errors: string[] = [];

  (lines || []).forEach((raw, idx) => {
    const norm = normalizeLine(raw);
    if (!norm) return; // ignora linhas vazias

    const { cols, extras } = split22(norm);

    if (cols.length < 22) {
      errors.push(`Linha ${idx + 1}: ${cols.length} colunas (<22)`);
    }

    // mapeamento por índice (1-baseado na documentação; aqui 0-baseado):
    const id                 = cols[0];   // 1: ID (do Bling)
    const code               = cols[1];   // 2: Código (SKU)
    const name               = cols[2];   // 3: Nome
    const unit               = cols[3];   // 4: Unidade
    const ncmRaw             = cols[4];   // 5: NCM
    const priceRaw           = cols[5];   // 6: Preço
    const statusRaw          = cols[6];   // 7: Situação (Ativo/Inativo)
    const costRaw            = cols[7];   // 8: Custo
    // 9 e 10 = fornecedor (IGNORAR em PATCH conforme contrato)
    const netWRaw            = cols[10];  // 11: Peso Líquido
    const grossWRaw          = cols[11];  // 12: Peso Bruto
    const ean                = cols[12];  // 13: EAN
    const widthRaw           = cols[13];  // 14: Largura (cm)
    const heightRaw          = cols[14];  // 15: Altura (cm)
    const depthRaw           = cols[15];  // 16: Profundidade (cm)
    // 17: Grupo de Tags/Tags (IGNORAR)
    // 18: Código Pai (IGNORAR)
    const brand              = cols[18];  // 19: Marca
    const volumesRaw         = cols[19];  // 20: Volumes
    const short_description  = cols[20];  // 21: Descrição curta (HTML permitido)
    const imagesCol          = cols[21];  // 22: Imagens (CSV)

    const ncm        = cleanNCM(ncmRaw) ?? undefined;
    const price      = NUM(priceRaw);
    const cost_price = NUM(costRaw);
    const net_weight = NUM(netWRaw);
    const gross_weight = NUM(grossWRaw);
    const width_cm   = NUM(widthRaw);
    const height_cm  = NUM(heightRaw);
    const depth_cm   = NUM(depthRaw);
    const volumes    = NUM(volumesRaw);
    const status     = (statusRaw || '').toLowerCase().startsWith('ati') ? 'A' : 'I';

    const images = gatherImages(imagesCol, extras);

    // monta payload de PATCH (somente campos que podemos atualizar)
    const payload: Record<string, any> = {};

    // strings
    if (trimOrUndef(code))  payload.code  = code.trim();
    if (trimOrUndef(name))  payload.name  = name.trim();
    if (trimOrUndef(unit))  payload.unit  = unit.trim();
    if (trimOrUndef(ncm || '')) payload.ncm = ncm;
    if (trimOrUndef(ean))   payload.ean   = ean.trim();
    if (trimOrUndef(brand)) payload.brand = brand.trim();
    if (trimOrUndef(short_description)) payload.short_description = short_description;

    // status
    if (status) payload.status = status; // 'A' ou 'I'

    // números (só inclui se for número válido)
    if (price !== undefined)        payload.price        = price;
    if (cost_price !== undefined)   payload.cost_price   = cost_price;
    if (net_weight !== undefined)   payload.net_weight   = net_weight;
    if (gross_weight !== undefined) payload.gross_weight = gross_weight;
    if (width_cm !== undefined)     payload.width_cm     = width_cm;
    if (height_cm !== undefined)    payload.height_cm    = height_cm;
    if (depth_cm !== undefined)     payload.depth_cm     = depth_cm;
    if (volumes !== undefined)      payload.volumes      = volumes;

    // imagens (se vierem, respeitamos a estratégia no blingClient.ts)
    if (images.length) payload.images = images;

    // ID é obrigatório para sync
    const finalId = (id || '').trim();
    if (!finalId) {
      errors.push(`Linha ${idx + 1}: ID (coluna 1) ausente`);
    }

    // linha “limpa” só para debug/preview (mantém HTML na col. 21)
    const cleaned = [
      finalId,
      code,
      name,
      unit,
      ncm ?? '',
      price !== undefined ? String(price) : '',
      status,
      cost_price !== undefined ? String(cost_price) : '',
      '', // fornecedor cod (ignorado no PATCH)
      '', // fornecedor nome (ignorado no PATCH)
      net_weight !== undefined ? String(net_weight) : '',
      gross_weight !== undefined ? String(gross_weight) : '',
      ean,
      width_cm !== undefined ? String(width_cm) : '',
      height_cm !== undefined ? String(height_cm) : '',
      depth_cm !== undefined ? String(depth_cm) : '',
      '', // Grupo de Tags/Tags (ignorado)
      '', // Código Pai (ignorado)
      brand,
      volumes !== undefined ? String(volumes) : '',
      short_description,
      images.join(','),
    ].join('|');

    cleaned_lines.push(cleaned);

    items.push({
      id: finalId,
      bnLine: cleaned,
      patchPayload: payload,
    });
  });

  return { cleaned_lines, items, errors };
}
