import express from 'express';
import { randomBytes } from 'crypto';
import { URLSearchParams } from 'url';
import {
  parseBNAndNormalize,
  buildSkeletonFromSeeds,
  fetchEnrichment,
  PatchPolicy,
} from './services.js';
import { getAccessToken, getExpiresIn, setTokens, refreshWithRefreshToken, authorizeHeaders, exchangeCodeForToken } from './tokenStore.js';
import { blingPatch, blingListProducts } from './blingClient.js';

export const router = express.Router();

// ===== Auth =====
router.get('/auth/status', (_req, res) => {
  res.json({ hasToken: !!getAccessToken(), expiresIn: getExpiresIn(), hasRefresh: true });
});

router.get('/auth/start', (req, res, next) => {
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
  } catch (e) { next(e); }
});

router.get('/auth/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code || '');
    if (!code) return res.status(400).json({ ok: false, message: 'code ausente' });
    const tokens = await exchangeCodeForToken(code);
    setTokens(tokens);
    res.json({ ok: true, expires_in: tokens.expires_in });
  } catch (e) { next(e); }
});

// ===== BN (Colar & Enviar) =====
router.post('/bn/parse', async (req, res, next) => {
  try {
    const lines: string[] = (req.body?.lines || []).map((s: any) => String(s ?? ''));
    const result = parseBNAndNormalize(lines);
    res.json(result);
  } catch (e) { next(e); }
});

// ===== Buscar & Montar =====
router.post('/search/build', async (req, res, next) => {
  try {
    const seeds: string[] = (req.body?.seeds || []).map((s: any) => String(s ?? ''));
    const items = buildSkeletonFromSeeds(seeds);
    res.json({ items });
  } catch (e) { next(e); }
});

router.post('/search/fetch', async (req, res, next) => {
  try {
    const items: Array<{ ean?: string; code?: string; name?: string; id?: string | number }> = req.body?.items || [];
    const mode: 'safe' | 'fast' = req.body?.mode || 'safe';
    const out = await fetchEnrichment(items, mode);
    res.json({ items: out });
  } catch (e) { next(e); }
});

// ===== Bling =====
router.post('/bling/patch', async (req, res, next) => {
  try {
    const id = Number(req.body?.id);
    const data = req.body?.data || {};
    const dryRun: boolean = !!req.body?.dryRun;
    const idempotencyKey = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '');

    if (!id) return res.status(400).json({ ok: false, message: 'id obrigatório' });

    // aplica política de patch (filtra campos que não devem ser enviados)
    const filtered = PatchPolicy.filterOutgoing(data);

    if (dryRun) {
      return res.json({ ok: true, diff: { after: filtered } });
    }

    const result = await blingPatch(id, filtered, idempotencyKey);
    res.json({ ok: true, result });
  } catch (e) { next(e); }
});

router.post('/auto-fill-missing', async (req, res, next) => {
  try {
    const page = Number(req.body?.page || 1);
    const limit = Number(req.body?.limit || 50);
    const result = await blingListProducts(page, limit);
    res.json({ ok: true, result });
  } catch (e) { next(e); }
});
