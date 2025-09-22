import { Router } from "express";
import { FRONTEND_URL } from "./config.js";
import { getStatus, handleAuthCode, newState, validateState, clearTokens } from "./tokenStore.js";
import { buildAuthorizeUrl } from "./blingOAuth.js";

export const authRouter = Router();

// GET /auth/start → redireciona para o Bling
authRouter.get("/start", (req, res) => {
  try {
    const state = newState();
    const url = buildAuthorizeUrl(state);
    return res.redirect(302, url);
  } catch (e: any) {
    return res
      .status(500)
      .send("Auth start indisponível: verifique BLING_CLIENT_ID/BLING_REDIRECT_URI.");
  }
});

// GET /auth/callback?code&state → troca por tokens e redireciona ao front
authRouter.get("/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !validateState(state)) {
    return res.status(400).json({ ok: false, error: "invalid_or_expired_state_or_code" });
  }

  try {
    await handleAuthCode(code);
    if (FRONTEND_URL) {
      const url = new URL(FRONTEND_URL);
      url.searchParams.set("auth", "ok");
      return res.redirect(302, url.toString());
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String(err) });
  }
});

// GET /auth/status → usado pelo front p/ mostrar “Auth: OK”
authRouter.get("/status", (_req, res) => {
  return res.json({ ok: true, ...getStatus() });
});

// POST/GET /auth/logout → limpa tokens locais
authRouter.all("/logout", (_req, res) => {
  clearTokens();
  return res.json({ ok: true });
});
