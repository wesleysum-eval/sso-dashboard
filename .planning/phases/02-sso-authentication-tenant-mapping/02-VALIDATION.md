---
phase: 02
slug: sso-authentication-tenant-mapping
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-11
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none detected in repo yet (no `pytest.ini`/`jest.config.*`/`vitest.config.*`; `package.json` does not exist as of planning — created in Plan 02-01 Task 1 for `openid-client`/`jose` only, not a test framework) |
| **Config file** | none — this phase is a full-browser OIDC redirect flow, primarily verified via curl (automated) and manual/browser checkpoints (integration), similar to Phase 1 |
| **Quick run command** | `curl -sf -o /dev/null -w "%{http_code}" "$(cat .planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt)api/auth/login"` → expect `302` |
| **Full suite command** | Sequential curl checks (below) + Plan 02-02 Task 2's live browser checkpoint against a real test IdP |
| **Estimated runtime** | ~5 seconds (curl checks) + manual browser walkthrough (untimed, human-paced) |

---

## Sampling Rate

- **After every task commit:** Run the task's own `<automated>` curl command (see Per-Task Verification Map below)
- **After every plan wave:** Run the full suite command (all curl checks) against the live deployed URL
- **Before `/gsd:verify-work`:** All automated curl checks green + Plan 02-02 Task 2 checkpoint approved
- **Max feedback latency:** ~10 seconds per curl-based check (live HTTP round trip)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T0 | 01 | 1 | — | T-02-SC | Human confirms npm package legitimacy (jose, openid-client, oauth4webapi) before install | manual checkpoint | N/A — `gate="blocking-human"`, never auto-approved | N/A | ⬜ pending |
| 02-01-T1 | 01 | 1 | AUTH-01 | T-02-01, T-02-04 | Login redirect targets real IdP; PKCE/state/nonce generated server-side; secrets never echoed | tracer | `curl -sf -o /dev/null -w "%{http_code}" "$DEPLOYED_URL/api/auth/login" \| grep -q 302` | ❌ W0 (package.json, oidc-config.js, session.js, login.js, callback.js all new) | ⬜ pending |
| 02-01-T2 | 01 | 1 | AUTH-03 | T-02-02, T-02-03, T-02-05 | Client-supplied `tenant_id` has zero effect; generic access-denied page, no info leakage | auto | `curl -sf -o /dev/null -w "%{http_code}" "$DEPLOYED_URL/api/auth/callback?code=invalid&state=invalid&tenant_id=attacker-supplied-tenant" \| grep -q 302` | ❌ W0 (access-denied.html new; callback.js modified in T1) | ⬜ pending |
| 02-02-T1 | 02 | 2 | AUTH-02, AUTH-03 | T-02-06, T-02-07, T-02-08, T-02-09 | `/api/status` reports session-verified `authenticated`/`tenantId`; never leaks JWT or signing key; session cookie is httpOnly/Secure/SameSite=Lax at issuance | auto | `curl -sf "$DEPLOYED_URL/api/status" \| grep -q '"authenticated"'` | ✅ (status.js exists from Phase 1, modified here) | ⬜ pending |
| 02-02-T2 | 02 | 2 | AUTH-01, AUTH-02, AUTH-03 | T-02-01 through T-02-09 (full-stack re-verification) | Full live browser round-trip: login→IdP→return logged-in; refresh persists session; client-supplied `tenant_id` has zero effect; (optional) unmapped user hits access-denied | manual checkpoint | N/A — `gate="blocking"`, browser-driven, never auto-approved | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` — does not exist yet; created in Plan 02-01 Task 1 (`npm install openid-client jose`)
- [ ] `edge-functions/lib/oidc-config.js`, `edge-functions/lib/session.js`, `edge-functions/api/auth/login.js`, `edge-functions/api/auth/callback.js`, `access-denied.html` — all new, created across Plan 02-01 Tasks 1–2
- [ ] Test/throwaway OIDC IdP (Auth0/Okta/Keycloak free tier) provisioned with a test user carrying the configured tenant claim (`tenant_id` by default, or `OIDC_TENANT_CLAIM` for namespaced Auth0 custom claims) — declared as `user_setup` in `02-01-PLAN.md`; no automated test of AUTH-01/02/03 is possible without this
- [ ] Five environment variables (`OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `SESSION_SIGNING_KEY`) set via EdgeOne Makers Console on the GitHub-connected canonical project, followed by a `git push` redeploy — per Phase 1's proven console-then-redeploy pattern (01-02-SUMMARY.md)

