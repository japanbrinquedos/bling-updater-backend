import { getValidAccessToken } from "./tokenStore.js";
import { safeJson, sleep } from "./utils.js";

const API = "https://www.bling.com.br/Api/v3";

type FetchOpts = {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  idempotencyKey?: string;
};

async function blingFetch(path: string, opts: FetchOpts = {}, retry = 0): Promise<any> {
  const token = await getValidAccessToken();
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers || {})
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetch(`${API}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });

  const text = await res.text();
  const json = (() => { try { return JSON.parse(text); } catch { return text; } })();

  if (res.ok) return json;

  // Retry leve para 429/5xx
  if ((res.status === 429 || res.status >= 500) && retry < 2) {
    await sleep(300 + retry * 500);
    return blingFetch(path, opts, retry + 1);
  }
  const err = new Error(`bling_error ${res.status}: ${safeJson(json)}`);
  (err as any).status = res.status;
  (err as any).payload = json;
  throw err;
}

export async function patchProduct(id: string, payload: Record<string, any>, idempotencyKey?: string) {
  return blingFetch(`/produtos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
    idempotencyKey
  });
}

export async function putProductImages(id: string, urls: string[], idempotencyKey?: string) {
  // Substitui todas as imagens do produto (replace)
  const body = { urls };
  return blingFetch(`/produtos/${encodeURIComponent(id)}/imagens`, {
    method: "PUT",
    body,
    idempotencyKey
  });
}

export function buildAuthorizeUrl(state: string) {
  const base = "https://www.bling.com.br/Api/v3/oauth/authorize";
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.BLING_CLIENT_ID || "",
    redirect_uri: process.env.BLING_REDIRECT_URI || "",
    scope: process.env.BLING_SCOPE || "produtos",
    state
  });
  return `${base}?${p.toString()}`;
}
