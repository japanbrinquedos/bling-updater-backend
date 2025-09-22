import type { Request, Response, NextFunction } from "express";
import { authRouter } from "./router.js";
import { getAccessToken as _getAccessToken, getStatus as _getStatus } from "./tokenStore.js";

export { authRouter };

export async function getAccessToken() {
  return _getAccessToken();
}

export function getStatus() {
  return _getStatus();
}

// Middleware para proteger rotas que chamam o Bling
export function requireAuth() {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await _getAccessToken();
      return next();
    } catch {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }
  };
}
