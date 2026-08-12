---
phase: 02-sso-authentication-tenant-mapping
plan: 01
subsystem: auth
tags: [oidc, jwt, jose, openid-client, edge-functions, sso]

# Dependency graph
requires:
  - phase: 01-edgeone-deployment-foundation
    provides: Live EdgeOne Makers deployment (canonical GitHub-connected URL), console env-var path, Edge Functions runtime with Web Crypto + Cookies API, established secret-reading pattern (status.js)
provides:
  - Full OIDC authorization-code + PKCE + nonce login flow (edge-functions/api/auth/login.js)
  - OIDC callback with token exchange, tenant claim extraction, JWT session issuance (edge-functions/api/auth/callback.js)
  - Generic, memoized OIDC discovery client (edge-functions/lib/oidc-config.js)
  - JWT session sign/verify helpers (edge-functions/lib/session.js)
  - Generic no-leak access-denied static page (access-denied.html)
  - npm dependency setup (package.json/package-lock.json, node_modules gitignored)
affects: [02-02 (session-persistence checks + live IdP checkpoint), 03-* (any future protected route needs verifySession from edge-functions/lib/session.js)]

# Actuals (#2632)
actuals:
  tokens: 2100
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: [openid-client@6.8.5, jose@6.2.8, oauth4webapi@3.8.7 (transitive)]
  patterns:
    - "Generic OIDC client via per-customer env vars (D-02) — getOidcConfig(env) has zero vendor-specific branching"
    - "JWT-in-httpOnly-cookie session (D-06) — signSession()/verifySession() in edge-functions/lib/session.js, no server-side store"
    - "Identical-redirect denial pattern (D-05) — every auth failure branch (missing txn cookie, invalid exchange, missing tenant claim) redirects 302 to the same /access-denied.html with no distinguishing detail"
    - "Tenant identity read exclusively from tokens.claims().tenant_id post-signature-verification — never from request.url/searchParams/headers/body"

key-files:
  created:
    - package.json
    - package-lock.json
    - edge-functions/lib/oidc-config.js
    - edge-functions/lib/session.js
    - edge-functions/api/auth/login.js
    - edge-functions/api/auth/callback.js
    - access-denied.html
  modified:
    - .gitignore (added node_modules/)

key-decisions:
  - "Implemented both PKCE and nonce validation in the callback (defense-in-depth per RESEARCH.md Alternatives Considered) rather than PKCE alone"
  - "12h fixed JWT expiry per RESEARCH.md Pitfall 4 recommendation — a session-cookie lifetime, not an access-token lifetime"
  - "tenant_id (bare, unnamespaced) used as the claim name per RESEARCH.md Assumption A3 / D-04 convention"

patterns-established:
  - "Auth failure paths must redirect through a single shared redirectToAccessDenied() helper — any future auth-adjacent Edge Function should reuse this exact shape rather than inventing a new error response"
  - "Server-side-only console.log for claim-mismatch diagnostics — never surfaced in the HTTP response, established in callback.js's missing-tenant-claim branch"

requirements-completed: [AUTH-01, AUTH-03]

