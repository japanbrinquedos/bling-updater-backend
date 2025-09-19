/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import crypto from "crypto";
import { requireAuth } from "./tokenStore.js";
import { parseBNAndNormalize, toBlingPatchBody } from "./services.js";
import { patchProdutoById, putImagensReplace, patchProdutoImagensFallback } from "./blingClient.js";

export const router = Router(); // named export

router.get("/health", (_req, res) => res.json({ ok: true, service: "bling-updater-backend" }));

// Preview — aceita body { bn } ou { text }
router.post("/bling/preview", (req, res) => {
  try {
    const body = req.body || {};
    const txt = typeof body.bn === "string" ? body.bn : body.text;
    if (!txt) return res.status(400).json({ ok: false, error: { message: "Body.bn (ou text) é obrigatório" } });
    const parsed = parseBNAndNormalize(txt);
    return res.json({ ok: true, ...parsed });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: { message: e?.message || "Erro" } });
  }
});

/**
 * PATCH parcial:
 * - Chave primária: ID (coluna 1). Se faltar, erro 400.
 * - Atualiza só campos enviados (exceto fornecedor/tags)
 * - Imagens: se vierem URLs -> REPLACE (endpoint dedicado; fallback se necessário)
 */
router.post("/bling/patch", requireAuth, async (req, res) => {
  const accessToken: string = (req as any).accessToken;
  try {
    const bodyIn = req.body || {};
    const txt = typeof bodyIn.bn === "string" ? bodyIn.bn : bodyIn.text;
    if (!txt) return res.status(400).json({ ok: false, error: { message: "Body.bn (ou text) é obrigatório" } });

    const parsed = parseBNAndNormalize(txt);
    const item = parsed.items[0];
    if (!item?.id) return res.status(400).json({ ok: false, error: { message: "ID (col.1) é obrigatório" } });

    const idem = (req.headers["idempotency-key"] as string) || crypto.randomUUID();
    const patchBody = toBlingPatchBody(item.patchPayload);

    // 1) PATCH principal
    const r1 = await patchProdutoById(accessToken, item.id, patchBody, idem);

    // 2) Imagens (opcional — replace)
    let imagesResult: any = { skipped: true };
    if (item.images?.length) {
      try {
        imagesResult = await putImagensReplace(accessToken, item.id, item.images, crypto.randomUUID());
      } catch (err1: any) {
        try {
          imagesResult = await patchProdutoImagensFallback(accessToken, item.id, item.images, crypto.randomUUID());
        } catch (err2: any) {
          imagesResult = { skipped: true, error: err2?.data ?? err1?.data ?? "imagens failed" };
        }
      }
    }

    return res.json({
      ok: true,
      patch: r1,
      images: imagesResult,
      preview: parsed
    });
  } catch (e: any) {
    const status = e?.status || e?.response?.status || 500;
    return res.status(status).json({ ok: false, error: e?.data || e?.response?.data || { message: e?.message || "Erro" } });
  }
});

export default router; // default export também
