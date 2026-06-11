import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { makeApp } from "../src/app.js";
import { testConfig, tokenFor } from "./helpers.js";
import { COACH_PROMPT } from "../src/prompt.js";

const USER = "11111111-1111-1111-1111-111111111111";

function sseUpstream(chunks: string[], status = 200) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(status === 200 ? body : "upstream error", {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("POST /v1/chat", () => {
  it("400 on invalid body", async () => {
    const res = await request(makeApp(testConfig()))
      .post("/v1/chat")
      .set("authorization", `Bearer ${await tokenFor(USER)}`)
      .send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it("forwards model, key, coach prompt; streams chunks back", async () => {
    const fetchMock = vi.fn(async () =>
      sseUpstream(['data: {"x":1}\n\n', "data: [DONE]\n\n"]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await request(makeApp(testConfig()))
      .post("/v1/chat")
      .set("authorization", `Bearer ${await tokenFor(USER)}`)
      .send({ messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain('data: {"x":1}');
    expect(res.text).toContain("data: [DONE]");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://upstream.test/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe("test/model");
    expect(sent.stream).toBe(true);
    expect(sent.messages[0]).toEqual({ role: "system", content: COACH_PROMPT });
    expect(sent.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("502 when upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseUpstream([], 500)));
    const res = await request(makeApp(testConfig()))
      .post("/v1/chat")
      .set("authorization", `Bearer ${await tokenFor(USER)}`)
      .send({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(502);
  });
});
