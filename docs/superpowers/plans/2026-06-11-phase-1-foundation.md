# Phase 1: Foundation (schema + RLS, relay, bare chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One person can sign in, talk to the coach through our relay (OpenRouter), and keep the transcript on their device — with the trust foundation (RLS, RPC-only writes, no content at rest) proven by tests.

**Architecture:** npm-workspaces monorepo (`backend`, `app`; `db/` is plain SQL). The database stores session *metadata only* — transcripts never touch it. The Expo app authenticates with Supabase, calls `start_session`/`end_session` RPCs directly against Supabase, and streams chat through the backend relay, which verifies the Supabase JWT, prepends the server-side coach prompt, forwards to OpenRouter, and pipes SSE back without persisting or logging content. RLS + grants are tested against a throwaway local Postgres with a Supabase shim (harness ported from the predecessor).

**Tech Stack:** Postgres/Supabase (SQL migrations, RLS, SECURITY DEFINER RPCs) · Node 22 + TypeScript + Express 4 + jose + zod + vitest + supertest (backend) · Expo / React Native + TypeScript + @supabase/supabase-js + expo-sqlite + expo/fetch streaming + jest-expo (app) · GitHub Actions CI (typecheck + tests + db harness) · Railway (backend deploy).

**Settled context (do not re-decide):** Railway hosting; OpenRouter as first relay vendor (model = config string); Supabase Auth (RLS keys off `auth.uid()`); meter numbers deferred to server-side config (no meter in phase 1). Trust rules from `docs/reference/BLUEPRINTS.md`: RLS is the gate, relationship scoping, RPC-only writes, no `anon` grants, transcripts transit-never-persist.

---

## File structure

```
package.json                      root: workspaces [backend, app], db:test script
scripts/test-migrations.sh        throwaway-Postgres harness (ported from predecessor)
db/migrations/0001_init.sql       relationships, relationship_members, sessions + RLS + grants
db/migrations/0002_session_rpcs.sql  start_session / end_session (SECURITY DEFINER)
db/tests/01_rls_and_sessions.sql  behavioral RLS + RPC tests
backend/package.json              express/jose/zod; vitest/supertest dev
backend/tsconfig.json
backend/src/config.ts             env → typed Config
backend/src/auth.ts               Supabase JWT verification middleware (HS256 or JWKS)
backend/src/ratelimit.ts          per-user sliding-window limiter
backend/src/prompt.ts             hardcoded coach system prompt
backend/src/relay.ts              POST /v1/chat — validate, forward, stream SSE
backend/src/app.ts                express app factory (testable)
backend/src/index.ts              bootstrap (listen)
backend/test/*.test.ts            auth, relay, ratelimit, health
backend/.env.example
backend/railway.toml
app/                              create-expo-app blank-typescript +:
app/lib/supabase.ts               client (AsyncStorage session persistence)
app/lib/sse.ts                    pure SSE→delta parser (unit-tested)
app/lib/transcripts.ts            expo-sqlite device transcript store
app/screens/AuthScreen.tsx        email+password sign in / sign up
app/screens/ChatScreen.tsx        streaming chat, device persistence, end session
app/App.tsx                       auth gate
app/test/sse.test.ts
.github/workflows/ci.yml          backend / app / db jobs
.github/workflows/ci-autoretry.yml  ported verbatim from predecessor
KEY-DECISIONS.md                  +§13 infra decisions (Railway/OpenRouter/Supabase Auth/config-not-constants)
README.md                         Status section update (code exists now)
backend/README.md, db/README.md   +run/test instructions
```

---

### Task 1: Monorepo scaffolding + db test harness

**Files:**
- Create: `package.json` (root), `scripts/test-migrations.sh`
- Modify: none

- [ ] **Step 1: Root package.json**

```json
{
  "name": "couples-coach-app",
  "private": true,
  "workspaces": ["backend", "app"],
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "db:test": "bash scripts/test-migrations.sh"
  }
}
```

- [ ] **Step 2: Port the harness**

