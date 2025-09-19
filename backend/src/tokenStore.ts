import type { Request, Response, NextFunction } from "express";

/**
 * Middleware simples de autenticação.
 * - Usa Bearer do header `Authorization` (preferido)
 * - Ou `x-access-token`
 * - Ou variável de ambiente BLING_ACCESS_TOKEN (fallback, útil em debug)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const headerToken = (req.headers["x-access-token"] as string) || null;
  const envToken = process.env.BLING_ACCESS_TOKEN || null;

  const token = bearer || headerToken || envToken;

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: { message: "Sem access_token. Faça login no Bling (OAuth v3)." },
    });
  }

  // anexa de forma simples
  (req as any).accessToken = token;
  next();
}
