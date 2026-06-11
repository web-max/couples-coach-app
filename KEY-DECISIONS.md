# KEY-DECISIONS.md

The settled, general decisions behind the product — kept deliberately high-level.
For the *why-it-feels-this-way*, see `SPEC.md`. All twelve founding decisions were
settled in the 2026-06-11 design session (full ledger with extended rationale:
`docs/superpowers/specs/2026-06-11-successor-app-design.md` in the predecessor repo,
mirrored here at bootstrap).

## 1. A standalone couples product — the moat carries over

**Decision:** A separate product, not a PairGPT extension — and it **is** a couples
app: each partner coached privately, consensual sharing, the coach seeing both sides.

**Why:** Solo AI coaching is a commodity (ChatGPT already is one). The consensual
"your-coach-knows-your-partner's-side" loop is the only durable differentiator.
Decoupling frees the app from founding promises it cannot keep (the predecessor's
"no inference on our servers, no transcripts").

## 2. The consent ritual survives, coach-assisted

**Decision:** Coach drafts the partner-safe summary → owner approves/edits before
anything crosses → situations (one per topic) → edit-after-read lock → two-yes
resolution. All carried over unchanged in *steps*; the coach does the drafting and
filing.

**Why:** The ritual is the trust model; trust-by-inspection — you can always point
at exactly what your partner saw — stays the brand. Friction goes, steps stay.

## 3. Our own AI behind a provider-agnostic relay

**Decision:** The app never talks to AI vendors. The backend relays (OpenRouter-
style); vendor keys live server-side; the model is a config string, swappable
without an app update.

**Why:** Key security and model freedom. Accepted: ~5% routing fee; provider-
specific prompt caching is weaker through a router.

## 4. Transcripts transit, never persist

**Decision:** Full transcripts live on the device. Opt-in E2EE backup (user-held
key; lose the key, lose the backup — stated plainly). Opt-in owner-initiated
sharing of a full transcript. Servers process conversation content in transit and
never store it readable.

**Why:** Every chat message already passes through our relay, so "we never see" was
never available; the honest promise is **"we process, we never keep."** We never
become the company holding everyone's raw relationship secrets at rest.

## 5. Coach memory: distilled docs, built server-side

**Decision:** The personal coach doc is distilled from full transcripts after
sessions — server-side, in background jobs — stored with the account, private to
its owner. Deeper re-analysis later is possible because the device (and backup)
still hold transcripts and can re-send them transit-only.

**Why:** Cross-device continuity; a lost phone never erases the coach's memory;
full fidelity at distill time; cheap sessions. The predecessor's resumable ChatGPT
map-reduce existed only because of its no-server-inference rule — retired here.

## 6. Relationship doc: send–build–purge–deliver; shared ingredients by default

**Decision:** With consent, each phone sends material; the server builds with
backend AI, purges inputs immediately, delivers a copy to both. Ingredients default
to already-shared artifacts only; each partner may independently and reversibly opt
in to include their own private material; output is relationship-framed and never
quotes or attributes one side.

**Why:** The plumbing (purge) protects custody; the recipe (ingredients) protects
against private venting echoing into a doc the partner reads.

## 7. Metered freemium + native IAP

**Decision:** N free coaching sessions per person per month (per person, not per
couple) with a quiet per-session cap; subscription removes the meter; payments via
native IAP through RevenueCat on both stores. Exact numbers are launch-tuning.

**Why:** We pay for inference, so usage must be bounded; sessions are the unit
users understand; the store fee is the price of frictionless checkout.

## 8. App stack: React Native + Expo

**Decision:** One TypeScript codebase for iOS + Android. Voice input via platform
dictation first; dedicated transcription later if needed.

**Why:** Fastest path with existing team skills; native-feeling product without two
codebases.

## 9. The predecessor (PairGPT) is frozen, not killed

**Decision:** PairGPT keeps running with security/maintenance fixes only. A future
ChatGPT surface, if any, is a thin client of *this* product's backend — a feature,
never a second product.

**Why:** A small team cannot grow two products; freezing preserves a working bridge
while this product proves itself.

## 10. One-time import; two keys for the shared record

**Decision:** A user's private material imports on their sole say-so when they
join. The shared record (approved summaries, situations, the resolved list, the
relationship doc) imports only when both partners have joined and both consent.

**Why:** Partner approvals were scoped to the predecessor; the two-key rule is the
product's own pattern applied once more on the way out.

## 11. New home, stolen blueprints

**Decision:** Fresh repo (not a fork), fresh database and servers. Copy the proven
patterns — RLS as the gate, relationship scoping, two-party handshakes, RPC-only
writes, portability guardrails — but design tables natively around app objects.
Monorepo rooms: `app/` (Expo), `backend/` (relay, meter, vault, importer), `db/`,
`docs/`. Same database technology (Postgres/Supabase) under the same portability
rules. **Phone-only v1**: pairing, staging, and resolving live in the app; the only
website is marketing. What to lift and from where: `docs/reference/BLUEPRINTS.md`.

**Why:** The predecessor's *shape* is wrong for this product, but its trust rules
are the crown jewels and product-agnostic. Steal the jewels, leave the furniture.

## 12. New brand, no "GPT" in the name

**Decision:** The product gets its own name (codename `couples-coach-app` until
chosen); repo renamed at naming time.

**Why:** App-store policy and trademark hygiene, and honesty — the AI inside isn't
necessarily GPT. The old name advertised the thing we decoupled from.