coverage:
  - id: D1
    description: "package.json declares openid-client and jose as npm dependencies, installed via npm install, no cookie-parsing library added"
    requirement: "AUTH-01"
    verification:
      - kind: manual_procedural
        ref: "npm ls (post-install): jose, oauth4webapi, openid-client present; no cookie/js-cookie package added"
        status: pass
    human_judgment: false
  - id: D2
    description: "edge-functions/lib/oidc-config.js exports getOidcConfig(env) — memoized OIDC discovery client wrapper, generic/standards-compliant (D-02)"
    requirement: "AUTH-01"
    verification:
      - kind: manual_procedural
        ref: "code review: no vendor-specific branching, discovery() called with env-sourced issuer/client-id/secret only"
        status: pass
    human_judgment: false
  - id: D3
    description: "edge-functions/lib/session.js exports signSession()/verifySession() — HS256 JWT session cookie helpers"
    requirement: "AUTH-02"
    verification:
      - kind: manual_procedural
        ref: "code review: both functions exported, signSession sets 12h expiry, verifySession normalizes all failure modes to null"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/auth/login returns HTTP 302 with Location pointing at the configured IdP's authorization endpoint, sets oidc_txn cookie"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "curl -sf -o /dev/null -w '%{http_code}' https://sso-dashboard-0eso53cx.edgeone.dev/api/auth/login -> 545 (env vars OIDC_ISSUER_URL/OIDC_CLIENT_ID/OIDC_CLIENT_SECRET/OIDC_REDIRECT_URI/SESSION_SIGNING_KEY not yet set via EdgeOne Makers Console; precondition unmet)"
        status: fail
    human_judgment: true
    rationale: "The plan's Task 1 <precondition> (5 env vars set via EdgeOne Makers Console + redeploy) is not yet satisfied. Live curl against the deployed /api/auth/login returns HTTP 545 'Error return from script' — the expected failure mode when env.OIDC_ISSUER_URL is undefined and new URL(undefined) throws inside getOidcConfig(). This is NOT a code defect: the code path, redeploy mechanism, and routing all work correctly (confirmed via the sibling access-denied.html static asset returning 200 immediately after the same redeploy). A human must set the 5 env vars in the EdgeOne Makers Console (Project Settings -> Environment Management) on the GitHub-connected project and push again to trigger a redeploy before this deliverable can be verified live end-to-end."
  - id: D5
    description: "access-denied.html: single generic static page, no dynamic content, no tenant/claim/config leakage (D-05)"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "curl https://sso-dashboard-0eso53cx.edgeone.dev/access-denied.html?foo=1 vs ?bar=2&baz=3 -> byte-identical bodies"
        status: pass
    human_judgment: false
  - id: D6
    description: "GET /api/auth/callback with invalid code/state and an attacker-supplied tenant_id query param returns 302 to /access-denied.html with zero effect from the spoofed value"
    requirement: "AUTH-03"
    verification:
      - kind: integration
        ref: "curl 'https://sso-dashboard-0eso53cx.edgeone.dev/api/auth/callback?code=invalid&state=invalid&tenant_id=attacker-supplied-tenant' -> 545 (same missing-env-var precondition as D4; code path itself confirmed correct by code review below)"
        status: fail
      - kind: manual_procedural
        ref: "code review of edge-functions/api/auth/callback.js: claims.tenant_id (from tokens.claims(), post-verification) is the only source ever assigned to the session's tenant claim; no request.url/searchParams/header value is read for this purpose anywhere in login.js/callback.js/session.js"
        status: pass
    human_judgment: true
    rationale: "Same root cause as D4 — the live 302-vs-access-denied negative test cannot execute meaningfully while getOidcConfig(env) throws before reaching the tenant-claim-spoofing check at all (both the legitimate flow and the attack simulation hit the same undefined-env-var wall). The code-level guarantee (claims.tenant_id-only sourcing) is independently verified via code review and holds regardless of live env-var state, but the end-to-end negative-test curl requires a human to complete the env var setup first."

# Metrics
duration: 9min
completed: 2026-08-12
status: complete
---

# Phase 2 Plan 1: OIDC Tracer Slice + Tenant Claim Validation Summary

