import axios from 'axios';
import qs from 'qs';

let ACCESS_TOKEN = '';
let REFRESH_TOKEN = '';
let EXPIRES_AT = 0; // epoch seconds

export function setTokens(tokens: { access_token: string; refresh_token?: string; expires_in?: number }) {
  ACCESS_TOKEN = tokens.access_token || '';
  if (tokens.refresh_token) REFRESH_TOKEN = tokens.refresh_token;
  if (tokens.expires_in) EXPIRES_AT = Math.floor(Date.now() / 1000) + tokens.expires_in;
}

export function getAccessToken() { return ACCESS_TOKEN; }
export function getExpiresIn(): number | null {
  if (!EXPIRES_AT) return null;
  return Math.max(0, EXPIRES_AT - Math.floor(Date.now() / 1000));
}

export async function exchangeCodeForToken(code: string) {
  const tokenURL = 'https://www.bling.com.br/Api/v3/oauth/token';
  const clientId = process.env.BLING_CLIENT_ID!;
  const clientSecret = process.env.BLING_CLIENT_SECRET!;
  const redirect = process.env.BLING_REDIRECT_URL!;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const r = await axios.post(tokenURL,
    qs.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirect }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` }, timeout: 15000 }
  );
  return r.data; // { access_token, refresh_token, expires_in, ... }
}

export async function refreshWithRefreshToken() {
  if (!REFRESH_TOKEN) throw new Error('no refresh_token available');
  const tokenURL = 'https://www.bling.com.br/Api/v3/oauth/token';
  const clientId = process.env.BLING_CLIENT_ID!;
  const clientSecret = process.env.BLING_CLIENT_SECRET!;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const r = await axios.post(tokenURL,
    qs.stringify({ grant_type: 'refresh_token', refresh_token: REFRESH_TOKEN }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` }, timeout: 15000 }
  );
  setTokens(r.data);
  return r.data;
}

// header helper (não usado diretamente aqui, mas disponível)
export function authorizeHeaders() {
  const tok = getAccessToken();
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

// refresh “preguiçoso”: checa a cada chamada via interceptors; opcionalmente você pode
// colocar um setInterval aqui para renovar faltando N segundos.