Copy `scripts/test-migrations.sh` from the predecessor repo, then adapt:
`MIGRATIONS_DIR` → `$REPO_ROOT/db/migrations`, `TESTS_DIR` → `$REPO_ROOT/db/tests`,
temp-dir prefix → `cca-migtest`, and guard the migrations loop with the same
`compgen -G` pattern already used for tests (so an empty dir is a pass, not a
glob error). Keep the shim verbatim (roles, `auth.users`, `auth.uid()`,
`auth.role()`, extensions/pgcrypto). `chmod +x scripts/test-migrations.sh`.

- [ ] **Step 3: Run harness on empty migrations dir**

Run: `mkdir -p db/migrations db/tests && npm run db:test`
Expected: cluster boots, shim applies, "all 0 migrations applied cleanly" (or explicit empty-dir pass), exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/test-migrations.sh
git commit -m "chore: monorepo root + ported db migration test harness"
```

---

### Task 2: Founding schema + RLS (migration 0001)

**Files:**
- Create: `db/migrations/0001_init.sql`
- Test: `db/tests/01_rls_and_sessions.sql` (Task 3 fills it; this task writes the failing skeleton)

- [ ] **Step 1: Write failing test skeleton** — `db/tests/01_rls_and_sessions.sql` containing just a `select 1 from public.sessions limit 0;` inside `begin/rollback` so the run fails until the table exists.

- [ ] **Step 2: Run** `npm run db:test` — Expected: FAIL `relation "public.sessions" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- 0001_init.sql — founding schema: relationships, memberships, sessions.
-- Trust rules ported from the predecessor (docs/reference/BLUEPRINTS.md):
-- RLS is the gate; every row scopes to a relationship; RPC-only writes;
-- no anon grants; identity always from auth.uid().

create table public.relationships (
  id         uuid primary key default gen_random_uuid(),
  status     text not null default 'solo' check (status in ('solo', 'active')),
  created_at timestamptz not null default now()
);

create table public.relationship_members (
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (relationship_id, user_id)
);

-- One active relationship per user. Plain unique for now: memberships have no
-- inactive state yet; relax to a partial index when lifecycle lands.
create unique index relationship_members_one_per_user
  on public.relationship_members (user_id);

-- Coaching-session METADATA only — transcripts live on the device, never here
-- (SPEC.md: transcripts transit, never persist).
create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  model           text,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);

create index sessions_user_started on public.sessions (user_id, started_at desc);

alter table public.relationships enable row level security;
alter table public.relationship_members enable row level security;
alter table public.sessions enable row level security;

create policy member_reads_relationship on public.relationships
  for select to authenticated
  using (exists (
    select 1 from public.relationship_members m
    where m.relationship_id = relationships.id and m.user_id = auth.uid()
  ));

create policy member_reads_own_membership on public.relationship_members
  for select to authenticated
  using (user_id = auth.uid());

-- Sessions are private coaching: owner-only, never the partner.
create policy owner_reads_own_sessions on public.sessions
  for select to authenticated
  using (user_id = auth.uid());

-- No anon surface at all; authenticated reads pass through RLS; all writes
-- happen via SECURITY DEFINER RPCs (migration 0002) — no direct write grants.
revoke all on all tables in schema public from anon;
grant select on public.relationships, public.relationship_members, public.sessions
  to authenticated;
```

- [ ] **Step 4: Run** `npm run db:test` — Expected: migration ok, test file passes (skeleton only).

- [ ] **Step 5: Commit** — `git add db/ && git commit -m "feat(db): founding schema — relationships, members, sessions with RLS"`

---

### Task 3: Session RPCs (migration 0002) + behavioral tests

**Files:**
- Create: `db/migrations/0002_session_rpcs.sql`
- Test: `db/tests/01_rls_and_sessions.sql` (replace skeleton)

- [ ] **Step 1: Write the full behavioral test (fails: RPCs missing)**

```sql
-- Behavioral test: RLS scoping + session RPCs.
-- Superuser does setup; RLS is exercised by switching to the authenticated
-- role and SET-ing request.jwt.claims (mirrors the harness shim semantics).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@test'),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

-- start_session auto-creates the relationship, owns the session.
do $$
declare s public.sessions;
begin
  s := public.start_session('test-model');
  if s.user_id <> '00000000-0000-0000-0000-0000000000a1'
    then raise exception 'FAIL: session owner mismatch'; end if;
  if s.relationship_id is null
    then raise exception 'FAIL: no relationship auto-created'; end if;
  if s.model <> 'test-model'
    then raise exception 'FAIL: model not recorded'; end if;
