// Ponte neutra para o token sem acoplar ao nome exato exportado no seu tokenStore.
// NÃO altera seu fluxo: só descobre qual função já existe e retorna o access_token.
import * as T from "./tokenStore.js";

// Normaliza o retorno para sempre entregar a string do Bearer.
async function normalize(ret: any): Promise<string> {
  if (!ret) throw new Error("token_missing");
  if (typeof ret === "string") return ret;
  if (typeof ret === "object") {
    return (
      ret.access_token ||
      ret.token ||
      ret.bearer ||
      ret.bearerToken ||
      ret.value ||
      ""
    );
  }
  throw new Error("token_unrecognized_shape");
}

export async function getAccessToken(): Promise<string> {
  // Ordem de tentativa sem quebrar types:
  const anyT = T as any;

  if (typeof anyT.getAccessToken === "function") {
    return normalize(await anyT.getAccessToken());
  }
  if (typeof anyT.ensureAccessToken === "function") {
    return normalize(await anyT.ensureAccessToken());
  }
  if (typeof anyT.getToken === "function") {
    return normalize(await anyT.getToken());
  }
  if (typeof anyT.requireAuth === "function") {
    // Alguns stores retornam o objeto de token aqui.
    return normalize(await anyT.requireAuth());
  }
  // Última cartada: status pode carregar o token (alguns stores expõem isso).
  if (typeof anyT.getAccessTokenStatus === "function") {
    const st = await anyT.getAccessTokenStatus();
    return normalize(st);
  }

  throw new Error("No token getter exported from tokenStore");
}