*Confirmed pattern from Phase 1: env vars set via CLI (`edgeone makers env set`) silently no-op on this Github-connected project — Console UI + redeploy is the only working path.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full browser OIDC round-trip (redirect to real IdP, login, return logged-in) | AUTH-01 | Requires a real browser session and interactive login against a live third-party IdP — not scriptable via curl alone without a headless browser tool this phase doesn't provision | Plan 02-02 Task 2, step 1: visit live URL in private window, click login, authenticate with test IdP, confirm logged-in state on return |
| Session persistence across an actual browser refresh | AUTH-02 | Requires a real browser tab state (cookie jar) across a user-initiated refresh — curl can simulate a cookie-bearing request but not the human action of refreshing | Plan 02-02 Task 2, step 2: refresh the already-logged-in tab, confirm no re-auth prompt |
| Visual/cookie inspection confirming tenant_id query param has no effect in a live browser context | AUTH-03 | Combines a curl-verifiable server behavior (already automated in 02-01-T2) with a human visual check of dev-tools cookie contents for extra confidence | Plan 02-02 Task 2, step 3 |
| Unmapped-user access-denied path (optional) | D-05 (not a v1 requirement ID, but a locked CONTEXT.md decision) | Requires a second test IdP user without the `tenant_id` claim configured — may not be available this session | Plan 02-02 Task 2, step 4 (explicitly optional; note if skipped) |
| npm package legitimacy (jose, openid-client, oauth4webapi) | — | Automated "too-new" heuristic gate flags all three as a documented false positive (maintainer `panva`, tens of millions of weekly downloads) — human visual confirmation on npmjs.com required before any install, per project convention of never auto-approving security-sensitive package installs | Plan 02-01 Task 0 |

## Live Callback Debugging Addendum

When EdgeOne does not expose Edge Function logs, temporarily set `AUTH_DEBUG_CALLBACK=true` and redeploy before running the browser checkpoint. `/access-denied.html` will display non-token failure metadata such as `missing_oidc_txn_cookie`, `authorization_code_grant_failed`, or `missing_tenant_claim`. If the failure is `missing_tenant_claim`, set `OIDC_TENANT_CLAIM` to the exact ID-token claim key emitted by the IdP. If the failure is `authorization_code_grant_failed` with the EdgeOne body-initializer message, verify that `edge-functions/lib/oidc-config.js` is deployed with the custom fetch wrapper that converts `URLSearchParams` bodies to form-encoded strings. Disable `AUTH_DEBUG_CALLBACK` after the checkpoint passes.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies — ✅ satisfied: 02-01-T1, 02-01-T2, 02-02-T1 all carry real curl-based `<automated>` blocks; 02-01-T0 and 02-02-T2 are checkpoint tasks (manual by design, never auto-approved)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify — ✅ satisfied: checkpoint tasks (T0, and 02-02-T2) are bracketed by automated tasks (T1, T2, 02-02-T1) on both sides within their respective plans
- [ ] Wave 0 covers all MISSING references — ✅ satisfied: all ❌ W0 artifacts above are explicitly listed as Wave 0 Requirements
- [ ] No watch-mode flags — ✅ satisfied: no test framework/watch mode introduced this phase
- [ ] Feedback latency < 10s (curl checks); manual checkpoints are human-paced by design — ✅ satisfied
- [ ] `nyquist_compliant: true` set in frontmatter — pending sign-off (see below)

**Approval:** pending