end $$;

-- Second session reuses the relationship (one per user).
do $$
declare n int;
begin
  perform public.start_session(null);
  select count(distinct relationship_id) into n from public.sessions;
  if n <> 1 then raise exception 'FAIL: expected 1 relationship, got %', n; end if;
  select count(*) into n from public.relationships;
  if n <> 1 then raise exception 'FAIL: visible relationships = % (want 1)', n; end if;
end $$;

-- Direct writes are blocked: no insert policy / no insert grant.
do $$
begin
  begin
    insert into public.sessions (relationship_id, user_id)
      values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1');
    raise exception 'FAIL: direct insert into sessions allowed';
  exception
    when raise_exception then raise;
    when others then null; -- expected: permission denied
  end;
end $$;

-- Bob sees nothing of Alice's.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.sessions;
  if n <> 0 then raise exception 'FAIL: bob sees % sessions', n; end if;
  select count(*) into n from public.relationships;
  if n <> 0 then raise exception 'FAIL: bob sees % relationships', n; end if;
  select count(*) into n from public.relationship_members;
  if n <> 0 then raise exception 'FAIL: bob sees % memberships', n; end if;
end $$;

-- Bob cannot end Alice's session.
do $$
declare v_sid uuid;
begin
  reset role;  -- superuser peek for the id
  select id into v_sid from public.sessions where ended_at is null limit 1;
  set local role authenticated;
  begin
    perform public.end_session(v_sid);
    raise exception 'FAIL: bob ended alice''s session';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if; -- expected otherwise
  end;
end $$;

-- Alice ends it; double-end fails.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$
declare v_sid uuid; v_ended timestamptz;
begin
  select id into v_sid from public.sessions where ended_at is null limit 1;
  perform public.end_session(v_sid);
  select ended_at into v_ended from public.sessions where id = v_sid;
  if v_ended is null then raise exception 'FAIL: ended_at not set'; end if;
  begin
    perform public.end_session(v_sid);
    raise exception 'FAIL: double-end succeeded';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

-- anon sees nothing and can execute nothing.
set local role anon;
do $$
declare n int := -1;
begin
  begin
    select count(*) into n from public.sessions;
  exception when others then n := 0; -- permission denied also acceptable
  end;
  if n <> 0 then raise exception 'FAIL: anon sees % sessions', n; end if;
  begin
    perform public.start_session(null);
    raise exception 'FAIL: anon executed start_session';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

rollback;
```

- [ ] **Step 2: Run** `npm run db:test` — Expected: FAIL `function public.start_session(...) does not exist`.

- [ ] **Step 3: Write migration 0002**

```sql
-- 0002_session_rpcs.sql — RPC-only writes for sessions.
-- SECURITY DEFINER with pinned search_path; EXECUTE for authenticated only,
-- never anon (predecessor rule: no RPC is ever granted to anon).

create or replace function public.start_session(p_model text default null)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rel uuid;
  v_session public.sessions;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select relationship_id into v_rel
    from public.relationship_members
   where user_id = v_uid;

  if v_rel is null then
    insert into public.relationships default values returning id into v_rel;
    insert into public.relationship_members (relationship_id, user_id)
      values (v_rel, v_uid);
  end if;

  insert into public.sessions (relationship_id, user_id, model)
    values (v_rel, v_uid, p_model)
    returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.end_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.sessions
     set ended_at = now()
   where id = p_session_id
     and user_id = auth.uid()
     and ended_at is null;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'session not found, not yours, or already ended';
  end if;
end;
$$;

revoke all on function public.start_session(text) from public, anon;
revoke all on function public.end_session(uuid) from public, anon;
grant execute on function public.start_session(text) to authenticated;
grant execute on function public.end_session(uuid) to authenticated;
```

- [ ] **Step 4: Run** `npm run db:test` — Expected: 2 migrations ok, 1 behavioral test file passes.

- [ ] **Step 5: Commit** — `git add db/ && git commit -m "feat(db): start_session/end_session RPCs + RLS behavioral tests"`

---

### Task 4: Backend scaffold + health route

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/src/config.ts`, `backend/src/app.ts`, `backend/src/index.ts`
- Test: `backend/test/health.test.ts`

- [ ] **Step 1: backend/package.json** (stack matches predecessor server)

