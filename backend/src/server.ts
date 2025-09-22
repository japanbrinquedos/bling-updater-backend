import express from "express";
import cors from "cors";
import { router } from "./routes.js";

const app = express();

const allow = (process.env.CORS_ALLOW_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allow.length === 0 || allow.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(router);

const port = process.env.PORT ? Number(process.env.PORT) : 10000;
app.listen(port, () => {
  console.log(`Backend up on :${port}`);
});
