import express from "express";
import { parseBNAndNormalize, patchFromBN } from "./services.js";

export const router = express.Router();

router.post("/bling/preview", async (req, res) => {
  const { bn } = req.body ?? {};
  const out = parseBNAndNormalize(String(bn ?? ""));
  res.json(out);
});

router.post("/bling/patch", async (req, res) => {
  const { bn } = req.body ?? {};
  const out = await patchFromBN(String(bn ?? ""));
  res.json(out);
});
