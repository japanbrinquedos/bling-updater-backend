import express, { Request, Response } from 'express';
import * as tokenStore from './tokenStore.js';
import { parseBNAndNormalize } from './services.js';
import { blingPatch } from './blingClient.js';

export const router = express.Router();

/* ----------------------------- AUTH (intocado) ---------------------------- */
router.get('/auth/status', async (_req, res) => {
  try {
    if (typeof (tokenStore as any).authStatus === 'function') {
      return (tokenStore as any).authStatus(_req, res);
    }
    return res.json({ ok: true, authenticated: false, expires_in: 0, has_refresh: false, scope: '' });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'auth_status_error', message: e?.message || String(e) });
  }
});

router.get('/auth/start', async (req, res) => {
  try {
    if (typeof (tokenStore as any).authStart === 'function') {
      return (tokenStore as any).authStart(req, res);
    }
    return res
      .status(400)
      .send('Auth start indisponível: defina BLING_CLIENT_ID e BLING_REDIRECT_URL.');
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'auth_start_error', message: e?.message || String(e) });
  }
});

router.get('/auth/callback', async (req, res) => {
  try {
    if (typeof (tokenStore as any).authCallback === 'function') {
      return (tokenStore as any).authCallback(req, res);
    }
    return res.status(400).json({ ok: false, error: 'callback_handler_missing_in_tokenStore' });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'auth_callback_error', message: e?.message || String(e) });
  }
});

/* --------------------------- PREVIEW (robustecido) ------------------------ */
/** Extrai o texto de JSON, text/plain, form-urlencoded ou “casos estranhos”. */
function getTextFromAny(req: Request): string {
  const body: any = (req as any).body;

  // 1) Se o body é string (text/plain ou JSON cru)
  if (typeof body === 'string') {
    const s = body.trim();
    // Se parece JSON, tenta parsear para achar { text } ou { lines }
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        const obj = JSON.parse(s);
        if (obj && typeof obj.text === 'string') return obj.text;
        if (obj && Array.isArray(obj.lines)) return obj.lines.join('\n');
      } catch {
        /* ignora, trata como texto cru */
      }
    }
    return s;
  }

  // 2) JSON normal
  if (body && typeof body === 'object') {
    if (typeof body.text === 'string') return body.text;
    if (Array.isArray(body.lines)) return body.lines.join('\n');

    // 3) Form-urlencoded sem "text": às vezes a string vem como chave
    const keys = Object.keys(body);
    if (keys.length === 1) {
      const onlyKey = keys[0];
      if (onlyKey.includes('|') || onlyKey.includes('*')) return onlyKey; // a chave é a própria linha BN
      const v = (body as any)[onlyKey];
      if (typeof v === 'string') return v;
    }
  }

  return '';
}

// Aceita text/plain também só nesta rota (sem afetar o resto)
const textForPreview = express.text({
  type: ['text/plain', 'text/*', 'application/octet-stream'],
  limit: '1mb',
});

router.post('/preview', textForPreview, (req: Request, res: Response) => {
  try {
    const text = getTextFromAny(req);
    if (!text || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'missing_text' });
    }
    const rawLines = text.split(/\r?\n/);
    const { cleaned_lines, items, errors } = parseBNAndNormalize(rawLines);
    return res.json({ ok: true, cleaned_lines, items, errors });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: 'preview_exception',
      message: e?.message || String(e),
    });
  }
});

/* ------------------------------ PATCH (sem mexer) ------------------------- */
/**
 * Atualização parcial (PATCH) no Bling.
 * Aceita corpo com { text } OU { lines: [...] } ou text/plain.
 * Mantém os contratos combinados:
 *  - Chave é o ID (coluna 1) para sincronizar com produto no Bling
 *  - Não envia/atualiza **Tags** e **Fornecedor**
 *  - Imagens: regra Replace/Append conforme sua configuração em services.ts
 */
router.post('/bling/patch', textForPreview, async (req: Request, res: Response) => {
  try {
    const text = getTextFromAny(req);
    const lines = text ? text.split(/\r?\n/) : Array.isArray((req as any).body?.lines) ? (req as any).body.lines : [];

    if (!lines.length) return res.status(400).json({ ok: false, error: 'missing_text' });

    const { items, errors } = parseBNAndNormalize(lines);
    if (errors?.length) {
      // ainda permite seguir, mas retorna os avisos
    }

    // idempotency-key opcional do front; se não vier, blingPatch gera um
    const idem = (req.headers['idempotency-key'] as string) || undefined;
    const result = await blingPatch(items, idem);

    return res.json({
      ok: true,
      idempotencyKey: result.idempotencyKey,
      results: result.results || [],
      failures: result.failures || [],
      preview: { errors },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'patch_exception', message: e?.message || String(e) });
  }
});
