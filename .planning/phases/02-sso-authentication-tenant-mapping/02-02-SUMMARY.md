---
phase: 02-sso-authentication-tenant-mapping
plan: 02
subsystem: auth
tags: [jwt, session, jose, edge-functions, sso]

# Dependency graph
requires:
  - phase: 02-sso-authentication-tenant-mapping (Plan 01)
    provides: verifySession() JWT session helper, OIDC login/callback flow, tenant claim resolution
provides:
  - Session-aware /api/status endpoint reporting authenticated/tenantId via verifySession
  - Login-state UI in app.js (logged-in tenant display vs. "Log in with SSO" link)
affects: [03-* (any future protected route reuses this same /api/status authenticated/tenantId contract)]

# Actuals (#2632)
actuals:
  tokens: 900
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session-aware status endpoint: verifySession() read at the top of status.js, authenticated/tenantId derived exclusively from the verified JWT payload, never from client input"

key-files:
  created: []
  modified:
    - edge-functions/api/status.js
    - app.js
    - index.html
    - access-denied.html

key-decisions:
  - "Implemented 02-UI-SPEC.md's design contract into actual code after discovering it had been written but never built — spec existed as documentation only, index.html/access-denied.html were still Phase 1's bare unstyled HTML."
  - "Superseded the initial shared-styles.css implementation with the user's own hand-built page structure (top nav + tenant badge, dedicated login screen, Phase-3-ready card-grid data-source picker), implemented as per-page inline <style> blocks against the same 02-UI-SPEC.md tokens rather than a shared stylesheet. styles.css removed as orphaned once nothing referenced it."

patterns-established:
  - "app.js branches on data.authenticated to render logged-in (tenant display) vs logged-out (login link) state — reusable by Phase 3's picker UI gating"
  - "02-UI-SPEC.md design tokens (system font stack, spacing scale, EdgeOne blue #0052D9 accent, card layout) carried forward as CSS custom properties inside each page's inline <style> block — no shared stylesheet; index.html and access-denied.html each define their own :root block with matching values"

requirements-completed: [AUTH-02, AUTH-03]

coverage:
  - id: D1
    description: "GET /api/status returns authenticated (boolean) and tenantId fields, verified via verifySession() reading the session cookie; false/null when no cookie present"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "curl -sf https://sso-dashboard-0eso53cx.edgeone.dev/api/status -> {\"hasConfig\":true,\"kvBound\":true,\"authenticated\":false,\"tenantId\":null,\"ts\":...}"
        status: pass
    human_judgment: false
  - id: D2
    description: "Response never leaks SESSION_SIGNING_KEY or a raw JWT string; existing Phase 1 fields (hasConfig, kvBound, ts) unchanged"
    requirement: "AUTH-03"
    verification:
      - kind: manual_procedural
        ref: "code review of edge-functions/api/status.js: body object only ever assigns hasConfig, kvBound, authenticated, tenantId, ts — no signing key or JWT string reference anywhere in the file"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full live browser round-trip — login redirects to real IdP and returns logged-in (AUTH-01), session persists across a browser refresh with no re-auth (AUTH-02), and a client-supplied tenant_id query param has zero effect on the resolved tenant (AUTH-03)"
    requirement: "AUTH-01, AUTH-02, AUTH-03"
    verification: []
    human_judgment: true
    rationale: "Requires a real browser session against the live test IdP (Auth0) and a human-initiated refresh — not scriptable via curl alone. This is Task 2's blocking checkpoint; not yet run this session."
---

# Phase 2 Plan 2: Session-Aware /api/status and Login-State UI Summary

**`/api/status` now reports real session state (authenticated/tenantId) via verifySession(), and the UI design contract (system font, EdgeOne blue, card layout) is now implemented directly in index.html/access-denied.html as inline styles — first via a shared styles.css pass, then superseded by the user's own richer page structure (top nav, login screen, card-grid data-source picker) built against the same design tokens.**

## Performance

