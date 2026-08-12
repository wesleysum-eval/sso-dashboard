# Milestone v1.0 — Project Summary

**Generated:** 2026-08-12
**Purpose:** Team onboarding and project review
**Status:** In progress — Phase 1 complete, Phase 2 in progress (1/2 plans done, live-verified), Phase 3 planned (not yet executed), Phase 4 not started

---

## 1. Project Overview

**Enterprise SSO Dashboard Builder** is an EdgeOne Makers app that lets enterprise customers log in via their own SSO (enterprise IdP) and generate read-only reporting dashboards by prompting an agent — similar to how Workbuddy generates results from an uploaded CSV/Excel, except here the "data source" is the customer's own EdgeOne account data (CDN traffic, security events) instead of an uploaded file.

**Core value:** Enterprise customers can self-serve custom reporting on their own EdgeOne data without filing a support/sales request — via a prompt-driven agent, gated behind their enterprise SSO, with data strictly isolated to their own account.

**Flow:** user picks a data source → prompts what they want to see → agent builds a saved, shareable dashboard.

**Current state:**
- ✅ Phase 1 (Deployment Foundation) — complete, all 4 success criteria verified live
- 🟡 Phase 2 (SSO Authentication & Tenant Mapping) — Plan 1 (OIDC tracer) complete and live-verified; Plan 2 (session persistence + full browser checkpoint) not yet executed
- 🟡 Phase 3 (Tenant-Scoped Data Source Selection) — fully planned and validated, execution blocked on real Tencent Cloud API credentials + Phase 2 completion
- ⬜ Phase 4 (Prompt-Driven Dashboard Generation & Save) — not started

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
  - **Why:** Server-side-only mapping; no client-supplied query param/header/body value is ever read for this purpose — this is the project's single most important security control (cross-tenant leakage is PROJECT.md's stated top risk)
  - **Phase:** 2 (extended into Phase 3's data-source scoping)

- **Decision:** JWT-in-httpOnly-cookie sessions (no server-side session store)
  - **Why:** Avoids a KV dependency for sessions; trade-off is no server-side revocation before natural (12h) expiry — accepted as a known v1 limitation
  - **Phase:** 2

- **Decision:** Generic, byte-identical "Access denied" page for every auth failure mode (missing claim, invalid code, state mismatch)
  - **Why:** Prevents information disclosure — no `?reason=` param, no status/timing variance between failure types
  - **Phase:** 2

- **Decision:** KV-backed `tenant_id → EdgeOne account` mapping (read-only this phase; population deferred to onboarding)
  - **Why:** Reuses Phase 1's bound KV namespace; no new infra needed to prove the tenant-scoped fetch path
  - **Phase:** 3 (planned)

- **Decision:** Hand-rolled TC3-HMAC-SHA256 request signing via `crypto.subtle` for the Tencent Cloud `teo` Open API
  - **Why:** No edge-runtime-compatible SDK exists for this API (unlike Phase 2's `openid-client`); primitives (SHA-256, HMAC) are never hand-rolled, only the request-shaping around them
  - **Phase:** 3 (planned)

- **Decision:** "Security Events" (DATA-02) interpreted as DDoS attack data (`DescribeDDoSAttackData`), not broader WAF/bot-management logs
  - **Why:** Most completely documented security-analytics endpoint found in the `teo` API; flagged as a same-shaped swap if a different interpretation is wanted later
  - **Phase:** 3 (planned, flagged for user confirmation)

---

## 3. Phases Delivered

| Phase | Name | Status | One-Liner |
|-------|------|--------|-----------|
| 1 | EdgeOne Deployment Foundation | ✅ Complete | Static site + Edge Function live on EdgeOne Makers via GitHub-connected deploy; KV write-then-read proven live; secret-readability gap resolved |
| 2 | SSO Authentication & Tenant Mapping | 🟡 In Progress (Plan 1/2 done) | Full OIDC (PKCE+nonce) login flow wired end-to-end with server-side-only tenant claim resolution, live-verified against a real Auth0 test IdP; session-persistence checks (Plan 2) not yet executed |
| 3 | Tenant-Scoped Data Source Selection | 🟡 Planned, not executed | Two data-source picker (CDN Traffic Stats, Security Events) scoped exclusively via session-verified tenant identity, calling the real Tencent Cloud `teo` Open API; blocked on real API credentials + Phase 2 completion |
| 4 | Prompt-Driven Dashboard Generation & Save | ⬜ Not started | User prompts an agent to generate a constrained, read-only dashboard from their selected data source, refine it, and save it |

---

## 4. Requirements Coverage

| Requirement | Description | Status |
|-------------|-------------|--------|
| DEPLOY-01 | App deployed live on EdgeOne Pages + Functions, storage/secrets working end-to-end | ✅ Met — verified live (Phase 1) |
| AUTH-01 | User logs in via company SSO | ✅ Met — verified live against real Auth0 test IdP (Phase 2 Plan 1) |
| AUTH-02 | Session persists across browser refresh | ⚠️ Code complete (`signSession`/`verifySession`, 12h JWT), not yet live-verified via full browser round trip (Phase 2 Plan 2 pending) |
| AUTH-03 | SSO identity resolves server-side to exactly one EdgeOne account; client input cannot override | ✅ Met — verified live, including negative test (spoofed `tenant_id` query param has zero effect) |
| DATA-01 | User can select CDN Traffic Stats | ⚠️ Planned, not executed |
| DATA-02 | User can select Security Events | ⚠️ Planned, not executed (interpreted as DDoS attack data — flagged for confirmation) |
| DATA-03 | All data-source queries scoped server-side to the logged-in user's own account | ⚠️ Planned with concrete enforcement design (session-only tenant scoping, no client-supplied override), not yet executed or live-verified |
| GEN-01 | Natural-language prompt describing desired dashboard | ⬜ Not started |
| GEN-02 | Agent generates dashboard from prompt, read-only API calls only | ⬜ Not started |
| GEN-03 | Generation constrained to fixed query/component vocabulary | ⬜ Not started |
| GEN-04 | Re-prompt to refine without restarting from data-source selection | ⬜ Not started |
| SAVE-01 | Save a generated dashboard for later retrieval | ⬜ Not started |

**No MILESTONE-AUDIT.md exists yet** — this project is mid-milestone, not yet ready for a completion audit.

---

## 5. Key Decisions Log

| ID | Decision | Phase | Rationale |
|----|----------|-------|-----------|
| D-01 (Ph1) | Deploy via GitHub-connected integration (not CLI) | 1 | Became canonical path when user deployed manually; CLI and GitHub-connect create separate project identities on this platform |
| D-02 (Ph1) | Single combined Edge Function endpoint (`/api/status`) for all four Phase 1 proofs | 1 | Thinnest end-to-end path touching every layer (static → function → env → KV) |
| — (Ph1) | Reused KV namespace `ER_7` instead of creating new | 1 | Namespace-creation quota exhausted; binding name is independent of namespace identity |
| D-01 (Ph2) | OIDC only, SAML excluded | 2 | Standards-based, works with any IdP via discovery; SAML is a parallel addition if ever needed |
| D-02 (Ph2) | Generic/standards-compliant OIDC client, zero vendor branching | 2 | `getOidcConfig(env)` works identically for any IdP exposing a discovery document |
| D-03 (Ph2) | Tenant resolution via IdP-issued `tenant_id` custom claim | 2 | One-way decision — once customers configure this in their IdP, switching mechanisms requires re-onboarding everyone |
| D-05 (Ph2) | Generic, byte-identical access-denied page for every failure mode | 2 | Prevents leaking tenant/config details across any denial path |
| D-06 (Ph2) | JWT-in-httpOnly-cookie sessions, no server-side store | 2 | Avoids KV dependency; known limitation — no server-side revocation before natural expiry |
| D-02 (Ph3) | Tenant scoping extends Phase 2's session-JWT-only precedent | 3 (planned) | One-way — the single hard security invariant of the phase |
| D-03 (Ph3) | KV-backed `tenant_id → EdgeOne account` mapping, read-only this phase | 3 (planned) | Reuses bound KV namespace; population is a future onboarding-phase concern |
| A3 (Ph3 research) | "Security Events" = DDoS attack data (`DescribeDDoSAttackData`) | 3 (planned) | Most completely documented security-analytics endpoint in `teo` API; reversible interpretation |

---

## 6. Tech Debt & Deferred Items

**Open gaps carried forward:**
- Phase 1's env-secret readability gap (D3) was fully resolved during Plan 01-02 — no longer open.
- Phase 2 Plan 2 (session-persistence checks + full browser round-trip checkpoint) is not yet executed — AUTH-02 is code-complete but not live-verified.
- Phase 3 execution is blocked on: real Tencent Cloud API SecretId/SecretKey, a real EdgeOne Zone ID, a seeded KV tenant-mapping record, and Phase 2's live completion (session cookie dependency).
- Phase 1's original `01-VERIFICATION.md` was never completed (`init.progress` reports `verification_status: missing` for Phase 1 despite `implementation_complete: true`) — worth re-running `/gsd-execute-phase 01`'s verify step or generating VERIFICATION.md retroactively before milestone close.

**Platform-specific findings worth knowing (future contributors should read these before touching auth/deploy code):**
- EdgeOne's Edge Function runtime does **not** implement `AbortSignal.timeout(ms)` — a guarded polyfill was added in `edge-functions/lib/oidc-config.js`. Any new code using timeout-based fetch aborts should check for this gap.
- EdgeOne's documented `response.setCookies()` Cookies-API write method is deprecated on the actual runtime — use the `Headers`-based `Set-Cookie` helper in `edge-functions/lib/cookie-header.js` instead. Read-side `new Cookies(request.headers.get('Cookie'))` is unaffected.
- GitHub-connected deploys and CLI (`edgeone makers`) deploys are separate project identities, even for the same repo — env vars set via CLI never reach the GitHub-connected canonical deployment. Always use Console UI → Environment Management for secrets, then trigger a redeploy via `git push`.
- KV namespace-creation quota can be exhausted account-wide — if hit, reuse an existing namespace under a new binding name rather than blocking on it (documented precedent in Phase 1 Plan 02).

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
  - `edge-functions/api/` — Edge Function routes (`status.js`, `kv-check.js`, `auth/login.js`, `auth/callback.js`)
  - `edge-functions/lib/` — shared helpers (`oidc-config.js`, `session.js`, `cookie-header.js`)
  - `index.html` / `app.js` — static frontend entry point (no framework)
  - `.planning/` — all GSD planning artifacts (ROADMAP, REQUIREMENTS, per-phase CONTEXT/RESEARCH/PLAN/SUMMARY/VALIDATION)
- **Tests:** No automated test framework in this repo — verification is curl-based integration checks against the live deployed URL, plus human checkpoints for anything requiring real credentials or a full browser round trip. See each phase's `*-VALIDATION.md` for the exact commands.
- **Where to look first:**
  - `.planning/PROJECT.md` — core value, requirements, constraints
  - `.planning/ROADMAP.md` — phase breakdown and success criteria
  - `edge-functions/lib/session.js` — the `verifySession()` contract every protected route (Phase 3+) must import and reuse
  - `.planning/phases/02-sso-authentication-tenant-mapping/02-01-SUMMARY.md` — documents two real platform-runtime bugs and their fixes; read before writing new Edge Function code that does fetch/cookies

---

## Stats

- **Timeline:** 2026-08-10 → 2026-08-11 (2 days, ongoing)
- **Phases:** 0 complete / 4 total (Phase 1 functionally complete but missing formal VERIFICATION.md sign-off; Phase 2 partially executed; Phase 3 planned only; Phase 4 not started)
- **Commits:** 31 total in repo (27 since project start)
- **Files changed:** 52 files (+5,345 / -1 lines) since first commit
- **Contributors:** wesleysum (plus a parallel teammate session executing Phase 2, per this session's coordination)
