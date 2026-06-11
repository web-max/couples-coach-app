import express from "express";
import type { Config } from "./config.js";

export function makeApp(cfg: Config) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  return app;
}
