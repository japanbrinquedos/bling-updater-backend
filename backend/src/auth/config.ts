// Lê e valida variáveis de ambiente, com defaults seguros.
const req = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Env '${name}' ausente`);
  return v;
};

export const BLING_CLIENT_ID = req("BLING_CLIENT_ID");
export const BLING_CLIENT_SECRET = req("BLING_CLIENT_SECRET");
export const BLING_REDIRECT_URI = req("BLING_REDIRECT_URI");

// Defaults oficiais do Bling v3
export const BLING_AUTHORIZE_URL =
  process.env.BLING_AUTHORIZE_URL || "https://www.bling.com.br/Api/v3/oauth/authorize";
export const BLING_TOKEN_URL =
  process.env.BLING_TOKEN_URL || "https://www.bling.com.br/Api/v3/oauth/token";

// Aceita BLING_SCOPE ou BLING_SCOPES (se ambos vazios, usa 'produtos')
const scopeRaw = process.env.BLING_SCOPE || process.env.BLING_SCOPES || "produtos";
export const BLING_SCOPE = scopeRaw
  .split(/[,\s]+/)
  .filter(Boolean)
  .join(" ");

export const FRONTEND_URL = process.env.FRONTEND_URL; // opcional para redirect pós-callback
