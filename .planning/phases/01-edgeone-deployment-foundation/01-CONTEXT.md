# Phase 1: EdgeOne Deployment Foundation - Context

**Gathered:** 2026-08-11 (planner-authored — `/gsd-discuss-phase` was skipped by user choice)
**Status:** Ready for planning

> **Note:** This CONTEXT.md was NOT produced by a user discussion session. The user
> explicitly opted to skip `/gsd-discuss-phase` for this phase. The decisions below are
> planner-authored engineering choices, grounded entirely in `01-RESEARCH.md` findings,
> recorded here so downstream agents (executor, verifier) have a single source of
> traceability for "why does the plan look like this" — not user preferences. Treat these
> as reasonable defaults, not locked product decisions; they can be revisited without
> re-opening a user conversation.

<domain>
## Phase Boundary

Get a real, minimal app skeleton live on EdgeOne Pages (Makers) + EdgeOne Functions, with
static hosting, one callable Function, secrets/env config, and KV storage all proven
end-to-end against the **live deployed URL** — not local dev. No feature code (auth, data
sources, generation) belongs in this phase; this is purely the platform-primitives proof
that every later phase depends on.

</domain>

<decisions>
## Implementation Decisions

### Deployment path
- **D-01:** Deploy via CLI (`edgeone makers deploy`), not git-based or Direct Upload — this
  repo has no git remote configured (verified `git remote -v` returns empty), and CLI deploy
  is the only path that needs no additional setup while still running a real build step.

### Function shape
- **D-02:** Combine the "hello" / "config-check" / "kv-check" proofs research sketched as
  three separate files into **one** Edge Function endpoint, `edge-functions/api/status.js`
  (`GET` reads config + KV, `POST` writes KV). One endpoint is the thinnest end-to-end path
  that still touches every layer (static → function → env → KV) — fewer deploys, fewer
  live-URL round trips to prove the same four success criteria.

### KV sequencing
- **D-03:** Plan 01's `status.js` guards KV access with `typeof my_kv !== 'undefined'`
  because KV namespace creation + project binding is a **console-only** step (no CLI/API
  command exists per research) that happens in Plan 02, after Plan 01's tracer is already
  live. This is a feature-gap caused by a missing external dependency (human console step),
  not an architectural stub — no restructuring is needed once the namespace is bound; the
  real `my_kv.get`/`my_kv.put` calls are already written, just unreachable until bound.
- **D-04:** The KV key is a **hardcoded literal** (`phase1_check`), never derived from
  client input — this removes the key-injection/charset-validation concern entirely for
  Phase 1 (only the client-supplied *value* needs validation, per research's Security
  Domain V5 note).

### Domain capture
- **D-05:** Don't hardcode an assumed `*.edgeone.app`-style domain anywhere. Capture the
  actual live URL from `edgeone makers deploy` CLI output at deploy time and persist it to
  `.planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt` so later tasks/plans
  (and later phases) can reference the real URL without re-deploying or guessing — per
  research's Open Question 2 / Assumption A2.

### Checkpoints
- **D-06:** Treat the `edgeone` CLI upgrade (`npm install -g edgeone@latest`) as a blocking
  package-legitimacy checkpoint (`checkpoint:human-verify`, `gate="blocking-human"`) even
  though the CLI is already installed and functional locally — per the Package Legitimacy
  Audit's `SUS` verdict (no `repository` field in npm metadata). Confirm at
  `npmjs.com/package/edgeone` before upgrading.
- **D-07:** Treat KV namespace creation + project binding as `checkpoint:human-action` —
  research found no CLI/API command for this; it is console-only (Makers console →
  Storage → KV), so Claude literally cannot automate it.
- **D-08:** Fold the `edgeone login` step (browser-based OAuth, no browser access from the
  executor) into the same first checkpoint as the legitimacy confirmation, to avoid a
  second cold-start checkpoint for a closely related manual prerequisite. Non-interactive
  fallback: an API token via `edgeone makers deploy -t <token>`, if the user prefers not to
  run an interactive browser login.

### Claude's Discretion
- Exact wording/styling of the static skeleton page (`index.html`) — functional minimalism
  is the only requirement (heading + result div + one script tag).
- Whether `edgeone makers init` or manual scaffold is used to create the `edge-functions/`
  directory structure, provided the resulting layout matches research's Recommended
  Project Structure.
- Exact env var value used for `PLACEHOLDER_OIDC_CLIENT_ID` (any non-empty placeholder is
  sufficient to prove criterion 3 — the real OIDC client ID is a Phase 2 concern).

</decisions>

<specifics>
## Specific Ideas

No specific product/visual references were discussed — this is an infrastructure proof
phase, not a UI phase. The only "specific idea" driving shape is: prove all four platform
primitives (static hosting, Function, secrets, KV) with the fewest possible files/deploys/
checkpoints, verified against the real live URL each time.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Platform mechanics
- `.planning/phases/01-edgeone-deployment-foundation/01-RESEARCH.md` — full EdgeOne Makers
  platform research: Edge vs Cloud Functions split, KV global-binding pattern, CLI command
  reference, deployment path tradeoffs, pitfalls, security domain, package legitimacy audit.
  This is the primary technical grounding for every task in this phase's plans.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — DEPLOY-01 full requirement text.
- `.planning/ROADMAP.md` — Phase 1 goal and the four success criteria this plan set must
  satisfy.

No other external specs, ADRs, or design docs exist for this project yet (Phase 1 of a new
project) — requirements are fully captured in RESEARCH.md + ROADMAP.md + the decisions
above.

</canonical_refs>

<code_context>
## Existing Code Insights

This is Phase 1 of a brand-new project — the repository currently contains only
`.planning/` documentation, no application code, no `package.json`, no existing
conventions to follow. Nothing to reuse; every file in this phase's plans is net-new.

</code_context>

<deferred>
## Deferred Ideas

- Frontend framework (React/Vite/Next.js) — explicitly deferred by research ("optional
  polish for later phases, not a Phase 1 requirement"). Reconsider only if Phase 2+ needs it.
- Git-based auto-deploy — viable later if CI/CD becomes a requirement, but adds setup
  (create remote, push, link Makers project) not needed to satisfy Phase 1.
- Cloud Functions (Node/Python/Go runtime) — not needed; Phase 1's only Function need (KV
  access) is Edge-Functions-only by platform design.
- Separate `hello.js` / `config-check.js` / `kv-check.js` files as research initially
  sketched — superseded by D-02 (single combined endpoint).

</deferred>

---

*Phase: 01-edgeone-deployment-foundation*
*Context gathered: 2026-08-11 (planner-authored, discuss-phase skipped)*
