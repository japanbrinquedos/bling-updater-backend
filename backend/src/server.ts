import express from "express";
import cors from "cors";
import router from "./routes.js";

const app = express();
app.disable("x-powered-by");

// CORS
const allow = (process.env.CORS_ALLOW_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allow.includes(origin)) return cb(null, true);
    return cb(null, false);
  }
}));

app.use(express.json({ limit: "2mb" }));

app.use("/", router);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[bling-updater] listening on :${port} — allowed: ${allow.join(",")}`);
});
