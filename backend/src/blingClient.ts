const API = "https://www.bling.com.br/Api/v3";

function hdr(token: string) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
}

export async function blingGetProduct(id: string, token: string) {
  const r = await fetch(`${API}/produtos/${encodeURIComponent(id)}`, { headers: hdr(token) });
  if (r.status === 404) return { ok: false, status: 404 };
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

export async function blingFindByCodeOrEan(code?: string, ean?: string, token?: string) {
  if (!token) throw new Error("token_missing");
  const qs: string[] = [];
  if (code) qs.push(`codigo=${encodeURIComponent(code)}`);
  if (ean)  qs.push(`gtin=${encodeURIComponent(ean)}`);
  if (!qs.length) return {};
  const r = await fetch(`${API}/produtos?${qs.join("&")}&pagina=1&limite=1`, { headers: hdr(token) });
  if (!r.ok) return {};
  const j = await r.json().catch(() => null);
  const first = j?.data?.[0] || j?.[0] || null;
  return first || {};
}

export async function blingPatchProduct(id: string, payload: Record<string, any>, token: string) {
  const r = await fetch(`${API}/produtos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: hdr(token),
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw { status: r.status, message: `bling_error ${r.status}: ${JSON.stringify(data)}` };
  return { ok: true, data };
}

// Best-effort (se falhar vira warning)
export async function blingPutImages(id: string, urls: string[], token: string) {
  if (!urls.length) return;
  const body = { imagens: urls.map(u => ({ url: u })) };
  const r = await fetch(`${API}/produtos/${encodeURIComponent(id)}/imagens`, {
    method: "PUT",
    headers: hdr(token),
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    throw { status: r.status, message: `bling_images_error ${r.status}: ${JSON.stringify(data)}` };
  }
}