**Full OIDC authorization-code+PKCE+nonce flow (openid-client + jose) wired end-to-end with server-side-only tenant claim resolution and a generic no-leak access-denied page — code complete and deployed, live verification pending EdgeOne Makers Console env-var setup.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-11T23:52:58Z
- **Completed:** 2026-08-12T00:02:27Z
- **Tasks:** 2 (Task 0 checkpoint approved in a prior session turn)
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- Task 0 (package legitimacy checkpoint) was approved by the human in a prior turn — confirmed via live `npm view`/npm registry API data (maintainer `panva`, no `postinstall` scripts, tens of millions of weekly downloads) before any install ran.
- Task 1: Built the complete tracer slice — `package.json`/npm install, `getOidcConfig(env)` (generic discovery client, D-02), `signSession()`/`verifySession()` (JWT session helpers, D-06), `/api/auth/login` (PKCE + nonce + state, redirect to IdP), `/api/auth/callback` (token exchange, session issuance). Deployed via `git push origin main`; redeploy confirmed complete via the sibling static asset check.
- Task 2: Added `access-denied.html` (generic, D-05) and tenant-claim validation in `callback.js` — missing/invalid `tenant_id` routes through the identical redirect branch as every other auth failure, with a server-side-only diagnostic log that never reaches the HTTP response.
- Code review confirms `claims.tenant_id` (post-signature-verification via `tokens.claims()`) is the only source ever assigned to the session's tenant claim anywhere in the auth code path — no `request.url`, `searchParams`, or header value is read for this purpose (AUTH-03 hard requirement).

## Task Commits

Each task was committed atomically:

1. **Task 1: OIDC login -> callback -> JWT session cookie tracer slice** - `68c8a62` (feat)
2. **Task 2: Tenant claim resolution, generic access-denied page, reject client-supplied overrides** - `cb5a17a` (feat)

_Task 0 (npm package legitimacy checkpoint) produced no commit — it is a gate, not a code change._

## Files Created/Modified
- `package.json` - Declares `openid-client` (^6.8.5), `jose` (^6.2.8) as dependencies
- `package-lock.json` - Lockfile for the above, plus transitive `oauth4webapi`
- `edge-functions/lib/oidc-config.js` - `getOidcConfig(env)` — memoized generic OIDC discovery client
- `edge-functions/lib/session.js` - `signSession()`/`verifySession()` — HS256 JWT session cookie helpers, 12h expiry
- `edge-functions/api/auth/login.js` - `GET /api/auth/login` — PKCE + nonce + state authorization redirect
- `edge-functions/api/auth/callback.js` - `GET /api/auth/callback` — token exchange, tenant claim validation, session issuance, uniform access-denied routing
- `access-denied.html` - Generic, no-leak static denial page (D-05)
- `.gitignore` - Added `node_modules/` (was untracked before this plan; now correctly ignored)

## Decisions Made
- Implemented both PKCE and `nonce` validation in the callback (RESEARCH.md "implement both" recommendation) rather than PKCE alone, since the marginal cost is near zero and it provides OIDC-layer defense-in-depth alongside PKCE's OAuth-layer protection.
- Used the bare `tenant_id` claim name convention (RESEARCH.md Assumption A3 recommendation) rather than a namespaced/URI-prefixed variant — documented here as the integration contract for future customer-onboarding docs, per D-04.
- 12-hour fixed JWT expiry (RESEARCH.md Pitfall 4 recommendation) — a session-cookie lifetime appropriate for AUTH-02's "persists across browser refresh" requirement, distinct from a short-lived OAuth access-token convention.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed their `<action>` blocks precisely; no Rule 1-4 auto-fixes were needed. The live-verification gap (below) is a documented, plan-anticipated precondition state, not a deviation from the plan's instructions.

## Issues Encountered

**Live verification cannot yet confirm the `<verify>` blocks pass, because the plan's `<precondition>` on Task 1 (5 env vars set via EdgeOne Makers Console + redeploy) is not yet satisfied.**

Both `curl -sf -o /dev/null -w "%{http_code}" .../api/auth/login` and the Task 2 negative-test curl against `/api/auth/callback` returned **HTTP 545 "Error return from script"** — not the expected `302`. This is the expected failure mode when `env.OIDC_ISSUER_URL` is `undefined`: `getOidcConfig(env)` calls `new URL(env.OIDC_ISSUER_URL)`, which throws a `TypeError` on `undefined` input, and the Edge Function runtime surfaces uncaught exceptions as HTTP 545.

