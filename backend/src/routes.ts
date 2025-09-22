import { Router, Request, Response } from "express";
import { parseBNAndNormalize, patchFromBN } from "./services.js";
import * as TS from "./tokenStore.js";

export const router = Router();

/* ----------------------------- AUTH ROUTES ----------------------------- */

// GET /auth/status
router.get("/auth/status", async (_req: Request, res: Response) => {
  try {
    const anyTS = TS as any;

    if (typeof anyTS.authStatus === "function") {
      const st = await anyTS.authStatus();
      return res.json(st);
    }
    if (typeof anyTS.getAccessTokenStatus === "function") {
      const st = await anyTS.getAccessTokenStatus();
      return res.json(st);
    }
    if (typeof anyTS.status === "function") {
      const st = await anyTS.status();
      return res.json(st);
    }

    return res.json({ ok: true, authenticated: false, expires_in: 0, has_refresh: false });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// GET /auth/start
router.get("/auth/start", async (req: Request, res: Response) => {
  try {
    const anyTS = TS as any;

    // Se seu tokenStore já implementa, delega.
    if (typeof anyTS.startAuth === "function") {
      return anyTS.startAuth(req, res);
    }

    // Fallback simples sem tocar na sua auth existente
    const clientId = process.env.BLING_CLIENT_ID || "";
    const redirectUri = process.env.BLING_REDIRECT_URL || "";
    const scope = process.env.BLING_SCOPES || "";
    const state = randomState();

    if (!clientId || !redirectUri) {
      return res
        .status(500)
        .send("Auth start indisponível: defina BLING_CLIENT_ID e BLING_REDIRECT_URL.");
    }

    const AUTH_URL =
      process.env.BLING_AUTHORIZE_URL ||
      "https://www.bling.com.br/Api/v3/oauth/authorize";

    const url = new URL(AUTH_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    if (scope) url.searchParams.set("scope", scope);
    url.searchParams.set("state", state);

    return res.redirect(url.toString());
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// GET /auth/callback
router.get("/auth/callback", async (req: Request, res: Response) => {
  try {
    const anyTS = TS as any;

    if (typeof anyTS.handleCallback === "function") {
      return anyTS.handleCallback(req, res);
    }
    if (typeof anyTS.callback === "function") {
      return anyTS.callback(req, res);
    }

    return res.status(500).json({ ok: false, error: "callback_handler_missing_in_tokenStore" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ------------------------------ HEALTH --------------------------------- */

router.get("/health", (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

/* --------------------------- PREVIEW / PATCH --------------------------- */

// POST /preview
router.post("/preview", (req: Request, res: Response) => {
  try {
    const { lines } = req.body || {};
    const out = parseBNAndNormalize(String(lines || ""));
    return res.json(out);
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /bling/patch
router.post("/bling/patch", async (req: Request, res: Response) => {
  try {
    const { lines } = req.body || {};
    const out = await patchFromBN(String(lines || ""));
    return res.json(out);
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

/* --------------------------------- UTIL -------------------------------- */

function randomState(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
