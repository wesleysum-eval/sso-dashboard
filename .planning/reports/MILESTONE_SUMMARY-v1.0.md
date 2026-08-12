# Milestone v1.0 — Project Summary

**Generated:** 2026-08-12
**Purpose:** Team onboarding and project review
**Status:** In progress — Phase 1 complete, Phase 2 code-complete (1 human checkpoint pending), Phase 3 code-complete for Plan 1 (1 human checkpoint pending) + Plan 2 fully planned (not executed), Phase 4 fully planned (not executed)

---

## 1. Project Overview

**Enterprise SSO Dashboard Builder** is an EdgeOne Makers app that lets enterprise customers log in via their own SSO (enterprise IdP) and generate read-only reporting dashboards by prompting an agent — similar to how Workbuddy generates results from an uploaded CSV/Excel, except here the "data source" is the customer's own EdgeOne account data (CDN traffic, security events) instead of an uploaded file.

**Core value:** Enterprise customers can self-serve custom reporting on their own EdgeOne data without filing a support/sales request — via a prompt-driven agent, gated behind their enterprise SSO, with data strictly isolated to their own account.

**Flow:** user picks a data source → prompts what they want to see → agent builds a saved, shareable dashboard.

**Current state:**
- ✅ Phase 1 (Deployment Foundation) — complete, all 4 success criteria verified live
- 🟡 Phase 2 (SSO Authentication & Tenant Mapping) — both plans code-complete and live-verified for AUTH-01/AUTH-03; AUTH-02 code-complete but full browser round-trip checkpoint (Plan 2 Task 2) still outstanding
- 🟡 Phase 3 (Tenant-Scoped Data Source Selection) — Plan 1 (CDN Traffic tracer) code-complete, blocked on real Tencent Cloud API credentials + a seeded KV record for its live checkpoint; Plan 2 (Security Events + full two-card picker) fully planned, not yet executed
- ⬜ Phase 4 (Prompt-Driven Dashboard Generation & Save) — fully planned (CONTEXT, RESEARCH, PATTERNS, UI-SPEC, VALIDATION, COVERAGE, both PLAN.md files all written); no code execution started. LLM provider resolved: EdgeOne Makers built-in AI Gateway (`@makers/deepseek-v4-flash`).

---

## 2. Architecture & Technical Decisions

- **Decision:** Deploy on EdgeOne Pages (static) + EdgeOne Edge Functions (API), no frontend framework
  - **Why:** Keeps the whole app within the EdgeOne edge ecosystem, showcases the platform; app is small enough that plain HTML/JS suffices
  - **Phase:** 1

- **Decision:** GitHub-connected deploy is canonical (not CLI `edgeone makers deploy`)
  - **Why:** The user deployed manually via GitHub integration; this became the live path. Critical platform quirk discovered: GitHub-connected and CLI-linked deploys are **separate project identities** on EdgeOne Makers — CLI env-var/deploy commands only reach the CLI-linked project, never the GitHub-connected one. Every phase since has had to explicitly target the Console UI (not CLI) for env vars.
  - **Phase:** 1

- **Decision:** Reused an existing KV namespace (`ER_7`/`ns-izJIpHTo645c`) instead of creating a new one
  - **Why:** Account's KV namespace-creation quota was exhausted; binding variable name (`my_kv`) is independent of namespace identity, so reuse was safe
  - **Phase:** 1

- **Decision:** OIDC only for v1 (SAML explicitly excluded)
  - **Why:** Standards-compliant, generic OIDC client (via discovery URL + per-customer client ID/secret) covers any IdP without vendor-specific code; SAML deferred as a possible v2+ addition
  - **Phase:** 2

- **Decision:** Tenant resolution via an IdP-issued `tenant_id` custom claim, trusted directly and read exclusively from `tokens.claims()` post-signature-verification
  - **Why:** Server-side-only mapping; no client-supplied query param/header/body value is ever read for this purpose — this is the project's single most important security control (cross-tenant leakage is PROJECT.md's stated top risk). Extended in Phase 3 (D-02) and Phase 4 (D-02/D-03) as the same one-way invariant.
  - **Phase:** 2 (extended in Phase 3, Phase 4)

