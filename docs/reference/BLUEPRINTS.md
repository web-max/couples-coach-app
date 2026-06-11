# BLUEPRINTS.md — what to lift from the predecessor, and how

The frozen predecessor repo (`web-max/chatgpt-relationship-app`) holds patterns
that were designed, reviewed, and hardened over the product's life. **Adapt them —
don't copy verbatim**: this product's schema is designed natively around app
objects (sessions, device-transcript pointers, coach docs, shared artifacts,
situations), so it's the *rules* that port, not the tables.

## The crown jewels (port the pattern, redesign the table)

| Pattern | Where it lives in the predecessor | What to keep |
|---|---|---|
| RLS is the gate | `supabase/migrations/`, `docs/reference/SECURITY.md` | Every safety rule enforced in Postgres policies; app code never re-implements gates; identity always from `auth.uid()`, never client input. |
| Relationship scoping | schema + RLS throughout | Every row scopes to `relationship_id`; multi-tenant from day one; one active relationship per user (partial unique index on active membership). |
| Two-party handshakes | resolve / unlock / delete RPCs | Mutual yes for resolution, unlock, deletion, and (new here) import of the shared record; unilateral for re-lock and opt-outs. |
| Edit-after-read lock | summaries schema + RPCs | Read-tracking arms the lock; no silent rewriting of shared history. |
| RPC-only writes | `SECURITY DEFINER` functions | Mutations through named RPCs, never inline client logic; no RPC ever granted to `anon`. |
| Lifecycle & grace | leave/delete RPCs | Leaving ≠ deleting; 15-day grace purge; deletion never unilaterally destroys shared history. |
| Portability guardrails | `docs/reference/PORTABILITY.md` | Standard Postgres only; documented escape routes for any vendor coupling (now including the AI relay and RevenueCat). |
| CI discipline | `.github/workflows/ci.yml`, `ci-autoretry.yml` | Green means passed; auto-retry only infra cancellations, never real failures. |

## What does NOT port

- The MCP server, OAuth AS, and everything ChatGPT-shaped (`server/`).
- The summaries-centric schema as-is — redesign natively.
- The ChatGPT map-reduce build engine for coach docs (replaced by server-side
  background jobs — see `KEY-DECISIONS.md` §5).
- The web user-app (`web/app/app/*`) — phone-only v1; web is marketing.

## New surfaces with no predecessor (design fresh, security-first)

- The **relay** (provider keys, streaming, abuse limits, transit-only handling).
- The **session meter** (per-person counts, quiet per-session cap, IAP entitlements
  via RevenueCat webhooks).
- The **E2EE vault** (opaque blobs, user-held keys, key-loss UX).
- The **importer** (one-time, two-key for shared record — `KEY-DECISIONS.md` §10).
- **Coach-doc build jobs** (send–build–purge–deliver; purge is a hard guarantee,
  audit it like a security control).
