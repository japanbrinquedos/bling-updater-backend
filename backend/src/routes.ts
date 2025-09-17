import express, { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import {
  parseBNAndNormalize,
  buildSkeletonFromSeeds,
  fetchEnrichment,
  PatchPolicy,
  toBlingBody
} from './services.js';
import {
  getAccessToken,
  getExpiresIn,
  setTokens,
  refreshWithRefreshToken,
  authorizeHeaders,
  exchangeCodeForToken
} from './tokenStore.js';
import { putProduto, patchSituacaoProduto } from './blingClient.js';

export const router = express.Router();

// ---- helper: reconstrói blocos *...* mesmo com quebras de linha/HTML
function extractStarBlocksFromJoined(s: string): string[] {
  const text = String(s || '');
  const m = text.match(/\*[\s\S]*?\*/g);
  if (m && m.length) return m;
  // fallback: sem *...*, usa linhas simples
  return text.split(/\n+/).map(x => x.trim()).filter(Boolean);
}

// ===== Auth =====
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
      state
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

// ===== BN (Colar & Enviar) =====
router.post('/bn/parse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawLines: string[] = ((req.body as any)?.lines || []).map((s: any) => String(s ?? ''));
    // junta tudo e extrai blocos *...* (resiliente a HTML com \n)
    const blocks = extractStarBlocksFromJoined(rawLines.join('\n'));
    const result = parseBNAndNormalize(blocks);
    res.json(result);
  } catch (e) { next(e as Error); }
});

// ===== Buscar & Montar =====
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
    const items: Array<{ ean?: string; code?: string; name?: string; id?: string | number }> = (req.body as any)?.items || [];
    const mode: 'safe' | 'fast' = (req.body as any)?.mode || 'safe';
    const out = await fetchEnrichment(items, mode);
    res.json({ items: out });
  } catch (e) { next(e as Error); }
});

// ===== Bling =====
router.post('/bling/patch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // token
    const token = getAccessToken();
    if (!token) return res.status(401).json({ ok: false, message: 'auth ausente' });

    // aceita id vindo sujo e força só dígitos
    const id = Number(String((req.body as any)?.id ?? '').replace(/\D+/g, ''));
    const data = (req.body as any)?.data || {};
    const dryRun: boolean = !!(req.body as any)?.dryRun;

    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, message: 'id obrigatório (numérico)' });

    // aplica política de patch (filtra campos que não devem ser enviados)
    const filtered = PatchPolicy.filterOutgoing(data);
    // mapeia p/ PT-BR do Bling
    const body = toBlingBody(filtered);

    if (dryRun) {
      return res.json({ ok: true, bodyPreview: body, statusPreview: filtered.status });
    }

    let respProduto: any = null;
    if (Object.keys(body).length) {
      respProduto = await putProduto(id, body, token);
    }

    let respStatus: any = null;
    if (filtered.status === 'A' || filtered.status === 'I') {
      respStatus = await patchSituacaoProduto(id, filtered.status, token);
    }

    res.json({ ok: true, bling: { produto: respProduto, situacao: respStatus } });
  } catch (e) { next(e as Error); }
});