- **Duration:** ~5 min (Task 1 code) + a follow-up session implementing the UI-SPEC, diagnosing an Auth0 tenant-claim gap, and reconciling a user-driven UI restructure; Task 2's full checkpoint approval still pending
- **Completed:** 2026-08-11T18:07:08-07:00 (Task 1 commit); styles.css/copy follow-up + UI restructure reconciliation 2026-08-12
- **Tasks:** 1 of 2 (Task 1 complete; Task 2 human-verify checkpoint outstanding)
- **Files modified:** 4 (2 from Task 1, 2 more from the UI-SPEC follow-up; styles.css was added then removed once superseded)

## Accomplishments
- `edge-functions/api/status.js` imports `verifySession` from `../lib/session.js`, reads the `session` cookie via the `Cookies` API, and adds `authenticated`/`tenantId` fields to the existing JSON response — additive, no regression to Phase 1's `hasConfig`/`kvBound`/`ts` fields.
- Live-verified via curl: `GET /api/status` with no cookie returns `authenticated: false, tenantId: null` — confirmed against the canonical deployed URL.
- **UI-SPEC implementation gap closed:** `02-UI-SPEC.md`'s design contract (system font stack, spacing scale, EdgeOne blue `#0052D9` accent, card layout, exact copywriting contract) had been written during Phase 2 planning but never actually built into code — `index.html`/`access-denied.html` were still Phase 1's bare unstyled HTML. First pass added a shared `styles.css`; the user then independently rebuilt the page structure (top `<nav>` with tenant badge, dedicated login screen, `.card-grid`/`.source-card` data-source picker anticipating Phase 3) as per-page inline `<style>` blocks. Reconciled by keeping the user's structure and swapping its color tokens back to the spec's EdgeOne-blue palette, restoring the spec's exact "Welcome"/access-denied copy, and removing the now-orphaned `styles.css`. Added a dedicated `#tenant-badge-value` span with `title` attribute for the spec's long-text ellipsis backstop.
- **Diagnosed and fixed a live Auth0 configuration gap** (not a code defect): the test user was a Google social-login identity with no `user_metadata`, so the Post-Login Action's `event.user.user_metadata.tenant_id` read resolved to nothing, sending every login through the generic access-denied path even though the app's own OIDC/session code was working correctly. Fixed by updating the Action to fall back to `event.user.idp_tenant_domain` (already populated for this social-login user) — see `02-RESEARCH.md` Pitfall 6 for the documented gotcha.
- **Added live callback troubleshooting after EdgeOne logs were unavailable:** `AUTH_DEBUG_CALLBACK=true` temporarily surfaces non-token denial reasons on `/access-denied.html`; the callback now reads the tenant from `claims[env.OIDC_TENANT_CLAIM || 'tenant_id']` so Auth0 namespaced claims can be configured without code changes. A live `authorization_code_grant_failed` showed EdgeOne rejecting `URLSearchParams` token request bodies from `openid-client`/`oauth4webapi`; fixed via an OIDC custom fetch wrapper in `edge-functions/lib/oidc-config.js`.

## Task Commits

1. **Task 1: Session-aware /api/status and login-state UI** - `9acadd2` (feat)
2. **Follow-up: 02-UI-SPEC.md implementation + UI restructure reconciliation** - see commit history for `styles.css`/`index.html`/`app.js`/`access-denied.html`

_Task 2 (live browser checkpoint) has not yet been fully approved this session — see Next Phase Readiness._

## Files Created/Modified
- `edge-functions/api/status.js` - Adds `authenticated`/`tenantId` fields via `verifySession()`, never echoes the raw JWT or signing key
- `app.js` - Renders logged-in (tenant display, tenant-badge) vs. logged-out (SSO login link) state from `/api/status`, plus the Phase-3 CDN Traffic Stats picker card wiring
- `index.html` - Top nav + login-screen + card-grid data-source-picker structure, inline `<style>` block using 02-UI-SPEC.md's design tokens (EdgeOne blue, spacing scale, system font)
- `access-denied.html` - Card layout with inline `<style>` block matching the same tokens, exact D-05-compliant copy from the spec
- `styles.css` - Added during the first UI-SPEC pass, then removed once the user's page-structure rebuild made it orphaned (nothing referenced it)

