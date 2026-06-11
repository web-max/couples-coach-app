import { describe, it, expect } from "vitest";
import request from "supertest";
import { makeApp } from "../src/app.js";
import { testConfig, tokenFor } from "./helpers.js";

const app = () => makeApp(testConfig());

describe("auth middleware (POST /v1/chat)", () => {
  it("401 without a token", async () => {
    const res = await request(app()).post("/v1/chat").send({ messages: [] });
    expect(res.status).toBe(401);
  });
  it("401 with garbage token", async () => {
    const res = await request(app())
      .post("/v1/chat")
      .set("authorization", "Bearer not-a-jwt")
      .send({ messages: [] });
    expect(res.status).toBe(401);
  });
  it("passes a valid token through (fails later on body, not 401)", async () => {
    const res = await request(app())
      .post("/v1/chat")
      .set("authorization", `Bearer ${await tokenFor("11111111-1111-1111-1111-111111111111")}`)
      .send({ messages: [] });
    expect(res.status).not.toBe(401);
  });
});
