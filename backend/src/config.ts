export type Config = {
  port: number;
  modelId: string;
  openrouterApiKey: string;
  openrouterBaseUrl: string;
  /** HS256 verification (legacy Supabase JWT secret). Either this or supabaseUrl. */
  supabaseJwtSecret?: string;
  /** Asymmetric verification via {supabaseUrl}/auth/v1/.well-known/jwks.json */
  supabaseUrl?: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const openrouterApiKey = env.OPENROUTER_API_KEY ?? "";
  if (!openrouterApiKey) throw new Error("OPENROUTER_API_KEY is required");
  if (!env.SUPABASE_JWT_SECRET && !env.SUPABASE_URL)
    throw new Error("Set SUPABASE_JWT_SECRET or SUPABASE_URL for JWT verification");
  return {
    port: Number(env.PORT ?? 3000),
    modelId: env.MODEL_ID ?? "anthropic/claude-sonnet-4.5",
    openrouterApiKey,
    openrouterBaseUrl: env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET,
    supabaseUrl: env.SUPABASE_URL,
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 30),
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS ?? 5 * 60_000),
  };
}