- **Decision:** JWT-in-httpOnly-cookie sessions (no server-side session store)
  - **Why:** Avoids a KV dependency for sessions; trade-off is no server-side revocation before natural (12h) expiry — accepted as a known v1 limitation. Extended in Phase 4 (D-07) for client-side refinement state.
  - **Phase:** 2

- **Decision:** Generic, byte-identical "Access denied" page for every auth failure mode (missing claim, invalid code, state mismatch)
  - **Why:** Prevents information disclosure — no `?reason=` param, no status/timing variance between failure types. This "no-leak convention" is the project's most-repeated pattern, re-applied at every phase.
  - **Phase:** 2 (lineage: Phase 2 access-denied → Phase 3 `{available:false}` → Phase 4 generation/save/retrieve error shapes)

- **Decision:** KV-backed `tenant_id → EdgeOne account` mapping (read-only in Phase 3; population deferred to onboarding)
  - **Why:** Reuses Phase 1's bound KV namespace; no new infra needed to prove the tenant-scoped fetch path
  - **Phase:** 3

- **Decision:** Hand-rolled TC3-HMAC-SHA256 request signing via `crypto.subtle` for the Tencent Cloud `teo` Open API
  - **Why:** No edge-runtime-compatible SDK exists for this API (unlike Phase 2's `openid-client`); primitives (SHA-256, HMAC) are never hand-rolled, only the request-shaping around them. Built and unit-smoke-tested in Plan 03-01 (`edge-functions/lib/teo-signer.js`), reused unchanged by Plan 03-02 and Phase 4's generation pipeline.
  - **Phase:** 3

- **Decision:** "Security Events" (DATA-02) interpreted as DDoS attack data (`DescribeDDoSAttackData`), not broader WAF/bot-management logs
  - **Why:** Most completely documented security-analytics endpoint found in the `teo` API
  - **Phase:** 3

- **Decision:** Constrained generation DSL — fixed 4-widget component vocabulary (`line-chart`, `bar-chart`, `stat-card`, `table`) and closed enum query shape (`metric`/`interval`/`timeRange`), never arbitrary LLM-generated code
  - **Why:** Structurally guarantees GEN-03's "never arbitrary code execution" requirement — LLM output is validated against closed enums server-side and mapped to real API params via a fixed lookup table; LLM strings never reach the outbound `teo` API call directly
  - **Phase:** 4 (planned)

- **Decision:** LLM provider — EdgeOne Makers' built-in AI Gateway (`@makers/deepseek-v4-flash`), called via plain `fetch()`, no SDK
  - **Why:** Platform-native (no external vendor account needed), free tier, OpenAI-compatible REST; continues Phase 3's precedent of avoiding SDKs when edge-runtime compatibility is unconfirmed. JSON-mode is undocumented on this gateway, so the design relies on prompt-engineered JSON-only instructions plus mandatory server-side schema validation as the real safety backstop.
  - **Phase:** 4 (planned, human-resolved 2026-08-12)

- **Decision:** Saved dashboards stored as immutable snapshots in KV (`dashboard:<tenant_id>:<dashboard_id>`), not live-refreshing
  - **Why:** Matches PROJECT.md's "generated once and saved, refresh-on-demand only" constraint; retrieval always re-derives `tenant_id` from `verifySession()`, never trusting a client-supplied tenant segment even with a valid dashboard ID
  - **Phase:** 4 (planned)

---

## 3. Phases Delivered

| Phase | Name | Status | One-Liner |
|-------|------|--------|-----------|
| 1 | EdgeOne Deployment Foundation | ✅ Complete | Static site + Edge Function live on EdgeOne Makers via GitHub-connected deploy; KV write-then-read proven live; secret-readability gap resolved |
| 2 | SSO Authentication & Tenant Mapping | 🟡 Code-complete, 1 checkpoint pending | Full OIDC (PKCE+nonce) login flow wired end-to-end with server-side-only tenant claim resolution, live-verified against a real Auth0 test IdP (AUTH-01/03); session-aware `/api/status` + UI-SPEC implemented; full browser round-trip checkpoint (session persistence, live negative test) not yet run |
| 3 | Tenant-Scoped Data Source Selection | 🟡 Plan 1 code-complete (checkpoint pending); Plan 2 planned, not executed | CDN Traffic Stats tracer (TC3-HMAC-SHA256 signing, KV tenant mapping, session-gated route) built and unit-smoke-tested but not live-verified — blocked on real Tencent Cloud credentials + seeded KV record; Security Events route + complete two-card picker fully planned |
| 4 | Prompt-Driven Dashboard Generation & Save | ⬜ Fully planned, no code execution | Constrained-vocabulary LLM generation pipeline (EdgeOne Makers AI Gateway), save/retrieve via KV, re-prompt refinement — CONTEXT, RESEARCH, PATTERNS, UI-SPEC, VALIDATION, COVERAGE, and both plan files complete; execution not started |

---

## 4. Requirements Coverage

| Requirement | Description | Status |
|-------------|-------------|--------|
| DEPLOY-01 | App deployed live on EdgeOne Pages + Functions, storage/secrets working end-to-end | ✅ Met — verified live (Phase 1) |
| AUTH-01 | User logs in via company SSO | ✅ Met — verified live against real Auth0 test IdP (Phase 2 Plan 1), including two real edge-runtime bugs found and fixed |
| AUTH-02 | Session persists across browser refresh | ⚠️ Code complete (`signSession`/`verifySession`, 12h JWT; session-aware `/api/status`), not yet live-verified via full browser round trip (Phase 2 Plan 2 Task 2 checkpoint pending) |
| AUTH-03 | SSO identity resolves server-side to exactly one EdgeOne account; client input cannot override | ✅ Met — verified live, including negative test (spoofed `tenant_id` query param has zero effect) |
| DATA-01 | User can select CDN Traffic Stats | ⚠️ Code-complete (Phase 3 Plan 1), not live-verified — Task 2 checkpoint requires real Tencent Cloud credentials, a real Zone ID, and a seeded KV record |
| DATA-02 | User can select Security Events | ⚠️ Planned (Phase 3 Plan 2, `03-02-PLAN.md` written), not executed — interpreted as DDoS attack data |
| DATA-03 | All data-source queries scoped server-side to the logged-in user's own account | ⚠️ Code-level guarantee implemented and code-reviewed (session-only tenant scoping, no client-supplied override) for CDN Traffic; not yet live-verified with the explicit cross-tenant negative test (planned in Phase 3 Plan 2 Task 2) |
| GEN-01 | Natural-language prompt describing desired dashboard | ⬜ Fully planned, not executed |
| GEN-02 | Agent generates dashboard from prompt, read-only API calls only | ⬜ Fully planned, not executed |
| GEN-03 | Generation constrained to fixed query/component vocabulary | ⬜ Fully planned (DSL designed in `04-CONTEXT.md` D-01/D-02/D-03), not executed |
| GEN-04 | Re-prompt to refine without restarting from data-source selection | ⬜ Fully planned, not executed |
| SAVE-01 | Save a generated dashboard for later retrieval | ⬜ Fully planned, not executed |

**No MILESTONE-AUDIT.md exists yet** — this project is mid-milestone, not yet ready for a completion audit.

---

## 5. Key Decisions Log

| ID | Decision | Phase | Rationale |
|----|----------|-------|-----------|
| — (Ph1) | Deploy via GitHub-connected integration (not CLI) | 1 | Became canonical path when user deployed manually; CLI and GitHub-connect create separate project identities on this platform |
| — (Ph1) | Single combined Edge Function endpoint (`/api/status`) for all four Phase 1 proofs | 1 | Thinnest end-to-end path touching every layer (static → function → env → KV) |
| — (Ph1) | Reused KV namespace `ER_7` instead of creating new | 1 | Namespace-creation quota exhausted; binding name is independent of namespace identity |
| D-01 (Ph2) | OIDC only, SAML excluded | 2 | Standards-based, works with any IdP via discovery; SAML is a parallel addition if ever needed |
| D-02 (Ph2) | Generic/standards-compliant OIDC client, zero vendor branching | 2 | `getOidcConfig(env)` works identically for any IdP exposing a discovery document |
| D-03 (Ph2) | Tenant resolution via IdP-issued `tenant_id` custom claim | 2 | One-way decision — once customers configure this in their IdP, switching mechanisms requires re-onboarding everyone |
| D-05 (Ph2) | Generic, byte-identical access-denied page for every failure mode | 2 | Prevents leaking tenant/config details across any denial path |
| D-06 (Ph2) | JWT-in-httpOnly-cookie sessions, no server-side store | 2 | Avoids KV dependency; known limitation — no server-side revocation before natural expiry |
| D-02 (Ph3) | Tenant scoping extends Phase 2's session-JWT-only precedent | 3 | One-way — the single hard security invariant of the phase |
| D-03 (Ph3) | KV-backed `tenant_id → EdgeOne account` mapping, read-only this phase | 3 | Reuses bound KV namespace; population is a future onboarding-phase concern |
| A3 (Ph3 research) | "Security Events" = DDoS attack data (`DescribeDDoSAttackData`) | 3 | Most completely documented security-analytics endpoint in `teo` API; reversible interpretation |
| D-01 (Ph4) | Fixed 4-widget component vocabulary, no 5th "custom" type | 4 | Structural (not just policy) guarantee against arbitrary code generation |
| D-02 (Ph4) | Closed enum query shape (`metric`/`interval`/`timeRange`), server maps to real API params | 4 | LLM output never reaches the outbound API call as raw strings — this is GEN-03's literal implementation |
| D-04 (Ph4) | LLM provider: EdgeOne Makers built-in AI Gateway, `@makers/deepseek-v4-flash`, plain `fetch()` | 4 | Platform-native, no SDK dependency, no external vendor account; human-resolved 2026-08-12 after being an open question |
| D-05/D-06 (Ph4) | Saved dashboards as immutable KV snapshots, retrieval always re-derives tenant from session | 4 | Matches "generated once, refresh-on-demand" constraint; defense-in-depth beyond ID obscurity |

---

## 6. Tech Debt & Deferred Items

**Open gaps carried forward:**
- Phase 1's env-secret readability gap (D3) was fully resolved during Plan 01-02 — no longer open.
- Phase 1's original `01-VERIFICATION.md` was never completed (`init.progress` reports `verification_status: missing` for Phase 1 despite `implementation_complete: true`) — worth re-running `/gsd-execute-phase 01`'s verify step or generating VERIFICATION.md retroactively before milestone close.
- Phase 2 Plan 2 Task 2 (session-persistence checks + full browser round-trip checkpoint, including the AUTH-03 live negative test) is not yet executed — AUTH-02 is code-complete but not live-verified.
- Phase 3 Plan 1 Task 2 (live checkpoint proving `crypto.subtle` HMAC signing actually works end-to-end against the real `teo` API) is blocked on: real Tencent Cloud API SecretId/SecretKey, a real EdgeOne Zone ID, and a seeded KV tenant-mapping record. DATA-01/DATA-03 are deliberately left uncompleted in REQUIREMENTS.md until this passes.
- Phase 3 Plan 2 (Security Events route + completed two-card picker + full DATA-01/02/03 live verification including the explicit cross-tenant negative test) is fully planned but not executed — depends on Plan 1's checkpoint resolving first (same signing-chain risk applies to both routes).
- Phase 4's full `teo` `MetricNames` allow-list widening (D-02) and the AI Gateway's JSON-mode support are both currently unverified assumptions baked into the plan — flagged in `04-RESEARCH.md`/`COVERAGE.md` as needing empirical confirmation during execution, not blocking issues.

**Platform-specific findings worth knowing (future contributors should read these before touching auth/deploy/data code):**
- EdgeOne's Edge Function runtime does **not** implement `AbortSignal.timeout(ms)` — a guarded polyfill was added in `edge-functions/lib/oidc-config.js`. This polyfill is a **per-module-import side effect, not auto-global** — any new module doing `fetch()` with `AbortSignal.timeout()` (e.g. Phase 4's LLM call) must re-declare the same guarded snippet or import a shared `lib/polyfills.js` (not yet extracted).
- EdgeOne's documented `response.setCookies()` Cookies-API write method is deprecated on the actual runtime — use the `Headers`-based `Set-Cookie` helper in `edge-functions/lib/cookie-header.js` instead. Read-side `new Cookies(request.headers.get('Cookie'))` is unaffected.
- GitHub-connected deploys and CLI (`edgeone makers`) deploys are separate project identities, even for the same repo — env vars set via CLI never reach the GitHub-connected canonical deployment. Always use Console UI → Environment Management for secrets, then trigger a redeploy via `git push`.
- KV namespace-creation quota can be exhausted account-wide — if hit, reuse an existing namespace under a new binding name rather than blocking on it.
- No edge-runtime-compatible SDK exists for the Tencent Cloud `teo` Open API — hand-rolled TC3-HMAC-SHA256 via `crypto.subtle` is the proven pattern (`edge-functions/lib/teo-signer.js`); apply the same SDK-avoidance bias to Phase 4's LLM integration (confirmed: plain REST via `fetch()`, no provider SDK).
- KV limits relevant to Phase 4: 512B max key length, 25MB max value size, 60-second eventual-consistency window across edge nodes — a "save then immediately GET" flow should render from in-memory client state right after save rather than re-fetching.

