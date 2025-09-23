/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Request, type Response } from 'express';
import { parseBNAndNormalize } from './services.js';
import { blingPatch } from './blingClient.js';

export const router = Router();

// sanidade
router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// util local
function pickLines(body: any): string[] {
  const raw: string =
    (typeof body?.text === 'string' && body.text) ||
    (typeof body?.payload === 'string' && body.payload) ||
    '';

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l)
    .filter((l) => l.trim().length > 0);

  // também aceita body.lines: string[]
  if (Array.isArray(body?.lines) && body.lines.length) {
    return body.lines;
  }

  return lines;
}

// pré-visualização (não chama Bling)
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

// PATCH no Bling (parcial, conforme contratos)
router.post('/bling/patch', async (req: Request, res: Response) => {
  const lines = pickLines(req.body);
  if (!lines.length) {
    return res.status(400).json({ ok: false, error: 'missing_text' });
  }

  const parsed = parseBNAndNormalize(lines);

  // se parser achou erro estrutural, ainda assim permitimos seguir (você decide no front)
  const idem = (req.header('idempotency-key') as string | undefined) || undefined;

  try {
    const result = await blingPatch(parsed.items, { idempotencyKey: idem });
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
