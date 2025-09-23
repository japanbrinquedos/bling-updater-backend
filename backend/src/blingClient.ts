/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import * as tokenStore from './tokenStore.js';
import type { ParsedItem } from './services.js';

const BLING_BASE =
  process.env.BLING_API_BASE || 'https://www.bling.com.br/Api/v3';

type PatchOptions = {
  idempotencyKey?: string;
};

function toBlingBody(p: Record<string, any>): Record<string, any> {
  const body: Record<string, any> = {};

  if (p.code !== undefined) body.codigo = p.code;
  if (p.name !== undefined) body.nome = p.name;
  if (p.unit !== undefined) body.unidade = p.unit;
  if (p.ncm !== undefined) body.ncm = p.ncm;
  if (p.price !== undefined) body.preco = p.price;
  if (p.status !== undefined) body.situacao = p.status; // 'A' | 'I'
  if (p.cost_price !== undefined) body.custo = p.cost_price;
  if (p.net_weight !== undefined) body.pesoLiq = p.net_weight;
  if (p.gross_weight !== undefined) body.pesoBruto = p.gross_weight;
  if (p.ean !== undefined) body.gtin = p.ean;
  if (p.width_cm !== undefined) body.largura = p.width_cm;
  if (p.height_cm !== undefined) body.altura = p.height_cm;
  if (p.depth_cm !== undefined) body.profundidade = p.depth_cm;
  if (p.brand !== undefined) body.marca = p.brand;
  if (p.volumes !== undefined) body.volumes = p.volumes;
  if (p.short_description !== undefined)
    body.descricaoCurta = p.short_description;

  if (Array.isArray(p.images) && p.images.length) {
    body.imagens = p.images.map((url: string) => ({ url }));
    // padrão combinado: substituir imagens existentes
    body.acaoImagens = 'REPLACE';
  }

  return body;
}

export async function blingPatch(items: ParsedItem[], options?: PatchOptions) {
  const accessToken =
    typeof (tokenStore as any).getAccessToken === 'function'
      ? await (tokenStore as any).getAccessToken()
      : undefined;

  const idempotencyKey = options?.idempotencyKey || randomUUID();

  if (!accessToken) {
    return {
      idempotencyKey,
      results: [],
      failures: items.map((it) => ({
        id: it.id,
        error: { status: 401, message: 'missing_access_token' },
      })),
    };
  }

  const http = axios.create({
    baseURL: BLING_BASE,
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Idempotency-Key': idempotencyKey,
      'Content-Type': 'application/json',
    },
  });

  const results: any[] = [];
  const failures: any[] = [];

  for (const it of items) {
    try {
      const body = toBlingBody(it.patchPayload);
      const url = `/produtos/${encodeURIComponent(it.id)}`;
      const { data, status } = await http.patch(url, body);
      results.push({ id: it.id, status, response: data });
    } catch (err: any) {
      const status = err?.response?.status ?? 500;
      const payload = err?.response?.data ?? { message: String(err) };
      failures.push({
        id: it.id,
        error: {
          status,
          message: `bling_error ${status}: ${JSON.stringify(payload)}`,
          payload,
        },
      });
    }
  }

  return { idempotencyKey, results, failures };
}
