/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import { parseBNAndNormalize } from "./services.js";
import { blingPatchResolveAndPatch } from "./blingClient.js";
import { requireAuth } from "./tokenStore.js";

export const router = Router();

/** Health-check */
router.get("/health", (_req, res) => res.json({ ok: true }));

/** Pré-visualização (normaliza a BN e mostra o payload parcial gerado) */
router.post("/preview", (req, res) => {
  const { bn } = req.body as { bn: string };
  if (!bn || typeof bn !== "string") {
    return res.status(400).json({ ok: false, error: "bn(string) obrigatório" });
  }
  const parsed = parseBNAndNormalize(bn);
  return res.json(parsed);
});

/**
 * PATCH parcial no Bling com base na BN:
 * - Usa ID (coluna 1) como chave primária; se faltar, cai para Código (coluna 2).
 * - Atualiza SOMENTE os campos enviados (sem defaults).
 * - Nunca envia Fornecedor (nome) nem Tags.
 * - Imagens: se vierem na BN, são enviadas e **substituem** a galeria (Replace).
 */
router.post("/bling/patch", requireAuth, async (req, res) => {
  try {
    const { bn } = req.body as { bn: string };
    if (!bn || typeof bn !== "string") {
      return res.status(400).json({ ok: false, stage: "validate", error: "bn(string) obrigatório" });
    }

    const parsed = parseBNAndNormalize(bn);
    if (parsed.errors.length) {
      return res.status(400).json({ ok: false, stage: "parse", errors: parsed.errors, preview: parsed });
    }

    // nesta versão, processamos a PRIMEIRA linha (igual seu fluxo atual)
    const item = parsed.items[0];
    const idempotencyKey = (req.headers["idempotency-key"] as string) || undefined;

    const token = (req as any).accessToken as string;
    const result = await blingPatchResolveAndPatch(token, item.patchPayload, idempotencyKey);

    if (!result.ok) {
      return res.status(result.error.status ?? 500).json(result);
    }
    return res.json({ ok: true, ...result, preview: parsed });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      stage: "bling/patch",
      error: e?.response?.data ?? e?.message ?? "Erro inesperado",
    });
  }
});