```json
{
  "name": "backend",
  "version": "0.1.0",
  "private": true,
  "description": "couples-coach-app backend — relay (phase 1)",
  "type": "module",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.21.2",
    "jose": "^5.9.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: backend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: config.ts**

```ts
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
```

- [ ] **Step 4: Failing health test** — `backend/test/health.test.ts`

```ts
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
```

And `backend/test/helpers.ts`:

```ts
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
```

- [ ] **Step 5: Run** `npm test -w backend` — Expected: FAIL (`makeApp` missing).

- [ ] **Step 6: app.ts (minimal) + index.ts**

```ts
// src/app.ts
import express from "express";
import type { Config } from "./config.js";

export function makeApp(cfg: Config) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  return app;
}
```

```ts
// src/index.ts
import { loadConfig } from "./config.js";
import { makeApp } from "./app.js";

const cfg = loadConfig();
makeApp(cfg).listen(cfg.port, () => {
  console.log(`relay listening on :${cfg.port}`);
});
```

- [ ] **Step 7: Run** `npm install && npm test -w backend && npm run typecheck -w backend` — Expected: PASS.

- [ ] **Step 8: Commit** — `git add package-lock.json backend/ && git commit -m "feat(backend): express scaffold, config, health route"`

---

### Task 5: Supabase JWT auth middleware (TDD)

**Files:**
- Create: `backend/src/auth.ts`
- Test: `backend/test/auth.test.ts`

- [ ] **Step 1: Failing tests** — exercise via a protected probe route added in `makeApp` (next step); assertions:

```ts
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
```

- [ ] **Step 2: Run** — Expected: FAIL (route missing → 404, not 401).

- [ ] **Step 3: Implement auth.ts**

```ts
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
```

Wire into `app.ts`: `app.post("/v1/chat", makeAuth(cfg), (_req, res) => res.status(501).end());` (relay replaces the 501 stub in Task 6).

- [ ] **Step 4: Run** `npm test -w backend` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(backend): supabase JWT auth middleware"`

---

### Task 6: Relay route — validate, forward, stream (TDD)

**Files:**
- Create: `backend/src/relay.ts`, `backend/src/prompt.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/test/relay.test.ts`

- [ ] **Step 1: prompt.ts**

```ts
// The coach's voice lives server-side: the app never carries the prompt and a
// prompt change never needs an app release. Refined in a later phase.
export const COACH_PROMPT = `You are a private relationship coach talking with one partner in a couple.
Listen first. Reflect what you hear, ask one good question at a time, and offer
practical, concrete suggestions when asked. Be warm, direct, and plain-spoken —
no therapy-speak. You are a coaching tool, not a therapist; if someone may be in
danger or in crisis, say plainly that this needs a human professional and
suggest they seek one.`;
```

- [ ] **Step 2: Failing tests** — `backend/test/relay.test.ts`

```ts
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

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
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
```

- [ ] **Step 3: Run** — Expected: FAIL (501 stub).

- [ ] **Step 4: Implement relay.ts**

```ts
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
```

Wire in `app.ts` (replaces 501 stub): `app.post("/v1/chat", makeAuth(cfg), makeRelay(cfg));`

- [ ] **Step 5: Run** `npm test -w backend && npm run typecheck -w backend` — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(backend): OpenRouter relay — transit-only streaming chat"`

---

### Task 7: Per-user rate limit (TDD)

**Files:**
- Create: `backend/src/ratelimit.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/test/ratelimit.test.ts`

- [ ] **Step 1: Failing test**

```ts
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
```

- [ ] **Step 2: Run** — Expected: FAIL (third request 502, not 429).

- [ ] **Step 3: Implement ratelimit.ts**

```ts
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
```

Wire: `app.post("/v1/chat", makeAuth(cfg), makeRateLimit(cfg), makeRelay(cfg));`

- [ ] **Step 4: Run** `npm test -w backend` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(backend): per-user sliding-window rate limit"`

---

### Task 8: Backend deploy config + env example

**Files:**
- Create: `backend/.env.example`, `backend/railway.toml`
- Modify: `backend/README.md`

- [ ] **Step 1: .env.example**

