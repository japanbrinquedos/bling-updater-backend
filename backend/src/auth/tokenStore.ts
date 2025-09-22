import crypto from "crypto";
import { exchangeCodeForToken, refreshWithToken } from "./blingOAuth.js";
import type { AuthStatus, TokenResponse, TokenSet } from "./types.js";

// In-memory store (pronto para evoluir para Redis/FS se precisar)
let TOKENS: TokenSet | undefined;

// Proteção básica contra CSRF: guarda 'state' emitido em /start
const stateStore = new Map<string, number>(); // state -> epochMillis
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos

function now() {
  return Date.now();
}
function inSeconds(ms: number) {
  return Math.max(0, Math.floor(ms / 1000));
}

function fromResponse(tr: TokenResponse): TokenSet {
  const safetySkew = 30_000; // 30s de folga
  return {
    accessToken: tr.access_token,
    refreshToken: tr.refresh_token,
    tokenType: tr.token_type || "Bearer",
    scope: tr.scope,
    expiresAt: now() + tr.expires_in * 1000 - safetySkew,
  };
}

export function newState(): string {
  const s = crypto.randomBytes(16).toString("hex");
  stateStore.set(s, now() + STATE_TTL_MS);
  return s;
}

export function validateState(state?: string): boolean {
  if (!state) return false;
  const exp = stateStore.get(state);
  if (!exp) return false;
  stateStore.delete(state);
  return exp > now();
}

export async function handleAuthCode(code: string) {
  const tr = await exchangeCodeForToken(code);
  TOKENS = fromResponse(tr);
}

export function clearTokens() {
  TOKENS = undefined;
}

export function getStatus(): AuthStatus {
  if (!TOKENS) return { authenticated: false };
  return {
    authenticated: true,
    expires_in: inSeconds(TOKENS.expiresAt - now()),
    has_refresh: Boolean(TOKENS.refreshToken),
    scope: TOKENS.scope,
  };
}

async function refreshIfNeeded(): Promise<void> {
  if (!TOKENS) throw new Error("unauthenticated");
  if (TOKENS.expiresAt > now()) return;

  if (!TOKENS.refreshToken) {
    // sem refresh, invalida
    TOKENS = undefined;
    throw new Error("expired_no_refresh");
  }
  const tr = await refreshWithToken(TOKENS.refreshToken);
  TOKENS = fromResponse(tr);
}

export async function getAccessToken(): Promise<string> {
  if (!TOKENS) throw new Error("unauthenticated");
  await refreshIfNeeded();
  return TOKENS!.accessToken;
}
