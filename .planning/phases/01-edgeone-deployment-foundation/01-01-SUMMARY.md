---
phase: 01-edgeone-deployment-foundation
plan: 01
subsystem: infra
tags: [edgeone-makers, edge-functions, static-hosting, cli-deploy]

requires: []
provides:
  - Static site (index.html, app.js) deployed to EdgeOne Makers
  - Edge Function at /api/status returning live JSON (hasConfig, kvBound, ts)
  - Two live EdgeOne Makers projects exist for this app (see Decisions)
affects: [01-02-kv-persistence, phase-2-sso, phase-3-data-source, phase-4-generation]

actuals:
  tokens: 4200
  tasks: 2
  commits: 3

tech-stack:
  added: [edgeone CLI v1.6.23, EdgeOne Makers Edge Functions]
  patterns: ["Edge Function reads context.env for secrets, never echoes raw value", "CLI direct-upload deploy vs GitHub-connected deploy are separate project identities on this platform"]

key-files:
  created:
    - index.html
    - app.js
    - edge-functions/api/status.js
    - .planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt
  modified: []

key-decisions:
  - "Two live deployments exist for this app: (1) GitHub-connected project serving https://sso-dashboard.edgeone.dev (created via manual console GitHub integration, outside CLI control), and (2) CLI direct-upload project 'enterprise-sso-dashboard-p1' (makers-zufksp0hxlxv) serving https://enterprise-sso-dashboard-p1.edgeone.cool. The CLI's `env set`/`deploy` commands only affect the CLI-linked project (2) — they have no visibility into or effect on the GitHub-connected project (1)."
  - "DEPLOYED-URL.txt records the GitHub-connected URL (https://sso-dashboard.edgeone.dev) as canonical since that's the user-facing deployment path going forward; the CLI-linked project was used only to prove criterion 3 is achievable on the platform."

patterns-established:
  - "Edge Function secret pattern: read via context.env.<NAME>, return only a boolean (hasConfig), never the raw value — established in edge-functions/api/status.js, should be followed by all future Edge Functions handling secrets."

requirements-completed: [DEPLOY-01]

coverage:
  - id: D1
    description: "Static site publicly reachable at a live EdgeOne Makers URL"
    requirement: "DEPLOY-01"
    verification:
      - kind: manual_procedural
        ref: "curl -o /dev/null -w '%{http_code}' https://sso-dashboard.edgeone.dev/ -> 200"
        status: pass
    human_judgment: false
  - id: D2
    description: "Edge Function deployed and callable from the live site, returns real (non-mocked) JSON"
    requirement: "DEPLOY-01"
    verification:
      - kind: manual_procedural
        ref: "curl https://sso-dashboard.edgeone.dev/api/status -> {\"hasConfig\":false,\"kvBound\":false,\"ts\":<live-timestamp>}"
        status: pass
    human_judgment: false
  - id: D3
    description: "Platform-set environment secret readable by the deployed Edge Function on the live, user-facing GitHub-connected deployment"
    requirement: "DEPLOY-01"
    verification:
      - kind: manual_procedural
        ref: "curl https://sso-dashboard.edgeone.dev/api/status -> hasConfig:false (NOT proven on this deployment)"
        status: fail
      - kind: manual_procedural
        ref: "curl http://enterprise-sso-dashboard-p1.edgeone.cool/api/status (CLI-linked project, alternate deployment) -- blocked by ISP network-protection intercept, could not complete verification"
        status: unknown
    human_judgment: true
    rationale: "Criterion 3 (secret readable by deployed Function) is unverified on the canonical GitHub-connected deployment because that project is not CLI-linked -- edgeone makers env set only reaches the separate CLI direct-upload project. Attempting to verify on the CLI-linked project instead was blocked by an ISP-level network protection page intercepting the .edgeone.cool domain (both HTTP and HTTPS), unrelated to the app code. Needs human resolution: either get env-var/console access to the GitHub-connected project, or resolve ISP/DNS access to the CLI-linked project's domain."

duration: 45min
completed: 2026-08-11
status: complete
---

# Phase 1 Plan 01: Deployment Foundation Summary

**Static site + Edge Function live on EdgeOne Makers via GitHub-connected deploy; secret-readability criterion blocked by a project-identity split between GitHub deploy and CLI deploy**

## Performance

- **Duration:** 45 min
- **Tasks:** 2
- **Files modified:** 4 created

## Accomplishments
- `index.html` + `app.js` + `edge-functions/api/status.js` built and deployed
- Live static site reachable at https://sso-dashboard.edgeone.dev/ (HTTP 200)
- Live Edge Function `/api/status` returns real JSON with a live timestamp (not mocked)
- Live URL captured in `DEPLOYED-URL.txt`
- Discovered and documented a platform quirk: GitHub-connected deploys and CLI (`edgeone makers`) deploys create/manage separate project identities, even for the same repo

## Task Commits

1. **Task 1: Build static site + Edge Function skeleton** - (files created locally, committed as part of manual "phase1" commit by user)
2. **Task 2: Deploy and verify live** - `ff31e1d` (manual GitHub-connected deploy), `7fe7fda` (docs: record deployed URL)

