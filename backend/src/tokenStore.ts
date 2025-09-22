import { safeJson, sleep } from "./utils.js";

type TokenBag = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

type Persisted = {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  expires_at: number; // epoch ms
};

const memory: { tokens?: Persisted } = {};

const TOKENS_PATH = "/tmp/bling_tokens.json";

async function readFile(path: string): Promise<string | null> {
  try {
    const fs = await import("fs/promises");
    return await fs.readFile(path, "utf8");
  } catch { return null; }
}
async function writeFile(path: string, data: string): Promise<void> {
  try {
    const fs = await import("fs/promises");
    await fs.writeFile(path, data, "utf8");
  } catch { /* noop */ }
}

async function loadFromDisk() {
  const txt = await readFile(TOKENS_PATH);
  if (!txt) return;
  try {
    const obj = JSON.parse(txt) as Persisted;
    if (obj?.access_token) memory.tokens = obj;
  } catch { /* ignore */ }
}
loadFromDisk();

function saveToDisk() {
  if (!memory.tokens) return;
  writeFile(TOKENS_PATH, JSON.stringify(memory.tokens));
}

function now() { return Date.now(); }

function basicAuthHeader() {
  const id = process.env.BLING_CLIENT_ID || "";
  const sec = process.env.BLING_CLIENT_SECRET || "";
  const b64 = Buffer.from(`${id}:${sec}`).toString("base64");
  return `Basic ${b64}`;
}

export function getStatus() {
  const t = memory.tokens;
  if (!t) return { ok: true, authenticated: false, expires_in: 0, has_refresh: false, scope: null as string | null };
  const expires_in = Math.max(0, Math.floor((t.expires_at - now()) / 1000));
  return { ok: true, authenticated: true, expires_in, has_refresh: Boolean(t.refresh_token), scope: t.scope || null };
}

export async function exchangeCodeForToken(code: string) {
  const url = "https://www.bling.com.br/Api/v3/oauth/token";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.BLING_REDIRECT_URI || ""
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body
  });

  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(`token_exchange_failed: ${safeJson(data)}`);
  }
  const bag = data as TokenBag;
  const expires_at = now() + Math.max(5, (bag.expires_in || 1800) - 30) * 1000;
  memory.tokens = {
    access_token: bag.access_token,
    refresh_token: bag.refresh_token,
    scope: bag.scope,
    expires_at
  };
  saveToDisk();
  return getStatus();
}

export async function refreshToken() {
  const t = memory.tokens;
  if (!t?.refresh_token) throw new Error("no_refresh_token");

  const url = "https://www.bling.com.br/Api/v3/oauth/token";
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: t.refresh_token
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body
  });

  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(`token_refresh_failed: ${safeJson(data)}`);
  }
  const bag = data as TokenBag;
  const expires_at = now() + Math.max(5, (bag.expires_in || 1800) - 30) * 1000;
  memory.tokens = {
    access_token: bag.access_token,
    refresh_token: bag.refresh_token || t.refresh_token,
    scope: bag.scope || t.scope,
    expires_at
  };
  saveToDisk();
  return getStatus();
}

export async function getValidAccessToken(): Promise<string> {
  // atalho dev: BLING_ACCESS_TOKEN
  if (process.env.BLING_ACCESS_TOKEN) return process.env.BLING_ACCESS_TOKEN;

  const t = memory.tokens;
  if (!t) throw new Error("not_authenticated");
  const remaining = t.expires_at - now();
  if (remaining < 20 * 1000) {
    await refreshToken();
    return memory.tokens!.access_token;
  }
  return t.access_token;
}

// Middleware simples: exige auth
import type { Request, Response, NextFunction } from "express";
export function requireAuth(_req: Request, res: Response, next: NextFunction) {
  if (!memory.tokens?.access_token) {
    res.status(401).json({ ok: false, error: "unauthenticated" });
    return;
  }
  next();
}
