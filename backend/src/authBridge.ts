import type { Express } from "express";
import crypto from "crypto";
import qs from "querystring";

/**
 * Isola apenas o /auth/start.
 * /auth/callback e /auth/status continuam do jeitinho que você já tem.
 */
export function registerAuthRoutes(app: Express) {
  app.get("/auth/start", (req, res) => {
    const client_id = process.env.BLING_CLIENT_ID;
    const redirect_uri = process.env.BLING_REDIRECT_URI; // sem barra no final
    const scope = process.env.BLING_SCOPE || "produtos";
    const authorize_url =
      process.env.BLING_AUTHORIZE_URL ||
      "https://www.bling.com.br/Api/v3/oauth/authorize";

    if (!client_id || !redirect_uri) {
      res
        .status(500)
        .send("Auth start indisponível: defina BLING_CLIENT_ID e BLING_REDIRECT_URI.");
      return;
    }

    // Gera STATE, guarda em cookie (10 min) e redireciona pro Bling
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("bling_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
      path: "/",
    });

    const query = qs.stringify({
      response_type: "code",
      client_id,
      redirect_uri,
      scope,
      state,
    });

    res.redirect(`${authorize_url}?${query}`);
  });
}