## Decisions Made
- Implemented the UI-SPEC's design contract into actual shipped code rather than leaving it as documentation-only — the spec existed but had never been built, which is what the user reported ("I don't see any CSS design on the webpage yet").
- When the user independently rebuilt `index.html`/`app.js`/`access-denied.html` into a richer structure (nav, login screen, card-grid picker) with different inline colors, chose to **merge** rather than pick one side: kept the user's structure/layout in full, but realigned its color tokens and copy back to `02-UI-SPEC.md` so the design contract stays authoritative for tokens while the user's structural work stands.
- Auth0 Action fix: use `event.user.idp_tenant_domain` as a fallback tenant source for social-login users rather than requiring every test user to have `user_metadata.tenant_id` manually seeded — pragmatic for this project's Google Workspace-based test identity, documented as a live gotcha (not a locked architectural decision) since production customers using database-connection IdPs won't hit this path.

## Deviations from Plan

None for Task 1 — executed exactly as written. The UI-SPEC implementation, Auth0 diagnosis, and UI-restructure reconciliation were reactive follow-up work requested directly by the user after this plan's code landed, not part of the original Task 1/Task 2 scope, but directly support closing Task 2's checkpoint.

## Issues Encountered
- **UI-SPEC never implemented:** `02-UI-SPEC.md` was generated during Phase 2's UI-phase step but no execution task in `02-01-PLAN.md`/`02-02-PLAN.md` actually referenced building it into code — it sat as an unactioned design contract. Closed by the styles.css follow-up, then the structure rebuild.
- **Auth0 social-login `user_metadata` gap:** see Accomplishments and `02-RESEARCH.md` Pitfall 6 for the full diagnosis. Root-caused via the user's Auth0 Raw JSON user profile (showed `idp_tenant_domain` populated but no `user_metadata` key at all).
- **EdgeOne `URLSearchParams` fetch body gap:** live callback debug showed Auth0 login succeeded but `authorizationCodeGrant` failed because EdgeOne's fetch runtime rejected the token request body initializer. Resolved by converting OIDC `URLSearchParams` bodies to form-encoded strings in the configured fetch wrapper.
- **Documentation/reality drift:** the user rebuilt the page structure directly in the working tree without flagging it, which was discovered only when preparing to commit documentation that referenced the (by-then-superseded) `styles.css` implementation. Resolved by confirming with the user directly and reconciling docs to the merged outcome.

## User Setup Required

**Task 2 (blocking human-verify checkpoint) still requires the human to:**
1. Confirm the Auth0 Action fix (fallback to `idp_tenant_domain`) is deployed and re-attached in the Login flow, then log out/back in to regenerate the ID token.
2. If using an Auth0 namespaced claim, set `OIDC_TENANT_CLAIM` to the exact emitted ID-token claim key. Keep `AUTH_DEBUG_CALLBACK=true` only while diagnosing failed callback returns.
3. Visit the live URL in a private/incognito browser window.
4. Click "Log in with SSO", authenticate against the test IdP (Auth0), confirm return to `/` shows the styled "Welcome" card with the resolved tenant ID.
5. Refresh the browser tab — confirm session persists with no re-auth prompt (AUTH-02).
6. Attempt `/?tenant_id=some-other-tenant` — confirm the displayed tenant is unchanged (AUTH-03 negative test).
7. Turn `AUTH_DEBUG_CALLBACK=false` after the live callback is verified.
8. (Optional) Test the no-tenant-claim-user path to confirm generic access-denied routing, if a second test user is available.

## Next Phase Readiness

- Task 1 (code + automated verification) is complete and live-verified. UI-SPEC is now actually implemented, not just documented.
- The Auth0 tenant-claim gap that was blocking any successful login has been root-caused and fixed at the Action level — this was blocking Task 2's checkpoint entirely (every login attempt hit access-denied regardless of app-code correctness).
- **Task 2's live browser checkpoint is the one remaining gate for Phase 2 to be marked fully complete.** Until a human runs the walkthrough above and types "approved" (or reports a failing step), AUTH-01/02/03 remain code-complete but not fully phase-verified per ROADMAP's success criteria.
- Phase 3's `cdn-traffic.js`/`security-events.js` routes both depend on `verifySession()` behaving correctly under a real browser session — Task 2's checkpoint is the last real-world proof of that before Phase 3's own checkpoints build on top of it.

---
*Phase: 02-sso-authentication-tenant-mapping*
*Completed: 2026-08-12 (Task 1 + UI-SPEC follow-up); Task 2 checkpoint pending*
