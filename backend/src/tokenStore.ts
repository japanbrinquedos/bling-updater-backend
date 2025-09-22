// backend/src/tokenStore.ts
import axios from "axios";

/**
 * Armazena tokens em memória (processo do Render).
 * Se o dyno reiniciar, será necessário re-autenticar.
 */

type TokenBundle = {
  access_token: string;
  token_type?: string;
  expires_in?: number; // segundos
  refresh_token?: string;
  scope?: string;
  obtained_at: number; // epoch ms
};

let TOKENS: TokenBundle | null = null;

// URLs/Env
const CLIENT_ID = process.env.BLING_CLIENT_ID || "";
const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET || "";
const REDIRECT_URI =
  process.env.BLING_REDIRECT_URI || process.env.BLING_REDIRECT_URL || "";
const AUTHORIZE_URL =
  process.env.BLING_AUTHORIZE_URL || "https://www.bling.com.br/Api/v3/oauth/authorize";
const TOKEN_URL =
  process.env.BLING_TOKEN_URL || "https://www.bling.com.br/Api/v3/oauth/token";
const SCOPE =
  process.env.BLING_SCOPE ||
  process.env.BLING_SCOPES ||
  "produtos";

// Util: Basic auth header
function basicAuth() {
  const raw = `${CLIENT_ID}:${CLIENT_SECRET}`;
  return "Basic " + Buffer.from(raw).toString("base64");
}

// Quanto falta para expirar (em segundos)
function remainingSec(): number {
  if (!TOKENS?.expires_in) return 0;
  const elapsed = (Date.now() - (TOKENS.obtained_at || 0)) / 1000;
  return Math.max(0, TOKENS.expires_in - elapsed);
}

/* ---------------------------- API PÚBLICA ---------------------------- */
export function getAuthStatus() {
  return {
    authenticated: Boolean(TOKENS?.access_token),
    expires_in: remainingSec(),
    has_refresh: Boolean(TOKENS?.refresh_token),
    scope: TOKENS?.scope || "",
  };
}

// Monta a URL de autorização para redirecionar o usuário
export function startAuthUrl():
  | { ok: true; url: string }
  | { ok: false; error: string } {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return { ok: false, error: "defina BLING_CLIENT_ID e BLING_REDIRECT_URI" };
  }
  const p = new URL(AUTHORIZE_URL);
  p.searchParams.set("response_type", "code");
  p.searchParams.set("client_id", CLIENT_ID);
  p.searchParams.set("redirect_uri", REDIRECT_URI);
  if (SCOPE) p.searchParams.set("scope", SCOPE);
  // state opcional
  return { ok: true, url: p.toString() };
}

// Troca o "code" por tokens e salva em memória
export async function exchangeCodeAndStore(code: string) {
  try {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", REDIRECT_URI);

    const resp = await axios.post(TOKEN_URL, body.toString(), {
      headers: {
        Authorization: basicAuth(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      validateStatus: () => true,
    });

    if (resp.status < 200 || resp.status >= 300) {
      return {
        ok: false as const,
        error: `token_exchange_failed ${resp.status}`,
        payload: resp.data,
      };
    }

    const data = resp.data || {};
    TOKENS = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
      scope: data.scope,
      obtained_at: Date.now(),
    };
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, error: String(e?.message || e) };
  }
}

// Garante access_token válido (faz refresh se necessário)
export async function getAccessToken(): Promise<string> {
  if (TOKENS?.access_token && remainingSec() > 30) {
    return TOKENS.access_token;
  }
  // tenta refresh
  if (TOKENS?.refresh_token) {
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", TOKENS.refresh_token);

    const resp = await axios.post(TOKEN_URL, body.toString(), {
      headers: {
        Authorization: basicAuth(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      validateStatus: () => true,
    });

    if (resp.status >= 200 && resp.status < 300) {
      const d = resp.data || {};
      TOKENS = {
        access_token: d.access_token,
        token_type: d.token_type,
        expires_in: d.expires_in,
        refresh_token: d.refresh_token || TOKENS.refresh_token,
        scope: d.scope || TOKENS.scope,
        obtained_at: Date.now(),
      };
      return TOKENS.access_token;
    }
    // refresh falhou — apaga e força nova autenticação
    TOKENS = null;
  }
  throw new Error("no_valid_token: reautentique em /auth/start");
}
