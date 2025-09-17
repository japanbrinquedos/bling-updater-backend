import axios, { AxiosError } from 'axios';

const API = 'https://www.bling.com.br/Api/v3';

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

export async function blingPutProduct(token: string, idProduto: number | string, body: any) {
  const url = `${API}/produtos/${idProduto}`;
  const res = await axios.put(url, body, {
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  return res.data;
}

export async function blingPatchSituacao(token: string, idProduto: number | string, situacao: 'A' | 'I') {
  const url = `${API}/produtos/${idProduto}/situacoes`;
  const res = await axios.patch(url, { situacao }, { headers: authHeader(token), timeout: 15000 });
  return res.data;
}

export async function blingGetProductById(token: string, idProduto: number | string) {
  const url = `${API}/produtos/${idProduto}`;
  const res = await axios.get(url, { headers: authHeader(token), timeout: 15000 });
  return res.data?.data;
}

export async function blingFindProductByCode(token: string, code: string) {
  const url = `${API}/produtos`;
  const res = await axios.get(url, {
    headers: authHeader(token),
    params: { codigo: code, pagina: 1, limite: 1 },
    timeout: 15000,
  });
  const data = res?.data?.data;
  return Array.isArray(data) && data.length ? data[0] : null;
}

export function extractAxiosError(e: unknown) {
  const ax = e as AxiosError<any>;
  const status = ax.response?.status;
  const payload = ax.response?.data;
  const message =
    (payload && (payload.message || payload.error || JSON.stringify(payload))) ||
    ax.message;
  return { status, message, payload };
}
