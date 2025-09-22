import axios from "axios";
import qs from "qs";

type Tokens = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  /** epoch seconds when token expires (com folga) */
  expires_at?: number;
};

const MEM: {
  tokens: Tokens | null;
  lastState?: string;
} = { tokens: null };

const env = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Env ${k} ausente`);
  return v;
};

const AUTH_URL = process.env.BLING_AUTHORIZE_URL || "https://www.bling.com.br/Api/v3/oauth/authorize";
const TOKEN_URL = process.env.BLING_TOKEN_URL || "https://www.bling.com.br/Api/v3/oauth/token";

const CLIENT_ID = env("BLING_CLIENT_ID");
const CLIENT_SECRET = env("BLING_CLIENT_SECRET");
const REDIRECT_URI = env("BLING_REDIRECT_URI"); // manter este nome legado
const SCOPE = process.env.BLING_SCOPE || "produtos";

const basicAuth = "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

function nowSec() { return Math.floor(Date.now() / 1000); }

function setTokens(t: Tokens) {
  const leeway = 60; // 1 min de folga
  const exp = t.expires_in ? nowSec() + t.expires_in - leeway : undefined;
  MEM.tokens = { ...t, expires_at: exp };
}

async function refreshIfNeeded(): Promise<void> {
  if (!MEM.tokens) return;
  if (!MEM.tokens.expires_at || MEM.tokens.expires_at > nowSec()) return;
  if (!MEM.tokens.refresh_token) return;
  const data = qs.stringify({
    grant_type: "refresh_token",
    refresh_token: MEM.tokens.refresh_token,
  });
  const resp = await axios.post(TOKEN_URL, data, {
    headers: {
      Authorization: basicAuth,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
  });
  setTokens(resp.data as Tokens);
}

export async function getAccessToken(): Promise<string | null> {
  if (!MEM.tokens) return null;
  await refreshIfNeeded();
  return MEM.tokens?.access_token ?? null;
}

export function clearTokens() {
  MEM.tokens = null;
}

/** GET /auth/status */
export function authStatus(_req: any, res: any) {
  const expires_in = MEM.tokens?.expires_at ? Math.max(0, MEM.tokens.expires_at - nowSec()) : null;
  res.json({
    ok: true,
    authenticated: Boolean(MEM.tokens?.access_token),
    has_refresh: Boolean(MEM.tokens?.refresh_token),
    expires_in,
    scope: MEM.tokens?.scope || SCOPE,
  });
}

/** GET /auth/start */
export function startAuth(_req: any, res: any) {
  const state = Math.random().toString(36).slice(2);
  MEM.lastState = state;
  const url =
    `${AUTH_URL}?response_type=code` +
    `&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&state=${encodeURIComponent(state)}`;
  res.redirect(url);
}

/** GET /auth/callback */
export async function handleCallback(req: any, res: any) {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ ok: false, error: "missing_code" });
    if (!state || state !== MEM.lastState) return res.status(400).json({ ok: false, error: "invalid_state" });

    const data = qs.stringify({
      grant_type: "authorization_code",
      code: code as string,
      redirect_uri: REDIRECT_URI,
    });

    const tokenResp = await axios.post(TOKEN_URL, data, {
      headers: {
        Authorization: basicAuth,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    });

    setTokens(tokenResp.data as Tokens);

    const front = process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || "";
    const html = `<!doctype html><meta charset="utf-8">
      <title>Autenticação OK</title>
      <body style="font-family: system-ui; padding:24px">
        <h3>Autenticação concluída</h3>
        <p>Você já pode voltar para a página do app.</p>
        <script>
          try {
            if ("${front}") window.opener && window.opener.postMessage({type:"bling_auth_done"}, "${front}");
          } catch(e) {}
          window.close();
        </script>
      </body>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "exchange_failed" });
  }
}
