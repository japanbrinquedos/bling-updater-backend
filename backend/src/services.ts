// Funções de parsing/normalização da “BN 22 colunas” e montagem do payload mínimo pra PUT

type ParsedItem = {
  id?: string;           // opcional
  code: string;          // SKU/EAN
  name?: string;         // nome limpo
  price?: number;        // preço venda
  shortDescription?: string; // opcional; cortamos p/ 255 se usado
};

function toNumberBR(s?: string): number | undefined {
  if (!s) return undefined;
  // troca vírgula por ponto e remove milhar
  const n = s.replace(/\./g, "").replace(",", ".");
  const v = Number(n);
  return Number.isFinite(v) ? v : undefined;
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseBNAndNormalize(input: string) {
  // 1) limpa aspas iniciais/finais e asteriscos
  let raw = input.trim();
  raw = raw.replace(/^\*+/, "").replace(/\*+$/, "");
  raw = raw.replace(/^"+|"+$/g, ""); // remove aspas que vêm do Excel
  // 2) transforma tabs em pipes
  raw = raw.replace(/\t+/g, "|");
  // 3) uma BN pode ter quebras de linha no meio; juntamos tudo em uma única linha
  raw = raw.replace(/\r?\n+/g, " ");

  // 4) separa por |
  const parts = raw.split("|").map(p => p.trim());

  // Mapeamento mínimo (usando sua ordem informada):
  // 1 ID (opcional), 2 Código, 3 Descrição, 6 Preço, 42 Descrição curta, 44 URLs imagens (ignoradas no PUT)
  const id = parts[0] || undefined;
  const code = parts[1] || "";
  const name = parts[2] ? stripHtml(parts[2]) : undefined;
  const priceRaw = parts[5]; // posição 6 (índice 5)
  const price = toNumberBR(priceRaw);
  // Descrição curta pode vir espalhada; aqui usamos a 42 se existir
  const shortDescRaw = parts[41] ? stripHtml(parts[41]) : undefined;
  const shortDescription =
    shortDescRaw && shortDescRaw.length > 255
      ? shortDescRaw.slice(0, 255)
      : shortDescRaw;

  if (!code) {
    throw new Error("Código/SKU (coluna 2) é obrigatório para atualizar.");
  }

  const item: ParsedItem = { id, code, name, price, shortDescription };
  return { items: [item], cleaned_line: parts.join("|") };
}

export function toMinimalPutBody(p: ParsedItem) {
  // Enviar somente campos seguros p/ PUT do produto
  const body: any = {};
  if (p.name) body.nome = p.name;
  if (p.code) body.codigo = p.code;
  if (typeof p.price === "number") body.preco = Number(p.price.toFixed(2));
  // NÃO enviar imagens aqui. Descrição curta só se realmente quiser atualizar.
  // if (p.shortDescription) body.descricaoCurta = p.shortDescription;
  return body;
}
