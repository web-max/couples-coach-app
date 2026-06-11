import { createRemoteJWKSet, jwtVerify } from "jose";
import type { RequestHandler } from "express";
import type { Config } from "./config.js";

export function makeAuth(cfg: Config): RequestHandler {
  const key = cfg.supabaseJwtSecret
    ? new TextEncoder().encode(cfg.supabaseJwtSecret)
    : createRemoteJWKSet(
        new URL(`${cfg.supabaseUrl}/auth/v1/.well-known/jwks.json`),
      );
  return async (req, res, next) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "missing token" });
    try {
      // `key` is a Uint8Array (HS256) or a JWKS resolver — jose accepts both.
      const { payload } = await jwtVerify(token, key as never, {
        audience: "authenticated",
      });
      if (!payload.sub) return res.status(401).json({ error: "invalid token" });
      res.locals.userId = payload.sub;
      next();
    } catch {
      return res.status(401).json({ error: "invalid token" });
    }
  };
}
