import axios from "axios";
import { getAccessToken } from "./tokenStore.js";

const API_BASE =
  (process.env.BLING_API_BASE?.replace(/\/+$/, "") as string) ||
  "https://www.bling.com.br/Api/v3";

type IdemOpts = { idempotencyKey?: string };

/**
 * PATCH parcial de produto no Bling por ID.
 * Envia apenas os campos presentes em `body` (não zera ausentes).
 */
export async function blingPatch(
  id: string,
  body: Record<string, unknown>,
  opts: IdemOpts = {}
) {
  const token = await getAccessToken();
  const url = `${API_BASE}/produtos/${encodeURIComponent(id)}`;

  const resp = await axios.patch(url, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
    },
    timeout: 30000,
  });

  return resp.data;
}

/* Opcional para uso futuro
export async function blingListProducts(params: Record<string, any> = {}) {
  const token = await getAccessToken();
  const url = `${API_BASE}/produtos`;
  const resp = await axios.get(url, {
    params,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeout: 30000,
  });
  return resp.data;
}
*/