```bash
# Required
OPENROUTER_API_KEY=
# One of the two: legacy HS256 secret, or project URL for JWKS verification
SUPABASE_JWT_SECRET=
SUPABASE_URL=

# Optional (defaults shown)
PORT=3000
MODEL_ID=anthropic/claude-sonnet-4.5
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
RATE_LIMIT_MAX=30
RATE_LIMIT_WINDOW_MS=300000
```

- [ ] **Step 2: railway.toml**

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm ci && npm run build -w backend"

[deploy]
startCommand = "npm start -w backend"
healthcheckPath = "/health"
restartPolicyType = "ON_FAILURE"
```

- [ ] **Step 3: Append a "Running it" section to backend/README.md** — dev (`npm run dev -w backend` with `.env`), test (`npm test -w backend`), deploy (Railway service rooted at repo, env vars from `.env.example`).

- [ ] **Step 4: Commit** — `git add backend/ && git commit -m "chore(backend): env example, railway config, run docs"`

---

### Task 9: Expo app scaffold

**Files:**
- Create: `app/` via generator (template files + our configs)

- [ ] **Step 1: Generate** — from repo root:

Run: `npx create-expo-app@latest app --template blank-typescript --no-install`
Then: `npm install` (root — hoists workspace deps).

- [ ] **Step 2: Add deps**

Run: `npm install -w app @supabase/supabase-js @react-native-async-storage/async-storage expo-sqlite react-native-url-polyfill`
Run: `npm install -w app -D jest jest-expo @types/jest`

- [ ] **Step 3: Wire scripts in app/package.json** — add:

```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "test": "jest"
},
"jest": { "preset": "jest-expo" }
```

- [ ] **Step 4: Verify** — `npm run typecheck -w app` — Expected: PASS (template compiles).
- [ ] **Step 5: Commit** — `git add app/ package-lock.json package.json && git commit -m "feat(app): expo blank-typescript scaffold in workspace"`

---

### Task 10: SSE parser (TDD, pure)

**Files:**
- Create: `app/lib/sse.ts`
- Test: `app/test/sse.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { parseSse } from "../lib/sse";

