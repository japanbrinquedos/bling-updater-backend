import axios from "axios";
import { BLING_AUTHORIZE_URL, BLING_CLIENT_ID, BLING_CLIENT_SECRET, BLING_REDIRECT_URI, BLING_SCOPE, BLING_TOKEN_URL } from "./config.js";
import type { TokenResponse } from "./types.js";

// Monta a URL de autorização (Authorization Code)
export function buildAuthorizeUrl(state: string): string {
  const u = new URL(BLING_AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", BLING_CLIENT_ID);
  u.searchParams.set("redirect_uri", BLING_REDIRECT_URI);
  if (BLING_SCOPE) u.searchParams.set("scope", BLING_SCOPE);
  u.searchParams.set("state", state);
  return u.toString();
}

// Troca code -> tokens
export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", BLING_REDIRECT_URI);

  const basic = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString("base64");

  const { data } = await axios.post<TokenResponse>(BLING_TOKEN_URL, body.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    timeout: 15000,
    validateStatus: (s) => s >= 200 && s < 500,
  });

  if (!(data as any)?.access_token) {
    throw new Error(`token_exchange_failed: ${JSON.stringify(data)}`);
  }
  return data;
}

// Renova com refresh_token
export async function refreshWithToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  const basic = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString("base64");

  const { data } = await axios.post<TokenResponse>(BLING_TOKEN_URL, body.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    timeout: 15000,
    validateStatus: (s) => s >= 200 && s < 500,
  });

  if (!(data as any)?.access_token) {
    throw new Error(`token_refresh_failed: ${JSON.stringify(data)}`);
  }
  return data;
}
