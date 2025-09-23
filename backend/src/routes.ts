/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import { randomUUID } from 'node:crypto';

import { parseBNAndNormalize } from './services.js';
import { blingPatch } from './blingClient.js';
import * as tokenStore from './tokenStore.js';

export const router = Router();

/* ============ Helpers & ENVs ============ */
const FRONTEND_URL =
  process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || '';

const AUTHZ_URL =
  process.env.BLING_AUTHORIZE_URL ||
  'https://www.bling.com.br/Api/v3/oauth/authorize';

const TOKEN_URL =
  process.env.BLING_TOKEN_URL ||
  'https://www.bling.com.br/Api/v3/oauth/token';

const CLIENT_ID = process.env.BLING_CLIENT_ID || '';
const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET || '';
const REDIRECT_URI =
  process.env.BLING_REDIRECT_URI || process.env.BLING_REDIRECT_URL || '';

const SCOPE =
  process.env.BLING_SCOPE || process.env.BLING_SCOPES || 'produtos';

const STATE_COOKIE = 'bling_oauth_state';

/* ============ Rotas de sanidade ============ */
router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

/* ============ AUTH ============ */
/** Inicia OAuth: redireciona para o Bling */
router.get('/auth/start', (req: Request, res: Response) => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return res
      .status(500)
      .send('Auth start indisponível: defina BLING_CLIENT_ID e BLING_REDIRECT_URI.');
  }

  const state = randomUUID();
  // cookie-parser deve estar ligado no server.ts
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 10 * 60 * 1000, // 10min
    path: '/',
  });

  const url =
    `${AUTHZ_URL}?response_type=code` +
    `&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&state=${encodeURIComponent(state)}`;

  return res.redirect(302, url);
});

/** Callback do OAuth: troca code por tokens e salva no tokenStore */
router.get('/auth/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<
    string,
    string
  >;

  if (error) {
    return res.status(400).json({ ok: false, error, error_description });
  }
  if (!code) {
    return res.status(400).json({ ok: false, error: 'missing_code' });
  }

  const savedState = (req as any).cookies?.[STATE_COOKIE];
  if (!savedState || savedState !== state) {
    return res.status(400).json({ ok: false, error: 'state_mismatch' });
  }

  try {
    const form = new URLSearchParams();
    form.set('grant_type', 'authorization_code');
    form.set('code', code);
    form.set('redirect_uri', REDIRECT_URI);
    form.set('client_id', CLIENT_ID);
    form.set('client_secret', CLIENT_SECRET);

    const { data } = await axios.post(TOKEN_URL, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000,
    });

    // Salvar tokens no tokenStore — tenta os nomes mais prováveis
    const ts: any = tokenStore;
    if (typeof ts.setTokens === 'function') await ts.setTokens(data);
    else if (typeof ts.saveTokens === 'function') await ts.saveTokens(data);
    else if (typeof ts.updateTokens === 'function') await ts.updateTokens(data);
    else if (typeof ts.ingest === 'function') await ts.ingest(data);

    // limpa state
    res.clearCookie(STATE_COOKIE, { path: '/' });

    const back = FRONTEND_URL
      ? `${FRONTEND_URL.replace(/\/$/, '')}?auth=ok`
      : '/';
    return res.redirect(302, back);
  } catch (err: any) {
    const payload = err?.response?.data ?? { message: String(err) };
    return res
      .status(400)
      .json({ ok: false, error: 'token_exchange_failed', payload });
  }
});

/** Status da autenticação para o front */
router.get('/auth/status', async (_req: Request, res: Response) => {
  try {
    const ts: any = tokenStore;

    if (typeof ts.getStatus === 'function') {
      const s = await ts.getStatus();
      return res.json({ ok: true, ...s });
    }
    if (typeof ts.status === 'function') {
      const s = await ts.status();
      return res.json({ ok: true, ...s });
    }

    // fallback simples: se temos access token válido
    const token =
      typeof ts.getAccessToken === 'function'
        ? await ts.getAccessToken()
        : undefined;

    return res.json({
      ok: true,
      authenticated: !!token,
      expires_in: token ? 1800 : 0,
      has_refresh: typeof ts.refresh === 'function',
      scope: SCOPE || '',
    });
  } catch {
    return res.json({
      ok: true,
      authenticated: false,
      expires_in: 0,
      has_refresh: false,
      scope: '',
    });
  }
});

/* ============ PREVIEW (parser) ============ */
function pickLines(body: any): string[] {
  const raw: string =
    (typeof body?.text === 'string' && body.text) ||
    (typeof body?.payload === 'string' && body.payload) ||
    '';

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l)
    .filter((l) => l.trim().length > 0);

  if (Array.isArray(body?.lines) && body.lines.length) {
    return body.lines;
  }
  return lines;
}

router.post('/preview', (req: Request, res: Response) => {
  const lines = pickLines(req.body);
  if (!lines.length) {
    return res.status(400).json({ ok: false, error: 'missing_text' });
  }

  const parsed = parseBNAndNormalize(lines);
  return res.json({
    ok: parsed.errors.length === 0,
    ...parsed,
  });
});

/* ============ PATCH parcial no Bling ============ */
router.post('/bling/patch', async (req: Request, res: Response) => {
  const lines = pickLines(req.body);
  if (!lines.length) {
    return res.status(400).json({ ok: false, error: 'missing_text' });
  }

  const parsed = parseBNAndNormalize(lines);
  const idempotencyKey =
    (req.header('idempotency-key') as string | undefined) || undefined;

  try {
    const result = await blingPatch(parsed.items, { idempotencyKey });
    return res.json({
      ok: result.failures.length === 0,
      idempotencyKey: result.idempotencyKey,
      results: result.results,
      failures: result.failures,
      preview: { errors: parsed.errors },
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
      preview: { errors: parsed.errors },
    });
  }
});

export default router;