**Plan metadata:** this SUMMARY.md (docs: complete plan)

## Files Created/Modified
- `index.html` - Static entry point, loads app.js
- `app.js` - Fetches /api/status, renders result into #result div
- `edge-functions/api/status.js` - GET handler reading PLACEHOLDER_OIDC_CLIENT_ID env var (hasConfig), checking KV binding (kvBound), returning live timestamp
- `.planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt` - https://sso-dashboard.edgeone.dev/

## Decisions Made
- User deployed manually via GitHub integration (connecting repo, pushing to `main`) rather than `edgeone makers deploy` CLI. This is a valid alternate path not originally anticipated by the plan, and is now the canonical live deployment.
- Attempted to fix criterion 3 by setting the env var via CLI (`edgeone makers env set`) — discovered this CLI session is linked to a *different* Makers project (`enterprise-sso-dashboard-p1` / `makers-zufksp0hxlxv`) than the one serving the GitHub-connected domain. The CLI has no command to discover or link to the GitHub-connected project directly.
- As a fallback, deployed fresh via CLI to prove the platform mechanism works end-to-end (criteria 1-3 all achievable via CLI path) — but verification of that URL was blocked by an ISP-level network-protection page intercepting the `.edgeone.cool` domain as a false-positive phishing/malware flag, on both HTTP and HTTPS.
- Decision: accept D3 as an open item rather than fabricate a pass. Documented clearly for follow-up (either get console access to set env vars on the GitHub-connected project, or resolve network access to verify the CLI-linked project).

## Deviations from Plan

### Auto-fixed Issues
None — no code-level auto-fixes were needed.

### Process Deviation (not auto-fixed, escalated to user)

**1. [Environment/Infra] Env var not reachable on canonical deployment**
- **Found during:** Task 2 verification (checking criterion 3)
- **Issue:** Plan assumed a single Makers project reachable via both GitHub-connect and CLI. In practice, this account has two separate Makers projects: one from manual GitHub console setup (serves the canonical `sso-dashboard.edgeone.dev` URL) and one from CLI `link`/`deploy` (serves `enterprise-sso-dashboard-p1.edgeone.cool`). Setting env vars via CLI only affects the CLI-linked project.
- **Attempted fix:** Ran `edgeone makers env set PLACEHOLDER_OIDC_CLIENT_ID <value>`, then redeployed via CLI to the CLI-linked project to at least prove the mechanism. Verification of that URL failed due to an unrelated ISP network-protection intercept (confirmed by response body: an AT&T "Home Network Protection" phishing/malware block page, not app or platform behavior).
- **Resolution:** Left as an open gap (D3, `human_judgment: true`). Not silently marked pass.
- **User decision:** Explicitly chose to skip further troubleshooting for now and continue with the rest of the roadmap (Phase 1 Plan 2 onward).

---

**Total deviations:** 1 process deviation, unresolved (escalated to human, tracked as D3)
**Impact on plan:** Criteria 1 and 2 fully proven on the canonical live deployment. Criterion 3 (secret readability) is proven achievable in principle (the code and mechanism are correct — same Edge Function code, same env-var-read pattern) but not verified end-to-end on the canonical URL due to a project-identity split. No scope creep; no fabricated verification.

## Issues Encountered
- ISP-level (AT&T Home Network Protection) network intercept on the `.edgeone.cool` domain, unrelated to the application — blocked verification of the CLI-linked deployment. Not an app bug.
- Two distinct Makers project identities for the same app (GitHub-connect vs CLI link) is a platform behavior worth flagging for Phase 2+ planning — future phases should confirm which project identity they're deploying/configuring against.

## User Setup Required
**Open — carried forward, not blocking further roadmap progress per user decision:**
- Either grant console/dashboard access to set `PLACEHOLDER_OIDC_CLIENT_ID` (and later, real OIDC secrets) directly on the GitHub-connected project serving `sso-dashboard.edgeone.dev`, OR
- Resolve network/ISP access to `enterprise-sso-dashboard-p1.edgeone.cool` so the CLI-linked project deployment can be verified as an alternate path.

## Next Phase Readiness
- Static hosting and Edge Function routing are proven live and working — Phase 2 (SSO) can build on this deployment.
- **Carried-forward blocker:** Phase 2 (and later phases) will set real secrets (OIDC client credentials). Whoever plans Phase 2 must first resolve which Makers project identity is authoritative and confirm secret-setting works against it, or this same gap recurs at higher stakes.
- Phase 1 Plan 02 (KV persistence) can proceed — it's a separate concern (console-only KV binding) and not blocked by the D3 gap.

## Update (2026-08-11, during Plan 01-02)
**D3 gap resolved.** The user set the placeholder env var directly in the console on the GitHub-connected project, then redeployed. `curl https://sso-dashboard-0eso53cx.edgeone.dev/api/status` now returns `{"hasConfig":true,"kvBound":true,...}` — criterion 3 (secret readable on the canonical deployment) is now verified pass. See `01-02-SUMMARY.md` coverage entry `D3-followup` for the verification record. No further action needed on this blocker.

---
*Phase: 01-edgeone-deployment-foundation*
*Completed: 2026-08-11*
