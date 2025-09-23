import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { router } from "./routes.js";           // suas rotas já existentes (patch, callback, status, etc.)
import { registerAuthRoutes } from "./authBridge.js"; // /auth/start isolado aqui

const app = express();

// Body parser
app.use(express.json({ limit: "1mb" }));

// Cookies (necessário pro STATE)
app.use(cookieParser());

// CORS
const allow = (process.env.CORS_ALLOW_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allow.length === 0 || allow.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// Auth (/auth/start somente)
registerAuthRoutes(app);

// Suas demais rotas
app.use(router);

// Start
const PORT = Number(process.env.PORT || 10000);
app.listen(PORT, () => {
  console.log(`Backend up on :${PORT}`);
});
