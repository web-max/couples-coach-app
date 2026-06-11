import { describe, it, expect } from "vitest";
import request from "supertest";
import { makeApp } from "../src/app.js";
import { testConfig } from "./helpers.js";

describe("GET /health", () => {
  it("returns ok without auth", async () => {
    const res = await request(makeApp(testConfig())).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
