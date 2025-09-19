import { Router } from "express";
import { requireAuth } from "./tokenStore.js";
import { parseBNAndNormalize, toBlingPatchBody } from "./services.js";
import crypto from "crypto";

const router = Router();

// Health
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "bling-updater-backend" });
});

// Preview: limpa e normaliza BN 22 colunas (aceita colas com HTML, aspas, *)
router.post("/bling/preview", (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ ok: false, error: { message: "Body.text é obrigatório" } });
    }
    const parsed = parseBNAndNormalize(text);
    // evita 'ok' duplicado
    return res.json({ ok: true, ...parsed });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: { message: e?.message || "Erro" } });
  }
});

// PATCH seletivo no Bling por ID (coluna 1). Imagens em 2ª chamada (best effort).
router.post("/bling/patch", requireAuth, async (req, res) => {
  const accessToken: string = (req as any).accessToken;
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ ok: false, error: { message: "Body.text é obrigatório" } });
    }

    const parsed = parseBNAndNormalize(text);
    const item = parsed.items[0];
    if (!item?.id) {
      return res.status(400).json({ ok: false, error: { message: "ID (coluna 1) é obrigatório" } });
    }

    const body = toBlingPatchBody(item.patchPayload);
    const idem = crypto.randomUUID();

    // PATCH principal (campos: preço, ncm, unidade, pesos, medidas, volumes, gtin, marca, nome, etc.)
    const r1 = await fetch(`https://www.bling.com.br/Api/v3/produtos/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Idempotency-Key": idem,
      },
      body: JSON.stringify(body),
    });

    const j1 = await r1.json().catch(() => ({}));
    if (!r1.ok) {
      return res.status(r1.status).json({
        ok: false,
        stage: "patchProduto",
        error: { status: r1.status, message: j1, payload: j1 },
      });
    }

    // Imagens (opcional): tentamos atualizar se vieram URLs
    let imagesResult: any = null;
    if (item.images?.length) {
      // Estratégia "best-effort": alguns tenants exigem configuração de "URL de imagens" no cadastro.
      // Enviamos em endpoint dedicado (quando disponível) ou no próprio produto,
      // priorizando não travar o update dos demais campos.
      const idem2 = crypto.randomUUID();

      // Tentativa 1: endpoint dedicado (com 'substituir')
      const rImg = await fetch(
        `https://www.bling.com.br/Api/v3/produtos/${encodeURIComponent(item.id)}/imagens`,
        {
          method: "PUT", // conjunto completo (replace)
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Idempotency-Key": idem2,
          },
          body: JSON.stringify({
            substituir: true,
            imagens: item.images.map((url: string) => ({ url })),
          }),
        }
      );

      if (rImg.ok) {
        imagesResult = await rImg.json().catch(() => ({}));
      } else {
        // Tentativa 2: PATCH no próprio produto (fallback) — se a API aceitar este formato
        const rImg2 = await fetch(
          `https://www.bling.com.br/Api/v3/produtos/${encodeURIComponent(item.id)}`,
          {
            method: "PATCH",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify({
              imagens: {
                substituir: true,
                urls: item.images,
              },
            }),
          }
        );
        imagesResult = rImg2.ok ? await rImg2.json().catch(() => ({})) : { skipped: true, status: rImg.status };
      }
    }

    // sucesso
    return res.json({
      ok: true,
      preview: parsed,
      result: j1,
      images: imagesResult ?? { skipped: true },
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      stage: "patchProduto",
      error: { message: e?.message || "Erro inesperado" },
    });
  }
});

export default router;