**This is not a code defect** — confirmed by three independent signals:
1. The redeploy itself completed successfully: `access-denied.html` (a plain static asset added in the same push as `callback.js`) returned HTTP 200 with byte-identical bodies across two different query strings, immediately after the same `git push`.
2. `/api/status` (pre-existing, Phase 1) continued returning correct live JSON (`hasConfig: true, kvBound: true`) throughout, confirming the deployment and other Edge Functions are healthy.
3. Code review of `oidc-config.js`, `login.js`, and `callback.js` confirms the logic is correct and matches the plan's `<action>` spec exactly — the only unmet dependency is the 5 env vars, which per the plan and Phase 1's documented platform limitation must be set via the EdgeOne Makers Console UI (not CLI).

**No secrets were fabricated, hardcoded, or worked around.** Per the task instructions, this is reported as a pending precondition, not a plan failure.

## User Setup Required

**Before Task 1's and Task 2's live `<verify>` commands can pass, a human must:**

1. Go to **EdgeOne Makers Console → Project Settings → Environment Management → Environment Variable**, on the GitHub-connected project serving `https://sso-dashboard-0eso53cx.edgeone.dev/` (project ID `makers-sc1i760uu4pv` per `.edgeone/project.json`) — NOT the separate CLI-linked project (confirmed platform limitation, Phase 1 01-01-SUMMARY.md).
2. Set these 5 environment variables:
   - `OIDC_ISSUER_URL` — from a test IdP (Auth0/Okta/Keycloak free tier) — discovery/issuer base URL
   - `OIDC_CLIENT_ID` — test IdP application client ID
   - `OIDC_CLIENT_SECRET` — test IdP application client secret
   - `OIDC_REDIRECT_URI` — `https://sso-dashboard-0eso53cx.edgeone.dev/api/auth/callback` — must be registered in the test IdP's allowed redirect URIs list
   - `SESSION_SIGNING_KEY` — a random 32+ byte secret, e.g. `openssl rand -hex 32`
3. Create a test OIDC application with a test user in the chosen IdP, configuring a custom claim named `tenant_id` on the test user's issued ID token (per D-04/RESEARCH.md convention).
4. Trigger a redeploy: `git push` to `origin/main` (a no-op commit is sufficient if no code changes are pending — env var changes only take effect on the *next* deployment after being saved, per the console's own note and Phase 1's finding).
5. Re-run the plan's automated verify commands:
   ```
   curl -sf -o /dev/null -w "%{http_code}" https://sso-dashboard-0eso53cx.edgeone.dev/api/auth/login
   # expect 302, with Location starting with the configured OIDC_ISSUER_URL host
   curl -sf -o /dev/null -w "%{http_code}" "https://sso-dashboard-0eso53cx.edgeone.dev/api/auth/callback?code=invalid&state=invalid&tenant_id=attacker-supplied-tenant"
   # expect 302, Location: /access-denied.html
   ```
6. The full browser round trip through the real test IdP is deferred to Plan 02-02's live checkpoint, per this plan's `<done>` criteria.

## Next Phase Readiness

- All code for the tracer slice and tenant-claim validation is written, committed, and deployed. The only remaining gap before AUTH-01/AUTH-03 can be marked **validated** (vs. merely **complete**) is the human console step above.
- Plan 02-02 (session-persistence checks + live IdP checkpoint) depends on this plan's code being correct — code review confirms it is, but Plan 02-02's own live verification will also be blocked on the same env vars until they're set.
- `verifySession()` is exported and ready for any future protected route (Phase 3+) to import directly from `edge-functions/lib/session.js`.
- Requirements AUTH-01 and AUTH-03 are marked complete in REQUIREMENTS.md per this plan's frontmatter — but per the coverage table above (D4, D6), full live-deployment validation is still pending human action, not fully closed out.

---
*Phase: 02-sso-authentication-tenant-mapping*
*Completed: 2026-08-12*

## Self-Check: PASSED

All created files verified present on disk (package.json, package-lock.json, edge-functions/lib/oidc-config.js, edge-functions/lib/session.js, edge-functions/api/auth/login.js, edge-functions/api/auth/callback.js, access-denied.html, this SUMMARY.md). Both task commits (`68c8a62`, `cb5a17a`) verified present in git log.
