import express, { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import {
  parseBNAndNormalize,
  buildSkeletonFromSeeds,
  fetchEnrichment,
  PatchPolicy,
  toBlingBody,
} from './services.js';
import {
  getAccessToken,
  getExpiresIn,
  setTokens,
  exchangeCodeForToken,
} from './tokenStore.js';
import {
  blingPutProduct,
  blingPatchSituacao,
  blingFindProductByCode,
  blingGetProductById,
  extractAxiosError,
} from './blingClient.js';

export const router = express.Router();

/** Extrai blocos *...* mesmo com HTML/quebras de linha */
function extractStarBlocksFromJoined(s: string): string[] {
  const text = String(s || '');
  const m = text.match(/\*[\s\S]*?\*/g);
  if (m && m.length) return m;
  return text.split(/\n+/).map(x => x.trim()).filter(Boolean);
}

/* ========================== AUTH ========================== */
router.get('/auth/status', (_req: Request, res: Response) => {
  res.json({ hasToken: !!getAccessToken(), expiresIn: getExpiresIn(), hasRefresh: true });
});

router.get('/auth/start', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const clientId = process.env.BLING_CLIENT_ID!;
    const redirect = process.env.BLING_REDIRECT_URL!;
    const state = randomBytes(16).toString('hex');
    const authURL = new URL('https://www.bling.com.br/Api/v3/oauth/authorize');
    authURL.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirect,
      state,
    }).toString();
    res.redirect(authURL.toString());
  } catch (e) { next(e as Error); }
});

router.get('/auth/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = String(req.query.code || '');
    if (!code) return res.status(400).json({ ok: false, message: 'code ausente' });
    const tokens = await exchangeCodeForToken(code);
    setTokens(tokens);
    res.json({ ok: true, expires_in: tokens.expires_in });
  } catch (e) { next(e as Error); }
});

/* ====================== COLAR & ENVIAR ===================== */
router.post('/bn/parse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawLines: string[] = ((req.body as any)?.lines || []).map((s: any) => String(s ?? ''));
    const blocks = extractStarBlocksFromJoined(rawLines.join('\n'));
    const result = parseBNAndNormalize(blocks);
    res.json(result);
  } catch (e) { next(e as Error); }
});

/* ==================== BUSCAR & MONTAR ===================== */
router.post('/search/build', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawSeeds: string[] = ((req.body as any)?.seeds || []).map((s: any) => String(s ?? ''));
    const seeds = extractStarBlocksFromJoined(rawSeeds.join('\n'));
    const items = buildSkeletonFromSeeds(seeds);
    res.json({ items });
  } catch (e) { next(e as Error); }
});

router.post('/search/fetch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items: Array<{ ean?: string; code?: string; name?: string; id?: string | number }> =
      (req.body as any)?.items || [];
    const mode: 'safe' | 'fast' = (req.body as any)?.mode || 'safe';
    const out = await fetchEnrichment(items, mode);
    res.json({ items: out });
  } catch (e) { next(e as Error); }
});

