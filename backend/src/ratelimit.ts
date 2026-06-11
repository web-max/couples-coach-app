import type { RequestHandler } from "express";
import type { Config } from "./config.js";

// In-memory sliding window per user. Single-instance phase 1; replace with a
// shared store if the relay ever scales horizontally.
export function makeRateLimit(cfg: Config): RequestHandler {
  const hits = new Map<string, number[]>();
  return (_req, res, next) => {
    const userId = res.locals.userId as string;
    const now = Date.now();
    const windowStart = now - cfg.rateLimitWindowMs;
    const recent = (hits.get(userId) ?? []).filter((t) => t > windowStart);
    if (recent.length >= cfg.rateLimitMax) {
      hits.set(userId, recent);
      return res.status(429).json({ error: "rate limited" });
    }
    recent.push(now);
    hits.set(userId, recent);
    next();
  };
}
