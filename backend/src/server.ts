import express from "express";
import cors from "cors";
import router from "./routes.js"; // <- default import

const app = express();

const allowed = (process.env.CORS_ALLOW_ORIGINS || "https://imagens.japanbrinquedos.com.br")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      // relaxado para facilitar seu uso; ajuste se precisar
      return cb(null, true);
    },
    credentials: true
  })
);

app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => res.json({ ok: true }));
app.use("/", router);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`[bling-updater] listening on :${port}`);
});
