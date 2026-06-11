# backend/

The app's server. Four jobs, one service: the **relay** (AI provider traffic,
keys server-side, transit-only), the **meter** (free sessions per person/month,
quiet per-session cap, RevenueCat entitlements), the **vault** (opaque E2EE backup
blobs), and the **importer** (one-time PairGPT migration, two-key for the shared
record). Coach-doc build jobs (send–build–purge–deliver) run here too.

## Status

Phase 1: the **relay** exists (Supabase JWT auth → per-user rate limit →
OpenRouter streaming, transit-only). Meter, vault, importer, build jobs: not yet.

## Running it

- Dev: copy `.env.example` to `.env`, fill it, then `npm run dev -w backend`.
- Tests: `npm test -w backend` (upstream is mocked; no network or keys needed).
- Deploy: Railway service rooted at the repo (root `railway.toml`), env vars
  from `.env.example`. The model is the `MODEL_ID` config string — swappable
  without an app update.
