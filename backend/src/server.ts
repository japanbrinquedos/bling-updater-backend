import express from "express";
import cors from "cors";
import { router } from "./routes.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/", router);

// healthcheck
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`backend up on :${PORT}`);
});