/* ======================== BLING =========================== */
/** Compatível com o front: body = { id, data } */
router.post('/bling/patch', async (req: Request, res: Response) => {
  const token = getAccessToken();
  if (!token) return res.status(401).json({ ok: false, message: 'auth ausente' });

  const id = Number(String((req.body as any)?.id ?? '').replace(/\D+/g, ''));
  const data = (req.body as any)?.data || {};
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: 'id obrigatório (numérico)' });
  }

  // 1) BN -> PT-BR (apenas campos que o front trouxe)
  const incoming = toBlingBody(PatchPolicy.filterOutgoing(data));

  // 2) GET produto atual para preservar o que não foi enviado
  let current: any = null;
  try {
    current = await blingGetProductById(token, id);
  } catch {
    // se falhar, current fica null (usaremos defaults pontuais)
  }

  // 3) tipo/formato obrigatórios
  const tipo = current?.tipo ? String(current.tipo) : 'P';
  const formato = current?.formato ? String(current.formato) : 'S';

  // 4) Merge seguro: usa BN se veio; senão mantém o valor atual do Bling
  const pick = (key: string) => (incoming[key] !== undefined ? incoming[key] : current?.[key]);

  const normalizeNum = (v: any) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'string') {
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    }
    return Number(v);
  };

  const body: any = { tipo, formato };

  // Identificação e preço
  if (pick('codigo')) body.codigo = pick('codigo');
  if (pick('nome'))   body.nome   = pick('nome');
  const preco = normalizeNum(pick('preco'));
  if (preco !== undefined) body.preco = preco;

  // Campos críticos que não podem ser perdidos
  const unidade = pick('unidade');
  if (unidade) body.unidade = unidade;

  const ncmDigits = String(pick('ncm') || '').replace(/[^0-9]/g, '');
  if (ncmDigits) body.ncm = ncmDigits;

  const gtin = pick('gtin');
  if (gtin) body.gtin = String(gtin);

  const pesoLiq = normalizeNum(pick('pesoLiq'));
  if (pesoLiq !== undefined) body.pesoLiq = pesoLiq;

  const pesoBruto = normalizeNum(pick('pesoBruto'));
  if (pesoBruto !== undefined) body.pesoBruto = pesoBruto;

  const largura = normalizeNum(pick('largura'));
  if (largura !== undefined) body.largura = largura;

  const altura = normalizeNum(pick('altura'));
  if (altura !== undefined) body.altura = altura;

  const profundidade = normalizeNum(pick('profundidade'));
  if (profundidade !== undefined) body.profundidade = profundidade;

  const volumes = normalizeNum(pick('volumes'));
  if (volumes !== undefined) body.volumes = volumes;

  const precoCusto = normalizeNum(pick('precoCusto'));
  if (precoCusto !== undefined) body.precoCusto = precoCusto;

  if (pick('marca')) {
    body.marca = String(pick('marca')).toUpperCase();
  }

  const descricaoCurtaRaw = pick('descricaoCurta');
  if (descricaoCurtaRaw) {
    body.descricaoCurta = String(descricaoCurtaRaw).replace(/<[^>]+>/g, ' ').slice(0, 255).trim();
  } else if (current?.descricaoCurta) {
    body.descricaoCurta = String(current.descricaoCurta).slice(0, 255).trim();
  }

  // 5) PUT produto
  let respProduto: any = null;
  try {
    respProduto = await blingPutProduct(token, id, body);
  } catch (e) {
    const err = extractAxiosError(e);
    return res.status(400).json({ ok: false, stage: 'putProduto', error: err, sentBody: body });
  }

  // 6) PATCH situação (A/I) se veio status no front
  const statusFront = (data?.status || data?.Status || '').toString().toUpperCase();
  if (statusFront === 'A' || statusFront === 'I') {
    try {
      await blingPatchSituacao(token, id, statusFront as 'A' | 'I');
    } catch (e) {
      const err = extractAxiosError(e);
      return res.status(400).json({ ok: false, stage: 'patchSituacao', error: err });
    }
  }

  return res.json({ ok: true, bling: { produto: respProduto } });
});

/* ================ DEBUG: Produto via API Bling ================ */
router.get('/debug/product', async (req: Request, res: Response) => {
  const token = getAccessToken();
  if (!token) return res.status(401).json({ ok: false, message: 'auth ausente' });

  const code = (req.query.code as string) || '';
  const idQ = (req.query.id as string) || '';

  try {
    if (code) {
      const found = await blingFindProductByCode(token, code);
      if (!found?.id) return res.status(404).json({ ok: false, message: 'Produto não encontrado por código' });
      const full = await blingGetProductById(token, found.id);
      return res.json({ ok: true, summary: found, full });
    }
    if (idQ) {
      const full = await blingGetProductById(token, idQ);
      if (!full) return res.status(404).json({ ok: false, message: 'Produto não encontrado por id' });
      return res.json({ ok: true, full });
    }
    return res.status(400).json({ ok: false, message: 'Informe ?code= ou ?id=' });
  } catch (e) {
    return res.status(500).json({ ok: false, message: String(e) });
  }
});
