import "dotenv/config";
import express from "express";
import cors from "cors";

// Se o seu routes.ts exporta `router` como named export:
import { router } from "./routes.js";

const app = express();

// Body parsers
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/**
 * CORS: defina CORS_ALLOW_ORIGINS="https://seu-front1,https://seu-front2"
 * ou FRONTEND_ORIGIN="https://seu-front"
 */
const allowList = (
  process.env.CORS_ALLOW_ORIGINS ||
  process.env.FRONTEND_ORIGIN ||
  ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // healthcheck interno, curl, etc.
      if (allowList.length === 0 || allowList.includes(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  })
);

// Health & raiz (Render usa isso no healthcheck)
app.get("/", (_req, res) => res.send("OK"));
app.get("/health", (_req, res) => res.json({ ok: true }));

// Suas rotas de auth/patch/etc.
app.use(router);

const PORT = Number(process.env.PORT || 10000);

// Bind em 0.0.0.0 é importante no Render
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend up on 0.0.0.0:${PORT}`);
});
