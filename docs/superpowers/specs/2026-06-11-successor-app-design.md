# Successor App — Design Ledger (grill-me session, 2026-06-11)

**Status: decided — every item below was user-approved in a full grill-me walk.**
This document seeds the successor repo's founding docs (`SPEC.md`, `KEY-DECISIONS.md`);
it lives here only because the successor repo does not exist yet. PairGPT itself is
feature-frozen — see `KEY-DECISIONS.md` §18.

## What the successor is

A standalone native mobile app (iOS + Android) for couples coaching, with **its own
AI**: each partner is coached privately in full conversations, chooses exactly what
crosses to the other, and the coach sees both sides of every conflict. Same soul as
PairGPT, new engine — no ChatGPT dependency, no MCP, its own brand, repo, database,
and infrastructure.

## The decision ledger

### 1. Standalone couples product — the moat carries over

A separate product, not a PairGPT extension. It **is** a couples app: solo AI
coaching is a commodity (ChatGPT already is one); the consensual
"your-coach-knows-your-partner's-side" loop is the only durable differentiator.
Decoupling frees the app from founding promises it cannot keep (PairGPT Decision 2:
no inference on our servers, no transcripts, bring-your-own ChatGPT).

### 2. The consent ritual survives, coach-assisted

At session end the coach **drafts** the partner-safe summary; the owner reads,
edits, and approves before anything crosses. Summaries land in **situations** (one
per ongoing topic); the **edit-after-read lock** and the **two-yes resolution**
carry over unchanged. The in-app coach removes the friction (drafting, filing) —
never the steps. Trust-by-inspection stays the brand: you can always point at
exactly what your partner saw.

### 3. Our own AI, behind a provider-agnostic relay

The app never talks to AI vendors directly. The backend relays chat traffic
(OpenRouter-style); the vendor key lives server-side only; the model is a config
string swappable without an app update. Accepted costs: ~5% routing fee;
provider-specific prompt-caching works less well through a router.

### 4. Custody: transcripts live on the device — "transcripts transit, never persist"

Full conversation transcripts are stored **on the user's phone**. Optional **E2EE
backup**: an encrypted copy in our vault that only the user's key opens (lose the
key, lose the backup — stated plainly). Optional owner-initiated sharing of a full
transcript with the partner. The honest privacy promise — since every chat message
already passes through our relay — is **"we process, we never keep"**: servers
handle conversation content in transit and never store it readable. We never become
the company holding everyone's raw relationship secrets at rest.

### 5. Coach memory: distilled coach docs, built by our backend AI

The **personal coach doc** ("the notebook") is distilled from the full transcript
after sessions — full fidelity in at writing time — stored with the account,
**private to its owner**, giving cross-device continuity (a lost phone never erases
the coach's memory). Deeper re-analysis later is possible because the phone (and
backup) still hold the transcripts and can re-send them transit-only for a rebuild.
Generation runs **server-side in background jobs** — PairGPT's resumable ChatGPT
map-reduce (Decision 15's build engine) existed only because of the
no-server-inference rule and is retired here. A "re-read last session verbatim"
continuity upgrade can be bolted on later.

### 6. Relationship doc: send–build–purge–deliver, shared ingredients by default

Built server-side: with consent, each phone sends material; the server builds with
backend AI, **purges the inputs immediately**, and delivers a copy to both partners.
**Ingredients rule (carried unchanged from PairGPT Decision 15):** by default the
doc is built **only from already-shared artifacts**; each partner may
**independently and reversibly opt in** to include their own private material —
their data, their call; the output is relationship-framed and **never quotes or
attributes** one partner's private content. The plumbing (purge) protects custody;
the recipe (ingredients) protects against private venting echoing into a doc the
partner reads.

### 7. Business model: metered freemium + native IAP

We pay for inference, so usage is bounded: **N free coaching sessions per person per
month** (per person, not per couple — one partner's heavy week never eats the
other's), with a quiet per-session cap so a "session" can't run forever.
Subscription removes the meter. Payments via native in-app purchase through
**RevenueCat** (both stores); the store fee is the price of frictionless checkout.
Exact numbers are launch-tuning, not architecture.

### 8. App stack: React Native + Expo

One TypeScript codebase for both platforms, matching existing team skills. Voice
input ships via platform dictation first; dedicated transcription later if needed.

### 9. Old PairGPT: frozen, not killed

Keeps running (near-zero cost), receives security/maintenance fixes only, gains no
features. Possible future: a ChatGPT door rebuilt as a **thin client of the
successor's backend** — a feature of the new product, never a second product.
Archive the repo only at true retirement (a frozen-but-running product must remain
hotfixable).

### 10. One-time import; two keys for the shared record

A user's **private material** (private reflections, personal coach doc) imports on
their sole say-so the moment they join. The **shared record** (approved summaries,
situations, the resolved list, the relationship doc) moves only when **both
partners** have joined the successor **and both consent** — the same two-key pattern
as PairGPT's unlock and delete, applied once more on the way out. Until then, the
coach works from the importing partner's side only.

### 11. Build: new home, stolen blueprints

Fresh repo (created new — **not** a GitHub fork), fresh database and servers.
Copy the proven **patterns**: safety enforced in the database itself (RLS as the
gate, never re-implemented in app code), relationship scoping on every row,
two-party handshakes, writes through named RPCs only, the portability guardrails,
plus the working-style files (`CLAUDE.md`, vendored `.claude/skills/`). Design the
**tables natively** around app objects (sessions, device-transcript pointers, coach
docs, shared artifacts, situations) instead of bending ChatGPT-era tables. Monorepo:
`app/` (Expo), `backend/` (relay, meter, vault, importer), `db/`, `docs/`. Same
database technology (Postgres/Supabase) under the same portability rules.
**Phone-only v1**: the old web dashboard's jobs (pairing, staging, resolving) move
into the app; the only website is marketing.

### 12. Brand: new name, no "GPT"

The name decouples from OpenAI (app-store policy, trademark, and honesty — the AI
inside isn't necessarily GPT). Scaffold under a neutral codename; rename the repo
when the name is chosen (GitHub redirects old URLs automatically).

## What the successor explicitly does NOT change

- A partner only ever sees what the owner explicitly approved, with a
  preview-and-approve step on every crossing.
- No silent rewriting of shared history; two-party patterns for resolution,
  unlocking, and deletion.
- Safety rules live in the database, enforced once, inherited by every client.
- No public per-couple surface of any kind.

## Deliberately deferred (decide at build time, not architecture)

- Exact free-tier numbers (sessions/month, per-session cap) — tune with real cost data.
- Concrete model choice (it's a config string).
- The actual product name.
- E2EE backup key UX (recovery phrase vs. platform keystore).
- Verbatim last-session continuity (bolt-on, optional).
- On-device small-model analysis (revisit when phone AIs mature).
