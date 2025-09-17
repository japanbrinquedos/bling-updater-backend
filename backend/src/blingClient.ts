import axios from 'axios';

const api = axios.create({
  baseURL: 'https://www.bling.com.br/Api/v3',
  headers: { Accept: 'application/json' },
  // timeout opcional se quiser cortar requisições presas
  // timeout: 15000,
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function putProduto(id: string | number, body: any, token: string) {
  const r = await api.put(`/produtos/${id}`, body, { headers: auth(token) });
  return r.data;
}

export async function patchSituacaoProduto(
  id: string | number,
  situacao: 'A' | 'I',
  token: string
) {
  const r = await api.patch(
    `/produtos/${id}/situacoes`,
    { situacao },
    { headers: auth(token) }
  );
  return r.data;
}
