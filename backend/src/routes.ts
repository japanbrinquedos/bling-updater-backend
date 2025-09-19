/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from "express";
import crypto from "crypto";
import { requireAuth, setTokenBundle, getStatus, getTokenBundle, ensureFreshAccessToken } from "./tokenStore.js";
import { parseBNAndNormalize, toBlingPatchBody } from "./services.js";
import { patchProdutoById, putImagensReplace, patchProdutoImagensFallback } from "./blingClient.js";

export const router = Router();

// ---------- HEALTH ----------
router.get("/health", (_req, res) => res.json({ ok: true, service: "bling-updater-backend" }));

// ---------- OAUTH ----------
router.get("/auth/start", (req, res) => {
  const client_id = process.env.BLING_CLIENT_ID;
  const redirect_uri = process.env.BLING_REDIRECT_URI;
  const scope = process.env.BLING_SCOPE || "produtos";
  if (!client_id || !redirect_uri) {
    return res.status(500).send("Configure BLING_CLIENT_ID e BLING_REDIRECT_URI no Render.");
  }
  const state = crypto.randomUUID();
  const url = new URL("https://www.bling.com.br/Api/v3/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client_id);
  url.searchParams.set("redirect_uri", redirect_uri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

router.get("/auth/callback", async (req, res) => {
  const code = String(req.query.code || "");
  if (!code) return res.status(400).send("Faltou code");
  const client_id = process.env.BLING_CLIENT_ID!;
  const client_secret = process.env.BLING_CLIENT_SECRET!;
  const redirect_uri = process.env.BLING_REDIRECT_URI!;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id,
    client_secret,
    redirect_uri,
  });

  const r = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    return res.status(400).json({ ok: false, error: j });
  }
  const expires_at = Math.floor(Date.now() / 1000) + (Number(j.expires_in ?? 3600) - 60);
  setTokenBundle({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at,
    scope: j.scope,
  });

  // Redireciona para tua página estática
  const front = process.env.FRONTEND_URL || "https://imagens.japanbrinquedos.com.br/japan-brinquedos/";
  res.redirect(front);
});

router.get("/auth/status", async (_req, res) => {
  const st = getStatus();
  res.json({ ok: true, ...st });
});

router.post("/auth/refresh", async (_req, res) => {
  const t = await ensureFreshAccessToken();
  if (!t) return res.status(400).json({ ok: false, error: "Sem token para refresh" });
  const st = getStatus();
  res.json({ ok: true, ...st });
});

// ---------- PREVIEW ----------
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

// ---------- PATCH PRODUTO (ID como chave) ----------
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

    // 1) PATCH principal (apenas campos presentes; não envia fornecedor/tags)
    const r1 = await patchProdutoById(accessToken, item.id, patchBody, idem);

    // 2) Imagens (REPLACE) — best effort
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

    return res.json({ ok: true, patch: r1, images: imagesResult, preview: parsed });
  } catch (e: any) {
    const status = e?.status || e?.response?.status || 500;
    return res.status(status).json({ ok: false, error: e?.data || e?.response?.data || { message: e?.message || "Erro" } });
  }
});

export default router;
