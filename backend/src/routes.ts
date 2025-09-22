// backend/src/routes.ts
import { Router, Request, Response } from "express";
import axios from "axios";

// Parser / Preview / Patch
import {
  previewRecords,
  sanitizeRawRecord,
  splitBNKeeping22,
  buildPatchFromCols,
} from "./services.js";

// Auth helpers (armazenamento em memória com refresh)
import {
  getAuthStatus,
  startAuthUrl,
  exchangeCodeAndStore,
  getAccessToken,
} from "./tokenStore.js";

export const router = Router();

/* ---------------------------- HEALTH CHECK ---------------------------- */
router.get("/health", (_req, res) => res.json({ ok: true }));

/* ------------------------------- AUTH ------------------------------- */
// Status usado pelo badge “Auth: OK/ERRO”
router.get("/auth/status", (_req, res) => {
  const s = getAuthStatus();
  res.json({ ok: true, ...s });
});

// Início do OAuth (redireciona para o Bling)
router.get("/auth/start", (_req, res) => {
  const out = startAuthUrl();
  if (!out.ok) {
    return res
      .status(500)
      .send(`Auth start indisponível: ${out.error ?? "verifique variáveis de ambiente"}`);
  }
  return res.redirect(out.url!);
});

// Callback do OAuth (troca code por tokens e salva no tokenStore)
router.get("/auth/callback", async (req: Request, res: Response) => {
  const code = String(req.query.code || "");
  if (!code) return res.status(400).json({ ok: false, error: "missing_code" });

  try {
    const out = await exchangeCodeAndStore(code);
    if (!out.ok) return res.status(400).json(out);
    // fecha popup/aba e sinaliza sucesso
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`<script>window.close && window.close();</script>OK`);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* --------------------------- PRÉ-VISUALIZAÇÃO --------------------------- */
router.post("/bling/preview", (req: Request, res: Response) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ ok: false, error: "missing_text" });
    }
    const preview = previewRecords(text);
    return res.json({ ok: true, ...preview });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

/* ------------------------------- PATCH ------------------------------- */
// Atualização parcial no Bling (por ID) — respeita contratos combinados
router.post("/bling/patch", async (req: Request, res: Response) => {
  const results: any[] = [];
  const failures: any[] = [];
  const idempotencyKey = req.header("idempotency-key") || req.body?.idempotencyKey;

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ ok: false, error: "missing_text" });
    }

    // Reaproveita a mesma limpeza da prévia
    const records = (text.includes("*")
      ? previewRecords(text).cleaned_lines.map(sanitizeRawRecord)
      : text.split("\n").map(sanitizeRawRecord)
    ).filter(Boolean);

    const token = await getAccessToken(); // cuida do refresh automaticamente
    const base = process.env.BLING_API_BASE || "https://www.bling.com.br/Api/v3";

    for (const rec of records) {
      try {
        const { cols, extras } = splitBNKeeping22(rec);
        const { id, body, warnings } = buildPatchFromCols(cols, extras);

        if (!id) {
          failures.push({ id: null, error: { status: 400, message: "id_vazio" } });
          continue;
        }

        const url = `${base}/produtos/${encodeURIComponent(id)}`;
        const resp = await axios.patch(url, body, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(idempotencyKey ? { "X-Idempotency-Key": String(idempotencyKey) } : {}),
          },
          validateStatus: () => true,
        });

        if (resp.status >= 200 && resp.status < 300) {
          results.push({ id, ok: true, warnings });
        } else {
          failures.push({
            id,
            error: {
              status: resp.status,
              message: `bling_error ${resp.status}: ${JSON.stringify(resp.data)}`,
              payload: resp.data,
            },
          });
        }
      } catch (e: any) {
        failures.push({ id: null, error: { status: 500, message: String(e?.message || e) } });
      }
    }

    return res.json({ ok: failures.length === 0, idempotencyKey, results, failures });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

export default router;