describe("parseSse", () => {
  it("extracts content deltas across chunk boundaries", () => {
    let st = parseSse("", 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choi');
    expect(st.deltas).toEqual(["Hel"]);
    expect(st.done).toBe(false);
    st = parseSse(st.buffer, 'ces":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n');
    expect(st.deltas).toEqual(["lo"]);
    expect(st.done).toBe(true);
  });
  it("ignores comments and non-content events", () => {
    const st = parseSse("", ': keepalive\n\ndata: {"choices":[{"delta":{}}]}\n\n');
    expect(st.deltas).toEqual([]);
    expect(st.done).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npm test -w app` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// Incremental parser for OpenAI/OpenRouter-style SSE chat streams.
// Feed raw text chunks; carry `buffer` between calls.
export function parseSse(
  buffer: string,
  chunk: string,
): { buffer: string; deltas: string[]; done: boolean } {
  const text = buffer + chunk;
  const events = text.split("\n\n");
  const rest = events.pop() ?? "";
  const deltas: string[] = [];
  let done = false;
  for (const event of events) {
    for (const line of event.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") {
        done = true;
        continue;
      }
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) deltas.push(delta);
      } catch {
        // partial or non-JSON event — skip
      }
    }
  }
  return { buffer: rest, deltas, done };
}
```

- [ ] **Step 4: Run** `npm test -w app` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add app/ && git commit -m "feat(app): incremental SSE delta parser"`

---

### Task 11: Supabase client + auth screen

**Files:**
- Create: `app/lib/supabase.ts`, `app/screens/AuthScreen.tsx`
- Modify: `app/App.tsx`

- [ ] **Step 1: lib/supabase.ts**

```ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const RELAY_URL = process.env.EXPO_PUBLIC_RELAY_URL ?? "";
```

- [ ] **Step 2: AuthScreen.tsx** — email + password, two buttons (Sign in / Create account), inline error text:

```tsx
import { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Coach</Text>
      <TextInput
        style={styles.input}
        placeholder="email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title="Sign in"
        disabled={busy}
        onPress={() => run(() => supabase.auth.signInWithPassword({ email, password }))}
      />
      <Button
        title="Create account"
        disabled={busy}
        onPress={() => run(() => supabase.auth.signUp({ email, password }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "600", textAlign: "center", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 },
  error: { color: "#c00" },
});
```

- [ ] **Step 3: App.tsx auth gate**

```tsx
import { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AuthScreen from "./screens/AuthScreen";
import ChatScreen from "./screens/ChatScreen";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return (
    <SafeAreaView style={styles.root}>
      {session ? <ChatScreen session={session} /> : <AuthScreen />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
```

(`ChatScreen` lands in Task 13; create a placeholder `screens/ChatScreen.tsx` exporting a `<Text>chat</Text>` view so typecheck passes, replaced in Task 13.)

- [ ] **Step 4: Verify** — `npm run typecheck -w app && npm test -w app` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(app): supabase auth gate + sign-in screen"`

---

### Task 12: Device transcript store (expo-sqlite)

**Files:**
- Create: `app/lib/transcripts.ts`

- [ ] **Step 1: Implement** (device custody — this is the only place full transcripts live)

```ts
import * as SQLite from "expo-sqlite";

export type StoredMessage = {
  id: number;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("transcripts.db");
    await db.execAsync(`
      pragma journal_mode = wal;
      create table if not exists messages (
        id integer primary key autoincrement,
        session_id text not null,
        role text not null check (role in ('user', 'assistant')),
        content text not null,
        created_at integer not null
      );
      create index if not exists messages_session on messages (session_id, id);
    `);
  }
  return db;
}

export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    "insert into messages (session_id, role, content, created_at) values (?, ?, ?, ?)",
    sessionId,
    role,
    content,
    Date.now(),
  );
}

export async function loadMessages(sessionId: string): Promise<StoredMessage[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<{
    id: number;
    session_id: string;
    role: "user" | "assistant";
    content: string;
    created_at: number;
  }>("select * from messages where session_id = ? order by id", sessionId);
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
}
```

- [ ] **Step 2: Verify** — `npm run typecheck -w app` — Expected: PASS (native module: no unit test; exercised via ChatScreen on device).
- [ ] **Step 3: Commit** — `git add app/ && git commit -m "feat(app): device transcript store on expo-sqlite"`

---

### Task 13: Chat screen — streaming + persistence + session lifecycle

**Files:**
- Create: `app/screens/ChatScreen.tsx` (replaces placeholder)

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useRef, useState } from "react";
import {
  Button,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import type { Session } from "@supabase/supabase-js";
import { supabase, RELAY_URL } from "../lib/supabase";
import { parseSse } from "../lib/sse";
import { appendMessage, loadMessages } from "../lib/transcripts";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatScreen({ session }: { session: Session }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Resume the device transcript for the current coaching session, if any.
    (async () => {
      if (sessionIdRef.current)
        setMessages(await loadMessages(sessionIdRef.current));
    })();
  }, []);

  async function ensureSession(): Promise<string> {
    if (sessionIdRef.current) return sessionIdRef.current;
    const { data, error } = await supabase.rpc("start_session");
    if (error) throw new Error(error.message);
    sessionIdRef.current = data.id as string;
    return sessionIdRef.current;
  }

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    const history = [...messages, { role: "user" as const, content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    try {
      const sid = await ensureSession();
      await appendMessage(sid, "user", content);

      const res = await expoFetch(`${RELAY_URL}/v1/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) throw new Error(`relay error ${res.status}`);

      let buffer = "";
      let assistant = "";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const st = parseSse(buffer, decoder.decode(value, { stream: true }));
        buffer = st.buffer;
        if (st.deltas.length > 0) {
          assistant += st.deltas.join("");
          const snapshot = assistant;
          setMessages([...history, { role: "assistant", content: snapshot }]);
        }
        if (st.done) break;
      }
      if (assistant) await appendMessage(sid, "assistant", assistant);
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
      setMessages(history);
    } finally {
      setBusy(false);
    }
  }

  async function endSession() {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await supabase.rpc("end_session", { p_session_id: sid });
    sessionIdRef.current = null;
    setMessages([]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Coach</Text>
        <Button title="End session" onPress={endSession} disabled={busy} />
        <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
      </View>
      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(_item, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.mine : styles.theirs]}>
            <Text>{item.content || "…"}</Text>
          </View>
        )}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Talk to your coach"
          value={input}
          onChangeText={setInput}
          editable={!busy}
          multiline
        />
        <Button title="Send" onPress={send} disabled={busy || !input.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  title: { fontSize: 20, fontWeight: "600" },
  list: { flex: 1, paddingHorizontal: 12 },
  bubble: { borderRadius: 12, padding: 10, marginVertical: 4, maxWidth: "85%" },
  mine: { alignSelf: "flex-end", backgroundColor: "#dcebff" },
  theirs: { alignSelf: "flex-start", backgroundColor: "#eee" },
  error: { color: "#c00", paddingHorizontal: 12 },
  composer: { flexDirection: "row", alignItems: "flex-end", padding: 8, gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    maxHeight: 120,
  },
});
```

- [ ] **Step 2: Verify** — `npm run typecheck -w app && npm test -w app` — Expected: PASS.
- [ ] **Step 3: Add `app/.env.example`**

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_RELAY_URL=
```

- [ ] **Step 4: Commit** — `git add app/ && git commit -m "feat(app): streaming chat screen with device transcripts and session lifecycle"`

---

### Task 14: CI

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/ci-autoretry.yml`

- [ ] **Step 1: ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    name: backend · typecheck + tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck -w backend
      - run: npm test -w backend

  app:
    name: app · typecheck + tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck -w app
      - run: npm test -w app

  db:
    name: db · migrations + tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Install PostgreSQL server
        run: sudo apt-get update && sudo apt-get install -y --no-install-recommends postgresql
      - name: Apply migrations + run behavioral tests
        run: bash scripts/test-migrations.sh
```

- [ ] **Step 2: Port `ci-autoretry.yml` verbatim from the predecessor** (auto-retries infra cancellations only, never real failures — BLUEPRINTS row "CI discipline").

- [ ] **Step 3: Commit** — `git add .github/ && git commit -m "ci: backend/app typecheck+tests, db migration harness, autoretry"`

---

### Task 15: Doc reconciliation

**Files:**
- Modify: `KEY-DECISIONS.md` (+§13), `README.md` (Status), `db/README.md`, `backend/README.md`

- [ ] **Step 1: KEY-DECISIONS.md §13** (decisions adopted by the user 2026-06-11, this session):

```markdown
## 13. Founding infrastructure: Railway, OpenRouter, Supabase Auth, config over constants

**Decision:** Backend hosts on Railway (as the predecessor does). OpenRouter is
the first relay vendor — reachable only through our relay, with the model as a
config string. Identity is Supabase Auth, because RLS keys off `auth.uid()`
natively. Tunable product numbers (the session meter's free-tier counts, caps)
live in server-side config, never as app constants — adjustable without an app
release; an admin surface can sit on top later.

**Why:** Each choice keeps an existing escape route: Railway and Supabase are
already covered by the portability rules (§11), OpenRouter sits behind our own
relay contract (§3), and config-over-constants is what makes "exact numbers are
launch-tuning" (§7) operationally true.
```

- [ ] **Step 2: README.md Status** — replace the "Pre-build" paragraph with a phase-1 status: foundation code exists (db schema + RLS, relay, bare chat); naming still pending.

- [ ] **Step 3: db/README.md + backend/README.md** — append how to run tests (`npm run db:test`, `npm test -w backend`) and what exists vs. planned.

- [ ] **Step 4: Full verification** — `npm run typecheck && npm test && npm run db:test` — Expected: all PASS.

- [ ] **Step 5: Commit + push**

```bash
git add -A && git commit -m "docs: capture infra decisions (§13), phase-1 status, run instructions"
git push -u origin claude/nifty-babbage-co5kv2
```

---

## Self-review notes

- **Spec coverage:** schema+RLS (Tasks 2–3), relay (4–8), bare chat with device transcripts (9–13), CI (14), docs/decision capture (15). Meter, pairing, coach docs, vault, importer: explicitly out of phase 1.
- **Type consistency:** `makeApp(cfg)` signature shared across all backend tests; `parseSse(buffer, chunk)` matches Task 13 usage; `start_session` returns the `sessions` row (`data.id` in app).
- **Known environment caveats:** OpenRouter unreachable from the dev container (proxy 403) — upstream is mocked in tests; live smoke happens on first Railway deploy. App native modules (sqlite) can't run in container — typecheck + pure-function tests only; on-device verification is a user step.