**Deferred to v2 (documented in REQUIREMENTS.md, not tech debt — explicit scope decisions):**
- Shareable dashboard links, dashboard history (SHARE-01, SHARE-02)
- Explicit logout (AUTH-04)
- Auto-refreshing/live dashboards (LIVE-01)
- DNS analytics, Edge Functions metrics as data sources (DATA-04, DATA-05)
- "Force logout all sessions" / JWT revocation (blocked on the JWT-no-server-store trade-off in D-06)
- SAML support (explicitly excluded from Phase 2, noted as a possible future addition)

**No RETROSPECTIVE.md exists yet** — appropriate for a project still mid-milestone.

---

## 7. Getting Started

- **Live URL:** `https://sso-dashboard-0eso53cx.edgeone.dev/` (see `.planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt` — this file is the source of truth; the URL has changed once already after a redeploy, don't hardcode it elsewhere)
- **Deploy path:** `git push origin main` → GitHub-connected auto-redeploy. Env vars/secrets: EdgeOne Makers Console → Project Settings → Environment Management (Console UI only, CLI does not reach this project identity).
- **Key directories:**
  - `edge-functions/api/` — Edge Function routes (`status.js`, `kv-check.js`, `auth/login.js`, `auth/callback.js`, `data/cdn-traffic.js`)
  - `edge-functions/lib/` — shared helpers (`oidc-config.js`, `session.js`, `cookie-header.js`, `teo-signer.js`, `tenant-mapping.js`)
  - `index.html` / `app.js` — static frontend entry point (no framework)
  - `.planning/` — all GSD planning artifacts (ROADMAP, REQUIREMENTS, per-phase CONTEXT/RESEARCH/PLAN/SUMMARY/VALIDATION)
- **Tests:** No automated test framework in this repo — verification is curl-based integration checks against the live deployed URL, plus human checkpoints for anything requiring real credentials or a full browser round trip. See each phase's `*-VALIDATION.md` for the exact commands.
- **Where to look first:**
  - `.planning/PROJECT.md` — core value, requirements, constraints
  - `.planning/ROADMAP.md` — phase breakdown and success criteria
  - `edge-functions/lib/session.js` — the `verifySession()` contract every protected route (Phase 3+) must import and reuse
  - `edge-functions/lib/teo-signer.js` / `edge-functions/lib/tenant-mapping.js` — the reusable signing + tenant-lookup pair every future `teo` API route (and Phase 4's generation pipeline) calls directly, unchanged
  - `.planning/phases/02-sso-authentication-tenant-mapping/02-01-SUMMARY.md` — documents two real platform-runtime bugs and their fixes; read before writing new Edge Function code that does fetch/cookies
  - `.planning/phases/04-prompt-driven-dashboard-generation-save/04-CONTEXT.md` — the constrained-generation DSL design (D-01/D-02/D-03), the mechanism that makes GEN-03 structurally safe

---

## Stats

- **Timeline:** 2026-08-10 → 2026-08-12 (3 days, ongoing)
- **Phases:** 1 complete / 4 total (Phase 1 functionally complete but missing formal VERIFICATION.md sign-off; Phase 2 code-complete pending 1 checkpoint; Phase 3 Plan 1 code-complete pending 1 checkpoint, Plan 2 planned only; Phase 4 fully planned, not started)
- **Commits:** 48 total in repo
- **Files changed:** 60 files (+7,809 / -1 lines) since first commit
- **Contributors:** wesleysum
