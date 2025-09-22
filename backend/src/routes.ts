import express from "express";
import { buildAuthorizeUrl, patchProduct, putProductImages } from "./blingClient.js";
import { buildSkeletonFromSeeds, parseBNAndNormalize } from "./services.js";
import { exchangeCodeForToken, getStatus, refreshToken, requireAuth } from "./tokenStore.js";
import { uuid } from "./utils.js";

const router = express.Router();

// health
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "bling-updater-backend" });
});

// OAuth start
const stateMem = new Set<string>();
router.get("/auth/start", (req, res) => {
  const s = uuid();
  stateMem.add(s);
  const url = buildAuthorizeUrl(s);
  res.redirect(url);
});

// OAuth callback
router.get("/auth/callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  try {
    if (!stateMem.has(state)) throw new Error("invalid_state");
    stateMem.delete(state);
    await exchangeCodeForToken(code);
    const back = process.env.FRONTEND_URL || "/";
    res.redirect(back);
  } catch (e: any) {
    res.status(400).json({ ok: false, error: { message: e?.message || "auth_error" } });
  }
});

// status
router.get("/auth/status", (_req, res) => {
  res.json(getStatus());
});

// manual refresh
router.post("/auth/refresh", async (_req, res) => {
  try {
    const st = await refreshToken();
    res.json(st);
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || "refresh_error" });
  }
});

// Preview BN
router.post("/bling/preview", (req, res) => {
  try {
    const bn: string = String(req.body?.bn ?? "");
    const parsed = parseBNAndNormalize(bn);
    res.json({ ok: true, ...parsed });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || "preview_error" });
  }
});

// PATCH (parcial) + PUT imagens (se houver)
router.post("/bling/patch", requireAuth, async (req, res) => {
  const bn: string = String(req.body?.bn ?? "");
  const idem = (req.header("Idempotency-Key") || uuid()).toString();

  const parsed = parseBNAndNormalize(bn);
  const results: any[] = [];
  const failures: any[] = [];

  for (const it of parsed.items) {
    const id = String(it.id || "").trim();
    if (!id) {
      failures.push({ id: null, error: "missing_id" });
      continue;
    }
    try {
      // PATCH parcial — enviar SOMENTE as chaves presentes
      const patchPayload = it.patchPayload || {};
      const patchResp = await patchProduct(id, patchPayload, idem);

      let imagesResp: any = undefined;
      if (Array.isArray(it.images) && it.images.length > 0) {
        // Replace de imagens SÓ se o BN vier com imagens
        imagesResp = await putProductImages(id, it.images, idem);
      }

      results.push({
        id,
        idempotencyKey: idem,
        patch: { status: "ok", response: patchResp },
        images: imagesResp ? { status: "ok", count: it.images.length, response: imagesResp } : undefined,
        warnings: it.warnings
      });
    } catch (e: any) {
      failures.push({
        id,
        idempotencyKey: idem,
        error: { status: e?.status || 500, message: e?.message || "patch_failed", payload: e?.payload }
      });
    }
  }

  res.status(failures.length ? 207 : 200).json({
    ok: failures.length === 0,
    idempotencyKey: idem,
    results,
    failures,
    preview: { errors: parsed.errors }
  });
});

// Buscar & Montar — esqueleto 22 colunas
router.post("/bling/skeleton", (req, res) => {
  try {
    const seeds: string = String(req.body?.seeds ?? "");
    const lines = buildSkeletonFromSeeds(seeds);
    res.json({ ok: true, lines });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e?.message || "skeleton_error" });
  }
});

export default router;
