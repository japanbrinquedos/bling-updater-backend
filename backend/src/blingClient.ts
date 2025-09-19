/* eslint-disable @typescript-eslint/no-explicit-any */
const API = "https://www.bling.com.br/Api/v3";

function headers(token: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(extra || {})
  };
}

export async function patchProdutoById(token: string, id: string | number, body: any, idem?: string) {
  const r = await fetch(`${API}/produtos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(token, idem ? { "Idempotency-Key": idem } : undefined),
    body: JSON.stringify(body)
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw { status: r.status, data: json };
  return json;
}

export async function putImagensReplace(token: string, id: string | number, urls: string[], idem?: string) {
  const r = await fetch(`${API}/produtos/${encodeURIComponent(id)}/imagens`, {
    method: "PUT",
    headers: headers(token, idem ? { "Idempotency-Key": idem } : undefined),
    body: JSON.stringify({ substituir: true, imagens: urls.map((url) => ({ url })) })
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw { status: r.status, data: json };
  return json;
}

export async function patchProdutoImagensFallback(token: string, id: string | number, urls: string[], idem?: string) {
  const r = await fetch(`${API}/produtos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(token, idem ? { "Idempotency-Key": idem } : undefined),
    body: JSON.stringify({ imagens: { substituir: true, urls } })
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw { status: r.status, data: json };
  return json;
}
