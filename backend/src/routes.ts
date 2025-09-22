// backend/src/routes.ts
import { Router, Request, Response } from "express";
import axios from "axios";
import { previewRecords, buildPatchFromCols, sanitizeRawRecord, splitBNKeeping22 } from "./services.js";
import { getAccessToken } from "./tokenStore.js";

export const router = Router();

/** Health reencaminhado no server.ts, mas deixo aqui também se precisar */
router.get("/health", (_req, res) => res.json({ ok: true }));

/** Pré-visualização: não toca na API do Bling */
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

/** PATCH no Bling (parcial) — por ID (coluna 1).
 *  Envia SOMENTE campos presentes; não envia fornecedor/tags/código pai.
 */
router.post("/bling/patch", async (req: Request, res: Response) => {
  const results: any[] = [];
  const failures: any[] = [];
  const idempotencyKey = req.header("idempotency-key") || req.body?.idempotencyKey;

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ ok: false, error: "missing_text" });
    }

    // Reutiliza o mesmo parsing da prévia
    const records = (text.includes("*")
      ? previewRecords(text).cleaned_lines.map(sanitizeRawRecord) // já normalizado
      : text.split("\n").map(sanitizeRawRecord)
    ).filter(Boolean);

    const token = await getAccessToken();
    const base = process.env.BLING_API_BASE || "https://www.bling.com.br/Api/v3";

    for (const rec of records) {
      try {
        const { cols, extras } = splitBNKeeping22(rec);
        const { id, body, warnings } = buildPatchFromCols(cols, extras);

        if (!id) {
          failures.push({ id: null, error: { status: 400, message: "id_vazio" } });
          continue;
        }

        // PATCH parcial por ID
        const url = `${base}/produtos/${encodeURIComponent(id)}`;
        const resp = await axios.patch(
          url,
          body,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
              "Content-Type": "application/json",
              ...(idempotencyKey ? { "X-Idempotency-Key": String(idempotencyKey) } : {}),
            },
            validateStatus: () => true,
          }
        );

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
        failures.push({
          id: null,
          error: { status: 500, message: String(e?.message || e) },
        });
      }
    }

    return res.json({ ok: failures.length === 0, idempotencyKey, results, failures });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

export default router;
