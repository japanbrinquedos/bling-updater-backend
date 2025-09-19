import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const headerToken = (req.headers["x-access-token"] as string) || null;
  const envToken = process.env.BLING_ACCESS_TOKEN || null;

  const token = bearer || headerToken || envToken;
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: { message: "Sem access_token. Faça login no Bling (OAuth v3)." }
    });
  }

  (req as any).accessToken = token;
  next();
}
