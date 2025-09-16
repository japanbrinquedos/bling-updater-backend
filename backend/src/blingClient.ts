import axios from 'axios';
import { authorizeHeaders, refreshWithRefreshToken, getAccessToken } from './tokenStore.js';

const api = axios.create({
  baseURL: process.env.BLING_API_BASE || 'https://www.bling.com.br/Api/v3',
  timeout: 10000
});

// Interceptor para token + refresh automático
api.interceptors.request.use(async (config) => {
  const token = getAccessToken();
  config.headers = {
    ...(config.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    Accept: 'application/json'
  };
  return config;
});

api.interceptors.response.use(undefined, async (error) => {
  const status = error?.response?.status;
  if (status === 401) {
    await refreshWithRefreshToken().catch(() => {});
    // retry uma vez
    const token = getAccessToken();
    if (token) {
      error.config.headers.Authorization = `Bearer ${token}`;
      return api.request(error.config);
    }
  }
  throw error;
});

export async function blingPatch(productId: number, payload: Record<string, any>, idempotencyKey?: string) {
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const url = `/produtos/${productId}`;
  const r = await api.patch(url, payload, { headers });
  return r.data;
}

export async function blingListProducts(page = 1, limit = 50) {
  const r = await api.get('/produtos', { params: { pagina: page, limite: limit } });
  return r.data;
}
