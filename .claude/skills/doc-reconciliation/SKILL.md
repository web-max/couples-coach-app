---
name: doc-reconciliation
description: Use whenever you add or change a feature or behavior in PairGPT — both BEFORE implementing and BEFORE finishing — to check the change against the canonical docs (SPEC.md, KEY-DECISIONS.md, docs/reference/*), surface any code-vs-spec divergence, and reconcile the specific docs the change touches. Also use before asking the user a design / product / library / infra question (the docs usually already answer it), and whenever asked to "reconcile docs", "check the spec", "update the decisions", or "does this match the spec". It routes you to only the docs a change actually affects, so attention stays proportionate — not a blanket scan.
---

# Doc Reconciliation

## Why this exists

PairGPT's canonical docs are the source of truth, and they only stay true if attention is paid at the right moments. Two failure modes this prevents: **code drifting ahead of the docs silently** (so the spec slowly becomes fiction), and **asking the user a question the docs already answered** (wasting their time and re-deciding settled calls).

The trick is *proportionality*. Re-reading every doc on every change would be noise — and noise trains you to ignore it. So: a cheap glance at the two intent docs whenever you do real feature work, targeted reconciliation only where a change actually lands, extra weight on security when the change touches it, and nothing at all for trivial edits.

## When to use / when to skip

**Use it** when:
- You're about to build or change a feature or behavior — check intent first.
- You just finished one — reconcile the docs it touched.
- You're about to ask the user a design / product / library / infra decision — the docs usually already answer it.
- You're explicitly asked to reconcile docs, "check the spec," or capture a decision.

**Skip it** for trivial edits — typo fixes, internal refactors, bug fixes that don't change a contract or behavior. Use judgment; the goal is signal, not ceremony.

## The canonical docs — what each owns

| Doc | Owns |
|---|---|
| `SPEC.md` | Product intent / soul: the one-sentence, "What it is / is NOT", core principles, the security *why* (threat model). |
| `KEY-DECISIONS.md` | Settled architectural/product decisions and their rationale. |
| `docs/reference/ARCHITECTURE.md` | Code layout, route/component boundaries, the "RLS is the gate / no public per-couple page" rules. |
| `docs/reference/SERVER-DESIGN.md` | DB schema, MCP tool contracts + count, the hardcoded prompts. |
| `docs/reference/SECURITY.md` | Security posture, threat model, current findings & known gaps. |
| `docs/checklists/PRE-LAUNCH.md` | QA test rows and launch gates. |
| `README.md` | Orientation: layout, what each piece does. |
| `db/types.ts` | Hand-maintained types mirroring the schema. |

## Before you build — check the change against intent

Check the proposed change against `SPEC.md` (the one-sentence, "What it is / is NOT", core principles) and `KEY-DECISIONS.md`, plus the *principle* parts of `SECURITY.md` (e.g. "no `anon` grants," "the approval gate is the trust model") and `ARCHITECTURE.md` (e.g. "RLS is the gate," "no public per-couple page").

If the change diverges from the spec, **surface it before coding — don't silently follow the code. SPEC wins.** And before asking the user a design/product/infra question, look here first: a settled answer is usually already written (e.g. "basic abuse limits ship at launch," portability off Supabase, storage-not-inference).

## Reconcile after — the router (open only what you touched)

Most changes hit one or two rows. Open those; ignore the rest.

| Change | Reconcile |
|---|---|
| New / changed table or column | `SERVER-DESIGN.md` §3 + `db/types.ts` + (RLS) `SECURITY.md` |
| New / removed MCP tool | `SERVER-DESIGN.md` §4 (contract + tool count) + §9 |
| New / changed hardcoded prompt | `SERVER-DESIGN.md` §5 |
| New route, public surface, or `anon` access | `ARCHITECTURE.md` + `SECURITY.md` + `SPEC.md` threat model |
| New product intent or principle | `SPEC.md` + `KEY-DECISIONS.md` |
| New user-facing flow | `PRE-LAUNCH.md` test rows + `README.md` |

**`SECURITY.md` is high-weight.** Whenever a change touches auth, data exposure, RLS, or a public/anon surface, treat the security pass as a priority — a trust breach is brand-ending for this product (see `SPEC.md` security section), not a box to tick. `README.md` / `PRE-LAUNCH.md` are lighter housekeeping.

## Capture decisions back

When a decision genuinely wasn't covered, you had to ask the user, and they decided — close the loop so it's never re-asked. Propose a **concise, principle-level** edit to the *right* doc:
- product intent → `SPEC.md`
- settled architecture/decision → `KEY-DECISIONS.md`
- technical truth (schema/tool/route) → the matching `docs/reference/*`

Record the durable **principle and its *why*, at the doc's existing altitude** — never a granular or one-off technical call (a specific threshold, a library choice, an implementation detail). Those belong in code or a design doc, not in `SPEC.md`. **Suggest the edit for approval; don't apply it silently.**

## Edit authority

Surface divergence and *propose* the doc edits. *Make* the edits when the user adopts the change or reconciling is the explicit task. **Never silently rewrite a canonical doc to match code** — if code and `SPEC.md` disagree, that's a conversation, not a quiet overwrite.

## Quick checklist

- [ ] Change checked against `SPEC.md` + `KEY-DECISIONS.md` (and any relevant `SECURITY.md` / `ARCHITECTURE.md` principle)?
- [ ] Divergence surfaced *before* coding (not silently followed)?
- [ ] About to ask the user something the docs already answer? Checked first?
- [ ] After it lands: each doc the change *touched* reconciled (use the router)?
- [ ] Auth / data-exposure / public surface touched? `SECURITY.md` reviewed as a priority?
- [ ] New decision from a user Q&A captured back at principle altitude, proposed for approval?
