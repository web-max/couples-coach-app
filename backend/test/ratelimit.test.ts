import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { makeApp } from "../src/app.js";
import { testConfig, tokenFor } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("rate limit", () => {
  it("429 after rateLimitMax requests in the window", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const app = makeApp(testConfig({ rateLimitMax: 2 }));
    const token = await tokenFor("11111111-1111-1111-1111-111111111111");
    const hit = () =>
      request(app)
        .post("/v1/chat")
        .set("authorization", `Bearer ${token}`)
        .send({ messages: [{ role: "user", content: "hi" }] });
    expect((await hit()).status).toBe(502);
    expect((await hit()).status).toBe(502);
    expect((await hit()).status).toBe(429);
  });
});
