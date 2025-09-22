import express from "express";
import cors from "cors";
import { router } from "./routes.js";
import { authRouter } from "./auth/index.js";

const app = express();

// CORS baseado no seu env existente
const allow = (process.env.CORS_ALLOW_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // mesma origem / curl
      if (allow.length === 0 || allow.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

// Parser JSON
app.use(express.json({ limit: "5mb" }));

// Auth isolado (mantém /auth/start, /auth/callback, /auth/status, /auth/logout)
app.use("/auth", authRouter);

// Demais rotas da aplicação
app.use(router);

// Liveness
const port = process.env.PORT ? Number(process.env.PORT) : 10000;
app.listen(port, () => {
  console.log(`Backend up on :${port}`);
});
