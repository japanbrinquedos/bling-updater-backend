import axios from 'axios';

type Tokens = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in: number; // segundos
  created_at: number; // epoch ms (nosso)
};

let TOKENS: Tokens | null = null;

export function setTokens(t: { access_token: string; refresh_token?: string; expires_in: number; token_type?: string }) {
  TOKENS = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    token_type: t.token_type || 'Bearer',
    expires_in: t.expires_in,
    created_at: Date.now()
  };
}

export function getAccessToken(): string | null {
  if (!TOKENS) return null;
  const left = getExpiresIn();
  if (left <= 0) return null;
  return TOKENS.access_token;
}

export function getExpiresIn(): number {
  if (!TOKENS) return 0;
  const elapsed = (Date.now() - TOKENS.created_at) / 1000;
  return Math.max(0, Math.floor(TOKENS.expires_in - elapsed));
}

function basicAuthHeader(): string {
  const id = process.env.BLING_CLIENT_ID || '';
  const sec = process.env.BLING_CLIENT_SECRET || '';
  const raw = Buffer.from(`${id}:${sec}`).toString('base64');
  return `Basic ${raw}`;
}

export async function exchangeCodeForToken(code: string) {
  const redirect = process.env.BLING_REDIRECT_URL!;
  const url = 'https://www.bling.com.br/Api/v3/oauth/token';
  const data = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect
  });

  const res = await axios.post(url, data, {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 20000
  });
  return res.data as { access_token: string; refresh_token?: string; expires_in: number; token_type?: string };
}

export async function refreshAccessToken() {
  if (!TOKENS?.refresh_token) throw new Error('refresh token ausente');
  const url = 'https://www.bling.com.br/Api/v3/oauth/token';
  const data = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: TOKENS.refresh_token!
  });

  const res = await axios.post(url, data, {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 20000
  });
  const t = res.data as { access_token: string; refresh_token?: string; expires_in: number; token_type?: string };
  setTokens(t);
  return t;
}
