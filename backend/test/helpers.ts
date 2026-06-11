import { SignJWT } from "jose";
import type { Config } from "../src/config.js";

export const TEST_SECRET = "test-secret-test-secret-test-secret!";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    modelId: "test/model",
    openrouterApiKey: "test-key",
    openrouterBaseUrl: "https://upstream.test/api/v1",
    supabaseJwtSecret: TEST_SECRET,
    rateLimitMax: 30,
    rateLimitWindowMs: 300_000,
    ...overrides,
  };
}

export async function tokenFor(sub: string): Promise<string> {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(TEST_SECRET));
}
