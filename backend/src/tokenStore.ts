/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Request, Response, NextFunction } from "express";

type TokenBundle = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
};

const MEM: { token?: TokenBundle } = {};

export function setTokenBundle(tb: TokenBundle) { MEM.token = tb; }
export function getTokenBundle(): TokenBundle | undefined { return MEM.token; }
export function getStatus() {
  if (!MEM.token) return { authenticated: false };
  const now = Math.floor(Date.now() / 1000);
  const ttl = (MEM.token.expires_at ?? 0) - now;
  return { authenticated: true, expires_in: ttl, has_refresh: !!MEM.token.refresh_token, scope: MEM.token.scope ?? null };
}

export async function ensureFreshAccessToken(): Promise<string | null> {
  const tb = MEM.token;
  if (!tb?.access_token) return null;

  const now = Math.floor(Date.now() / 1000);
  if ((tb.expires_at ?? now + 999999) - now > 60) return tb.access_token;

  if (!tb.refresh_token) return tb.access_token;

  const client_id = process.env.BLING_CLIENT_ID!;
  const client_secret = process.env.BLING_CLIENT_SECRET!;
  const basic = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tb.refresh_token
    // credenciais via Basic
  });

  const r = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basic}`
    },
    body
  });

  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    // fallback: mantém o token antigo para não travar operações
    return tb.access_token;
  }
  const expires_at = Math.floor(Date.now() / 1000) + (Number(j.expires_in ?? 3600) - 60);
  setTokenBundle({
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? tb.refresh_token,
    expires_at,
    scope: j.scope,
  });
  return j.access_token;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const headerToken = (req.headers["x-access-token"] as string) || null;
  const envToken = process.env.BLING_ACCESS_TOKEN || null;

  let token: string | null = bearer || headerToken || envToken || null;
  if (!token && MEM.token?.access_token) token = await ensureFreshAccessToken();

  if (!token) {
    return res.status(401).json({ ok: false, error: { message: "Sem access_token. Acesse /auth/start para conectar ao Bling." } });
  }
  (req as any).accessToken = token;
  next();
}
