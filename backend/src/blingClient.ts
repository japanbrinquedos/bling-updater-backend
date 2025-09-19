/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosInstance } from "axios";

const API_BASE = "https://api.bling.com.br/Api/v3";

function authHeaders(token: string, extra?: Record<string, string>) {
  return {
    Accept: "1.0",
    Authorization: `Bearer ${token}`,
    ...(extra || {}),
  };
}
function http(token: string): AxiosInstance {
  return axios.create({
    baseURL: API_BASE,
    headers: authHeaders(token),
    timeout: 30000,
  });
}

/** GET produto por ID (preferido) */
export async function blingGetProductById(token: string, id: string | number) {
  const cli = http(token);
  const r = await cli.get(`/produtos/${id}`);
  // Normalização leve (depende do shape da API)
  return r.data?.data ?? r.data;
}

/** GET produto por código (fallback quando não há ID) */
export async function blingGetProductByCode(token: string, code: string) {
  const cli = http(token);
  const r = await cli.get(`/produtos`, { params: { codigo: code } });
  const data = r.data?.data ?? r.data;
  if (Array.isArray(data)) return data[0];
  return data;
}

/** PATCH parcial por ID — envia apenas o que for passado
 *  Imagens: se vier "images", assumimos REPLACE (lista final).
 */
export async function blingPatchProductById(
  token: string,
  id: string | number,
  body: Record<string, any>,
  idempotencyKey?: string
) {
  const cli = axios.create({
    baseURL: API_BASE,
    headers: authHeaders(token, idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined),
    timeout: 30000,
  });
  const r = await cli.patch(`/produtos/${id}`, body);
  return r.data;
}

/** Helper: resolve (ID ou código) e faz PATCH */
export async function blingPatchResolveAndPatch(
  token: string,
  payload: Record<string, any>,
  idempotencyKey?: string
): Promise<
  | { ok: true; stage: "patch"; productId: string | number; sentBody: any; response: any }
  | { ok: false; stage: "patch"; error: { status: number; message: any; sentBody?: any } }
> {
  try {
    let productId: string | number | undefined = payload.id;

    if (!productId) {
      if (!payload.code) {
        return { ok: false, stage: "patch", error: { status: 400, message: "Faltou ID (col.1) e Código (col.2)" } };
      }
      const found = await blingGetProductByCode(token, String(payload.code));
      if (!found?.id) {
        return { ok: false, stage: "patch", error: { status: 404, message: `Produto com código ${payload.code} não encontrado` } };
      }
      productId = found.id;
    }

    // Nunca envie campos vazios/undefined
    const body: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v === "" || v === null || v === undefined) continue;
      // Política fixa: não enviar tags/fornecedor (nome)
      if (k === "tags" || k === "supplier" || k === "fornecedor") continue;
      body[k] = v;
    }

    const resp = await blingPatchProductById(token, productId!, body, idempotencyKey);
    return { ok: true, stage: "patch", productId: productId!, sentBody: body, response: resp };
  } catch (e: any) {
    return {
      ok: false,
      stage: "patch",
      error: {
        status: e?.response?.status ?? 500,
        message: e?.response?.data ?? e?.message ?? "Erro desconhecido",
        sentBody: payload,
      },
    };
  }
}
