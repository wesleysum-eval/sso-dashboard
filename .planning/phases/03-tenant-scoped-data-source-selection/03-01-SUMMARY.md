---
phase: 03-tenant-scoped-data-source-selection
plan: 01
subsystem: api
tags: [edge-functions, crypto.subtle, tencent-cloud, teo, tc3-hmac-sha256, kv, session]

# Dependency graph
requires:
  - phase: 02-sso-authentication-tenant-mapping
    provides: verifySession() (edge-functions/lib/session.js), session cookie convention, tenant_id JWT claim
  - phase: 01-edgeone-deployment-foundation
    provides: my_kv KV namespace binding (bare global, console-configured)
provides:
  - TC3-HMAC-SHA256 signing library for any future teo Open API call (reusable by Plan 03-02's Security Events route)
  - KV-backed tenant_id -> EdgeOne account credential read path
  - Session-gated, tenant-scoped data-fetch route pattern (verifySession -> getTenantAccount -> signTeoRequest -> generic response)
affects: [03-02-security-events, phase-4-dashboard-generation]

# Actuals (#2632)
actuals:
  tokens: 2986
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TC3-HMAC-SHA256 signing via crypto.subtle only, no SDK/npm dependency (no edge-runtime-compatible Tencent Cloud SDK exists)"
    - "KV-backed tenant_id -> account mapping, fail-closed (typeof my_kv === 'undefined' guard, matching kv-check.js convention)"
    - "Session-gated data route: verifySession() first (401 before any KV/outbound call), then tenant-derived scoping only, then generic {available:false} on any failure"

key-files:
  created:
    - edge-functions/lib/teo-signer.js
    - edge-functions/lib/tenant-mapping.js
    - edge-functions/api/data/cdn-traffic.js
  modified:
    - index.html
    - app.js

key-decisions:
  - "Followed 03-RESEARCH.md Pattern 1 verbatim for TC3 signing (canonical request, string-to-sign, SecretDate->SecretService->SecretSigning HMAC chain) rather than deviating on request shape"
  - "Every failure branch in cdn-traffic.js (no session, no KV mapping, fetch error, upstream Response.Error) collapses to the same generic {available:false}/401 shapes per D-05 — no distinguishing detail anywhere in the response"

patterns-established:
  - "Pattern: signTeoRequest({secretId, secretKey, action, version, payload, domain}) -> {url, headers, body} is now the reusable signing entry point for any future teo API route (e.g. Plan 03-02's DescribeDDoSAttackData)"
  - "Pattern: getTenantAccount(tenantId) is the single, only-legitimate source of ZoneId/credentials for any tenant-scoped route — never read from request.url/headers/body"

requirements-completed: []
# NOTE: DATA-01 and DATA-03 are CODE-COMPLETE but NOT LIVE-VERIFIED. Task 2
# (the live checkpoint proving a real teo API call succeeds through a real
# KV-mapped tenant) has not run — it requires user-provided Tencent Cloud
# credentials, a real Zone ID, and a seeded KV record (see user_setup in
# 03-01-PLAN.md). Do NOT mark DATA-01/DATA-03 complete in REQUIREMENTS.md
# until Task 2 passes. Left empty here deliberately; state.md/requirements
# mark-complete step must be SKIPPED for this plan until Task 2 resumes.

coverage:
  - id: D1
    description: "TC3-HMAC-SHA256 signing implemented via crypto.subtle only (SHA-256 digest + HMAC-SHA256 sign), no npm dependency, no hand-rolled cryptographic primitives"
    requirement: "DATA-01"
    verification:
      - kind: unit
        ref: "manual node smoke-test: signTeoRequest() produces a 64-char hex signature and correctly-shaped TC3-HMAC-SHA256 Authorization header (verified this session, not committed as an automated test file)"
        status: pass
    human_judgment: false
  - id: D2
    description: "cdn-traffic.js rejects unauthenticated requests with 401 before any KV read or outbound API call"
    requirement: "DATA-03"
    verification:
      - kind: unit
        ref: "code inspection: verifySession() check is the first statement in onRequestGet, returns 401 immediately on null payload"
        status: pass
    human_judgment: false
  - id: D3
    description: "No response branch in cdn-traffic.js ever includes account.secretId, account.secretKey, or a raw upstream Response.Error"
    requirement: "DATA-03"
    verification:
      - kind: unit
        ref: "grep audit this session: only 2 references to secretId/secretKey in the file, both in the outbound signTeoRequest() call construction, none inside any new Response(...) body"
        status: pass
    human_judgment: false
  - id: D4
    description: "A real, live DescribeTimingL7AnalysisData call against the real teo API succeeds (or cleanly no-datas) for a real KV-mapped tenant, end-to-end through crypto.subtle signing on the actual EdgeOne edge runtime"
    requirement: "DATA-01"
    verification: []
    human_judgment: true
    rationale: "This is exactly Task 2's live checkpoint — it requires a human to provision real Tencent Cloud API SecretId/SecretKey with teo read permissions, a real Zone ID, and seed a KV record via the console, none of which the executor can do or fake without violating this project's established 'prove it live, not mocked' precedent. Local syntax/logic verification cannot substitute for proving crypto.subtle's HMAC sign/importKey path actually works on the real EdgeOne V8-isolate runtime (03-RESEARCH.md Assumption A1, explicitly flagged as needing this exact tracer to resolve)."
  - id: D5
    description: "The 'CDN Traffic Stats' picker card only renders in the browser when the user is authenticated, and clicking it renders real data or a clean 'No data available' state with no visible error"
    requirement: "DATA-01"
    verification: []
    human_judgment: true
    rationale: "Requires a real browser session (via Phase 2's test IdP login) to observe the rendered DOM state and click-through behavior — this is part of Task 2's how-to-verify steps 2-4, not something verifiable from source code alone."

duration: 12min
completed: 2026-08-11
status: halted
# status: halted, not complete — Task 2 is a blocking:human-verify checkpoint
# that reached its designed stop (requires user-provided Tencent Cloud
# credentials + a seeded KV record, per this plan's user_setup block). This
# is an intentional non-completion, not a failure. Re-summarize as `complete`
# once Task 2's checkpoint is resumed and passes.
---

# Phase 3 Plan 01: Tenant-Scoped CDN Traffic Tracer (Task 1) Summary

**TC3-HMAC-SHA256 request signing via crypto.subtle, KV-backed tenant->account mapping, and a session-gated /api/data/cdn-traffic route — code-complete but not yet live-verified against the real teo API.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-11T23:52:00Z (approx, session start)
- **Completed:** 2026-08-11T23:04:29-07:00 (commit timestamp)
- **Tasks:** 1 of 2 (Task 2 is a human-verify checkpoint, intentionally not attempted this session)
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- Built `edge-functions/lib/teo-signer.js`: a full TC3-HMAC-SHA256 signer for the Tencent Cloud `teo` Open API, built entirely on `crypto.subtle` (SHA-256 digest, HMAC-SHA256 importKey/sign) — no SDK, no npm dependency, no hand-rolled cryptographic primitive.
- Built `edge-functions/lib/tenant-mapping.js`: a fail-closed, read-only KV lookup (`tenant:<tenant_id>` -> `{zoneId, secretId, secretKey}`) matching the exact `typeof my_kv === 'undefined'` guard convention already proven in `edge-functions/api/kv-check.js`.
- Built `edge-functions/api/data/cdn-traffic.js`: the full session -> tenant -> signed-API-call chain, gated by `verifySession()` as the very first branch, with every failure path (missing session, missing mapping, network error, upstream `Response.Error`) collapsing to the same generic response shape.
- Extended `index.html`/`app.js` additively with a "CDN Traffic Stats" picker card, gated on the existing `/api/status` `authenticated` field, wired to `fetch('/api/data/cdn-traffic')`.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "select CDN Traffic Stats" — one path only** - `69f3e08` (feat)

Task 2 (live checkpoint) not attempted this session — see "Next Phase Readiness" below.

**Plan metadata:** (pending — this SUMMARY commit)

## Files Created/Modified
- `edge-functions/lib/teo-signer.js` - TC3-HMAC-SHA256 signing (`signTeoRequest`) for the teo Open API, crypto.subtle only
- `edge-functions/lib/tenant-mapping.js` - `getTenantAccount(tenantId)`, KV-backed, fail-closed
- `edge-functions/api/data/cdn-traffic.js` - `onRequestGet`, session-gated `DescribeTimingL7AnalysisData` route
- `index.html` - additive "Select a data source" section with a "CDN Traffic Stats" card, hidden by default
- `app.js` - card visibility toggle on `authenticated`, click handler fetching `/api/data/cdn-traffic` and rendering data or "No data available"

## Decisions Made
- Followed 03-RESEARCH.md Pattern 1/2/3 verbatim rather than deviating on request shape, KV key convention, or failure-branch structure — this tracer's entire purpose is de-risking the *unverified* assumption (crypto.subtle HMAC on the real edge runtime), not exploring alternative designs.
- Kept `index.html`/`app.js` changes strictly additive — the existing Phase 2 authenticated/unauthenticated branching in `app.js`'s `/api/status` handler was extended (added a visibility toggle at the end of the existing `.then()`), not restructured.

## Deviations from Plan

None - plan executed exactly as written for Task 1. Task 2 was correctly not attempted per explicit scope instructions.

## Issues Encountered

None during Task 1 implementation. Local verification was limited to: syntax checking (`node --check`) on all 4 modified/created JS files, a manual Node smoke-test of `signTeoRequest()` confirming a well-formed 64-character hex signature and correct TC3-HMAC-SHA256 Authorization header shape, and a `grep`-based audit confirming no `secretId`/`secretKey` value appears in any `new Response(...)` body and no `request.url`/non-Cookie header is read for scoping. **A live redeploy + curl verification against the deployed URL was NOT performed this session** — per the task instructions, pushing to the remote (`git push origin main`) was explicitly withheld, and this repo's only deploy path is GitHub-connected auto-redeploy on push. This means the plan's own `<verify><automated>` step (`curl ... | grep -q '^401$'`) has not run against live infrastructure yet.

## User Setup Required

**Task 2 (live verification) cannot proceed without the following, all of which require the human:**

1. **Tencent Cloud API credentials:** Create a SecretId/SecretKey pair with `teo` (EdgeOne) read permissions via Tencent Cloud Console -> Access Management (CAM) -> API Keys.
2. **Real Zone ID:** Note a real EdgeOne Zone ID from EdgeOne Console -> Site List -> (any site) -> Zone ID.
3. **Seed one KV record:** Key `tenant:<tenant_id>` (using the exact `tenant_id` claim value the Phase 2 test IdP issues), value `{"zoneId":"<real-zone-id>","secretId":"<real-secret-id>","secretKey":"<real-secret-key>"}`, via EdgeOne Makers Console -> KV Storage -> the namespace bound as `my_kv` (ER_7 / ns-izJIpHTo645c per Phase 1 Plan 02) -> Add Key.
4. **Optional:** Set `TEO_API_DOMAIN` to `teo.intl.tencentcloudapi.com` in EdgeOne Makers Console -> Project Settings -> Environment Management, only if the Tencent Cloud account is on the international console. Defaults to `teo.tencentcloudapi.com` if unset.
5. **git push to trigger a redeploy** — this session did not push; the code above exists only as local commits until pushed.

Once these are in place, resume Task 2 exactly per its `<how-to-verify>` steps in 03-01-PLAN.md: log in via the test IdP, confirm the card is visible, click it, inspect the network response for zero credential/error leakage, and confirm the negative (no-cookie) case still returns 401 on the live deployment.

## Next Phase Readiness

- **DATA-01 and DATA-03 are code-complete but NOT live-verified.** `requirements-completed` is deliberately left empty in this SUMMARY's frontmatter — do not mark these requirements complete in REQUIREMENTS.md until Task 2's live checkpoint passes. The two coverage items depending on live verification (D4, D5 above) are marked `human_judgment: true` with an explicit rationale; they are not auto-passable.
- Plan 03-02 (Security Events) can safely reuse `teo-signer.js`'s `signTeoRequest()` and `tenant-mapping.js`'s `getTenantAccount()` unchanged once Task 2 confirms the signing chain actually works on the live edge runtime — but should not proceed with its own live verification until this plan's Task 2 has resolved Assumption A1 (crypto.subtle HMAC sign/importKey support in EdgeOne Edge Functions), since a failure there would apply identically to any teo API route.
- Blocker carried forward: this plan's checkpoint (Task 2) is `gate="blocking"` and explicitly never auto-approved — it requires an explicit human "approved" after live testing, regardless of `workflow.auto_advance`.

---
*Phase: 03-tenant-scoped-data-source-selection*
*Completed: 2026-08-11 (Task 1 only; Task 2 pending human action)*
