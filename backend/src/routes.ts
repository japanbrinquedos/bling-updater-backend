import { Router } from "express";
import { authStatus, startAuth, handleCallback } from "./tokenStore.js";

export const router = Router();

// health
router.get("/health", (_req, res) => res.json({ ok: true }));

// OAuth — versão estável (sem tokenBridge)
router.get("/auth/status", authStatus);
router.get("/auth/start", startAuth);
router.get("/auth/callback", handleCallback);

// (demais rotas do seu app já existentes permanecem aqui, sem tocar no parser)
