import { Router, Request, Response } from "express";
import { parseBNAndNormalize, patchFromBN } from "./services.js";
import { requireAuth } from "./auth/index.js";

export const router = Router();

/** Healthcheck */
router.get("/health", (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

/** Preview do BN (sem exigir auth) */
router.post("/preview", (req: Request, res: Response) => {
  try {
    const { lines } = req.body || {};
    const out = parseBNAndNormalize(String(lines || ""));
    return res.json(out);
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

/** PATCH de produtos no Bling (protege com requireAuth) */
router.post("/bling/patch", requireAuth(), async (req: Request, res: Response) => {
  try {
    const { lines } = req.body || {};
    const out = await patchFromBN(String(lines || ""));
    return res.json(out);
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});
