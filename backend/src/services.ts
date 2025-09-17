import type { NormalizedItem } from './types';
import { putProduto, patchSituacaoProduto } from './blingClient';

// Converte nosso objeto "interno" para o corpo PT-BR aceito pelo Bling
function toBlingBody(n: NormalizedItem) {
  const body: Record<string, any> = {};

  if (n.code) body.codigo = n.code;
  if (n.name) body.nome = n.name;
  if (n.unit) body.unidade = n.unit;
  if (n.ncm) body.ncm = n.ncm;

  if (typeof n.price === 'number') body.preco = n.price;
  if (typeof n.cost_price === 'number') body.precoCusto = n.cost_price;

  if (n.supplier_code) body.codigoFornecedor = n.supplier_code;

  if (typeof n.net_weight === 'number') body.pesoLiq = n.net_weight;
  if (typeof n.gross_weight === 'number') body.pesoBruto = n.gross_weight;

  if (n.ean) body.gtin = n.ean;

  if (typeof n.width_cm === 'number') body.largura = n.width_cm;
  if (typeof n.height_cm === 'number') body.altura = n.height_cm;
  if (typeof n.depth_cm === 'number') body.profundidade = n.depth_cm;

  if (n.brand) body.marca = n.brand;
  if (typeof n.volumes === 'number') body.volumes = n.volumes;

  if (n.short_description) body.descricaoCurta = n.short_description;

  // Observação: imagens ficam para etapa própria (endpoint/fluxo específico do Bling)
  return body;
}

type UpdateResult = {
  id: string | number;
  sentBody: any;
  blingResponse?: any;
  statusPatched?: 'A' | 'I';
  error?: string;
};

export async function atualizarProdutosNoBling(
  items: NormalizedItem[],
  accessToken: string
) {
  const results: UpdateResult[] = [];
  let ok = 0, fail = 0, ignored = 0;

  for (const it of items) {
    const id = it.id || null;
    if (!id) {
      ignored++;
      results.push({ id: 'SEM_ID', sentBody: null, error: 'ID ausente' });
      continue;
    }

    try {
      const body = toBlingBody(it);
      let blingResponse: any = null;

      // 1) Atualização principal (preço, nome, etc.) via PUT /produtos/{id}
      if (Object.keys(body).length > 0) {
        blingResponse = await putProduto(id, body, accessToken);
      }

      // 2) Situação via endpoint dedicado (se veio no item)
      let patchedStatus: 'A' | 'I' | undefined;
      if (it.status === 'A' || it.status === 'I') {
        await patchSituacaoProduto(id, it.status, accessToken);
        patchedStatus = it.status;
      }

      ok++;
      results.push({
        id,
        sentBody: body,
        blingResponse,
        statusPatched: patchedStatus,
      });
    } catch (e: any) {
      fail++;
      results.push({
        id,
        sentBody: toBlingBody(it),
        error: e?.response?.data ? JSON.stringify(e.response.data) : String(e),
      });
    }
  }

  return {
    summary: { sucesso: ok, falhas: fail, ignorados: ignored },
    results,
  };
}
