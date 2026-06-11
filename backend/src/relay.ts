import type { RequestHandler } from "express";
import { z } from "zod";
import type { Config } from "./config.js";
import { COACH_PROMPT } from "./prompt.js";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(200),
});

// Transit-only: conversation content is forwarded and streamed back, never
// stored and never logged. Log lines carry metadata only.
export function makeRelay(cfg: Config): RequestHandler {
  return async (req, res) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid body" });

    const started = Date.now();
    const abort = new AbortController();
    res.on("close", () => abort.abort());

    let upstream: Response;
    try {
      upstream = await fetch(`${cfg.openrouterBaseUrl}/chat/completions`, {
        method: "POST",
        signal: abort.signal,
        headers: {
          authorization: `Bearer ${cfg.openrouterApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.modelId,
          stream: true,
          messages: [
            { role: "system", content: COACH_PROMPT },
            ...parsed.data.messages,
          ],
        }),
      });
    } catch {
      return res.status(502).json({ error: "upstream unreachable" });
    }

    if (!upstream.ok || !upstream.body) {
      console.log(`relay user=${res.locals.userId} upstream=${upstream.status}`);
      return res.status(502).json({ error: "upstream error" });
    }

    res.status(200);
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache");
    res.flushHeaders();
    try {
      for await (const chunk of upstream.body) res.write(chunk);
    } catch {
      // client or upstream went away mid-stream; nothing to persist by design
    }
    res.end();
    console.log(
      `relay user=${res.locals.userId} status=200 ms=${Date.now() - started}`,
    );
  };
}
