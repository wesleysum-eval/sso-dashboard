---
phase: 03
slug: tenant-scoped-data-source-selection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-11
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none in repo (consistent with Phase 1/2 — integration-verification-heavy project, not unit-test-driven) |
| **Config file** | none — Wave 0 provisions real credentials, not a test framework |
| **Quick run command** | `curl -sf -b "session=<jwt>" "$(cat .planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt)api/data/cdn-traffic"` → expect `{"available":true,...}` or `{"available":false}` (never a 500 or a leaked credential) |
| **Full suite command** | Sequential curl checks (below) + Plan 03-02 Task 2's live browser/curl checkpoint against real Tencent Cloud credentials |
| **Estimated runtime** | ~5 seconds (curl checks) + manual verification walkthrough (untimed, human-paced) |

---

## Sampling Rate

- **After every task commit:** Run the task's own `<automated>` curl command (see Per-Task Verification Map below)
- **After every plan wave:** Run the full suite command (all curl checks) against the live deployed URL
- **Before `/gsd:verify-work`:** All automated curl checks green + Plan 03-02 Task 2 checkpoint approved (all 3 ROADMAP success criteria confirmed, including the DATA-03 negative test)
- **Max feedback latency:** ~10 seconds per curl-based check (live HTTP round trip)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 01 | 1 | DATA-01, DATA-03 | T-03-01, T-03-02, T-03-04 | `ZoneIds` set exclusively from session-resolved `tenant_id`; no client-supplied scoping value ever read; generic `{ available: false }` on any failure, never leaking `secretKey`/API error bodies | tracer | `curl -sf -o /dev/null -w "%{http_code}" "$DEPLOYED_URL/api/data/cdn-traffic" \| grep -q '^401$'` | ❌ W0 (teo-signer.js, tenant-mapping.js, cdn-traffic.js all new) | ⬜ pending |
| 03-01-T2 | 01 | 1 | DATA-01, DATA-03 | T-03-01 through T-03-04 (full-stack re-verification) | Real, tenant-scoped `teo` API call succeeds through a real seeded tenant mapping; response never contains raw credentials | manual checkpoint | N/A — `gate="blocking"`, requires real Tencent Cloud credentials, never auto-approved | N/A | ⬜ pending |
| 03-02-T1 | 02 | 2 | DATA-02, DATA-03 | T-03-01, T-03-02, T-03-04 (mirrored for security-events.js) | Same session-only scoping and no-leak contract as cdn-traffic.js; two-card picker complete with short-lived `?source=` passthrough | auto | `curl -sf -o /dev/null -w "%{http_code}" "$DEPLOYED_URL/api/data/security-events" \| grep -q '^401$'` | ❌ W0 (security-events.js new; index.html/app.js modified) | ⬜ pending |
| 03-02-T2 | 02 | 2 | DATA-01, DATA-02, DATA-03 | T-03-01 through T-03-04 (full-stack re-verification, both routes) | All 3 ROADMAP success criteria confirmed live: CDN pick, Security Events pick, and the DATA-03 negative test (client-supplied `zoneId`/`tenant_id` query params proven to have zero effect on either route) | manual checkpoint | N/A — `gate="blocking"`, browser/curl-driven, never auto-approved | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `edge-functions/lib/teo-signer.js`, `edge-functions/lib/tenant-mapping.js`, `edge-functions/api/data/cdn-traffic.js` — all new, created in Plan 03-01 Task 1
- [ ] `edge-functions/api/data/security-events.js` — new, created in Plan 03-02 Task 1
- [ ] `index.html` / `app.js` — modified across both plans to add the two-card data-source picker
- [ ] Real Tencent Cloud API SecretId/SecretKey pair with `teo` read permissions — must be provisioned by the human (Tencent Cloud Console → API Key management); no fallback, mocking would violate this project's established "prove it live, not mocked" precedent (Phase 1/2) and D-03's explicit real-API-calls requirement
- [ ] At least one real EdgeOne Zone ID under that account — required for live verification; an empty-but-successful `Data: []` response is an acceptable outcome if no real traffic exists yet, only a `Response.Error` indicates a real problem
- [ ] One KV record (`tenant:<test-tenant-id>` → `{ zoneId, secretId, secretKey }`) seeded manually — required before Plan 03-01's checkpoint task can be completed

*Confirmed pattern from Phase 1/2: any credential/config gap must be resolved via a human checkpoint, never mocked or stubbed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real, tenant-scoped `teo` API call returns live CDN traffic data through a real seeded tenant mapping | DATA-01 | Requires real Tencent Cloud credentials and a real Zone ID — not scriptable without provisioning secrets this session doesn't have | Plan 03-01 Task 2: curl with a real seeded session JWT, confirm `available:true` and a real (possibly empty) `data` array, never a leaked credential |
| Real, tenant-scoped `teo` API call returns live Security Events (DDoS) data | DATA-02 | Same as above, different endpoint/action | Plan 03-02 Task 2, step 2 |
| Client-supplied `zoneId`/`tenant_id` query param has zero effect on either data route (cross-tenant negative test) | DATA-03 | Combines a curl-verifiable server behavior with a human comparison of two live responses (with/without spoofed param) for extra confidence | Plan 03-02 Task 2, step 4 |
| Two-card picker UX end-to-end (select CDN Traffic Stats or Security Events, land on the correct route) | DATA-01, DATA-02 | Requires a real browser session with a valid `session` cookie from a completed Phase 2 login | Plan 03-02 Task 2, step 1 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies — ✅ satisfied: 03-01-T1, 03-02-T1 both carry real curl-based `<automated>` blocks; 03-01-T2 and 03-02-T2 are checkpoint tasks (manual by design, never auto-approved, blocked on real Tencent Cloud credentials)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify — ✅ satisfied: each plan is only 2 tasks (one automated tracer/auto task + one bracketing checkpoint)
- [ ] Wave 0 covers all MISSING references — ✅ satisfied: all ❌ W0 artifacts above are explicitly listed as Wave 0 Requirements
- [ ] No watch-mode flags — ✅ satisfied: no test framework/watch mode introduced this phase
- [ ] Feedback latency < 10s (curl checks); manual checkpoints are human-paced by design — ✅ satisfied
- [ ] `nyquist_compliant: true` set in frontmatter — pending sign-off (see below)

**Approval:** pending
