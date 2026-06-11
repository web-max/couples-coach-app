import express from "express";
import type { Config } from "./config.js";
import { makeAuth } from "./auth.js";

export function makeApp(cfg: Config) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.post("/v1/chat", makeAuth(cfg), (_req, res) => res.status(501).end());
  return app;
}
