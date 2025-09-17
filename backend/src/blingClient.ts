import axios, { AxiosHeaders } from 'axios';
import { refreshWithRefreshToken, getAccessToken } from './tokenStore.js';

const api = axios.create({
  baseURL: process.env.BLING_API_BASE || 'https://www.bling.com.br/Api/v3',
  timeout: 10000
});

// Interceptor: injeta Bearer e tipa headers como AxiosHeaders
api.interceptors.request.use(async (config) => {
  const token = getAccessToken();
  const headers = new AxiosHeaders(config.headers);
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  config.headers = headers;
  return config;
});

// 401 → tenta refresh e refaz uma única vez
api.interceptors.response.use(undefined, async (error) => {
  const status = error?.response?.status;
  if (status === 401) {
    try {
      await refreshWithRefreshToken();
      const token = getAccessToken();
      if (token) {
        const hdrs = new AxiosHeaders(error.config.headers);
        hdrs.set('Authorization', `Bearer ${token}`);
        error.config.headers = hdrs;
        return api.request(error.config);
      }
    } catch {
      // segue adiante para o throw
    }
  }
  throw error;
});

export async function blingPatch(productId: number, payload: Record<string, any>, idempotencyKey?: string) {
  const headers = new AxiosHeaders();
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  const url = `/produtos/${productId}`;
  const r = await api.patch(url, payload, { headers });
  return r.data;
}

export async function blingListProducts(page = 1, limit = 50) {
  const r = await api.get('/produtos', { params: { pagina: page, limite: limit } });
  return r.data;
}
