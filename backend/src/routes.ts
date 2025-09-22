import { Router, Request, Response } from "express";
import { parseBNAndNormalize, patchFromBN } from "./services.js";
import * as TS from "./tokenStore.js"; // usaremos de forma defensiva, sem acoplar a nomes específicos

export const router = Router();

/* ----------------------------- AUTH ROUTES ----------------------------- */
/** GET /auth/status
 * Normaliza o status de autenticação sem impor nomes de funções.
 */
router.get("/auth/status", async (_req: Request, res: Response) => {
  try {
    const anyTS = TS as any;

    // Tenta várias assinaturas comuns no seu tokenStore existente
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
    // Fallback mínimo: dizer ausente
    return res.json({ ok: true, authenticated: false, expires_in: 0, has_refresh: false });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** GET /auth/start
 * Usa o método existente no tokenStore SE houver; senão constrói a URL e redireciona.
 * NÃO altera sua implementação de auth — só garante a rota.
 */
router.get("/auth/start", async (req: Request, res: Response) => {
  try {
    const anyTS = TS as any;

    if (typeof anyTS.startAuth === "function") {
      return anyTS.startAuth(req, res);
    }

    // Fallback: montar URL de autorização direto pelas ENVs (sem tocar no tokenStore)
    const clientId = process.env.BLING_CLIENT_ID || "";
    const redirectUri = process.env.BLING_REDIRECT_URL || "";
    const scope = process.env.BLING_SCOPES || ""; // ex: "98309 106168710 ..."
    const state = cryptoRandom();

    if (!clientId || !redirectUri) {
      return res
        .status(500)
        .send("Auth start indisponível: defina BLING_CLIENT_ID e BLING_REDIRECT_URL.");
    }

    // Endpoints padrão do Bling v3 (mantém compatível; caso seu tokenStore use outros, ele interceptará acima)
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

/** GET /auth/callback
 * Delegamos ao tokenStore se existir; sem isso, devolvemos erro explicando.
 */
router.get("/auth/callback", async (req: Request, res: Response) => {
  try {
    const anyTS = TS as any;

    if (typeof anyTS.handleCallback === "function") {
      return anyTS.handleCallback(req, res);
    }
    if (typeof anyTS.callback === "function") {
      return anyTS.callback(req, res);
    }

    // Sem manipulador no tokenStore, não faremos troca de code por token aqui.
    return res
      .status(500)
      .json({ ok: false, error: "callback_handler_missing_in_tokenStore" });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ----------------------------- HEALTH ROUTE ---------------------------- */
router.get("/health", (_req, res) => res.json({ ok: true }));

/* --------------------------- PREVIEW / PATCH --------------------------- */
/** POST /preview
 * body: { lines: string }
 * Retorna normalização + itens (22 colunas), preservando vazios, tirando * e aspas, \t→|, vírgula→ponto,
 * concatenando imagens extras na col 22 com vírgula.
 */
router.post("/preview", (req: Request, res: Response) => {
  try {
    const { lines } = req.body || {};
    const out = parseBNAndNormalize(String(lines || ""));
    return res.json(out);
  } catch (e: any) {
    return res.status(400).json({
