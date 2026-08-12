---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03
current_phase_name: tenant-scoped-data-source-selection
status: executing
stopped_at: Live Auth0 SSO callback debugging in progress; configurable tenant claim and EdgeOne token-fetch compatibility shim pushed to main; Phase 3 Plan 01 Task 1 code complete pending credentials checkpoint; Phase 4 context ready for planning
last_updated: "2026-08-12T15:55:00.000-07:00"
last_activity: 2026-08-12
last_activity_desc: Live Auth0 SSO showed "Successful login" but the app still denied the callback. Added opt-in `AUTH_DEBUG_CALLBACK` browser-visible diagnostics for environments where EdgeOne logs are unavailable, made tenant claim extraction configurable via `OIDC_TENANT_CLAIM` with `tenant_id` as the default, and fixed an EdgeOne runtime incompatibility where fetch rejected the `URLSearchParams` token-exchange body used by `openid-client`/`oauth4webapi`.
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 8
  completed_plans: 3
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-10)

**Core value:** Enterprise customers can self-serve custom reporting on their own EdgeOne data (CDN traffic, security events) without filing a support/sales request — via a prompt-driven agent, gated behind their enterprise SSO, with data strictly isolated to their own account.
**Current focus:** Phase 03 — tenant-scoped-data-source-selection (Plan 01 code complete, live checkpoint pending human credentials)

## Current Position

Phase: 03 (tenant-scoped-data-source-selection) — EXECUTING
Plan: 1 of 2 — Task 1 (code) complete, Task 2 (human-verify checkpoint) blocked on real Tencent Cloud credentials
Status: Phase 2 fully code-complete (one human checkpoint outstanding); Phase 3 tracer code complete (one human checkpoint outstanding); Phase 4 context gathered, ready to plan
Last activity: 2026-08-12 — Executed Phase 3 Plan 01 Task 1; gathered Phase 4 context

Progress: [██████░░░░] ~60% (2 of 4 phases with live-verified or code-complete work; 2 human checkpoints outstanding)

## Performance Metrics

**Velocity:**

- Total plans completed: 3 (fully summarized; several more code-complete pending human checkpoints)
- Average duration: ~7 min/plan (code portions only)
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 2/2 | complete | - |
| 2 | 2/2 (code); 1 checkpoint pending | - | 9 min, ~5 min |
| 3 | 1/2 (code); 1 checkpoint pending | - | - |

**Recent Trend:**

- Last 3 plans: 02-02 (session UI), 03-01 (CDN tracer), 04-CONTEXT (gathered)
- Trend: steady — each phase's code lands quickly; human-credential checkpoints are the bottleneck, not implementation.

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 02 P01 | 9min | 2 tasks | 7 files |
| Phase 02 P02 | ~5min (Task 1) | 1/2 tasks | 2 files |
| Phase 03 P01 | ~10min (Task 1) | 1/2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Deployment-first phase ordering — EdgeOne Pages + Functions deployment (DEPLOY-01) is Phase 1, ahead of auth/features, so every later phase is verified against the live platform rather than local dev.
- [Roadmap]: Coarse granularity applied — 4 phases, vertical-slice structure (deploy → auth/tenant → data scoping → generation/save).
- [Phase 2]: Implemented both PKCE and nonce validation in the OIDC callback (defense-in-depth per RESEARCH.md) rather than PKCE alone.
- [Phase 2]: Tenant claim extraction defaults to bare `tenant_id`, but production/test deployments can set `OIDC_TENANT_CLAIM` to an exact IdP-issued key, including Auth0-style namespaced custom claims.
- [Phase 2]: `AUTH_DEBUG_CALLBACK=true` is an explicit temporary onboarding diagnostic when EdgeOne logs are unavailable; production default remains generic no-leak `/access-denied.html` redirects.
- [Phase 2]: 12-hour fixed JWT session expiry per RESEARCH.md Pitfall 4 — session-cookie lifetime, not access-token lifetime.
- [Phase 3]: Hand-rolled TC3-HMAC-SHA256 signing via crypto.subtle for the Tencent Cloud teo Open API — no edge-runtime-compatible SDK exists.
- [Phase 3]: KV-backed tenant_id -> EdgeOne account mapping, read-only this phase (`getTenantAccount()` in tenant-mapping.js), population deferred to onboarding.
- [Phase 4, auto]: Constrained-generation DSL for GEN-03 designed — fixed 4-type component vocabulary (line-chart/bar-chart/stat-card/table) + fixed query-shape enums (metric/interval/timeRange), server validates and maps to real API params via a lookup table; LLM output is never executed as code and never reaches the outbound API call directly. See 04-CONTEXT.md D-01/D-02/D-03.
- [Phase 4, auto]: Saved dashboards persist in the existing `my_kv` namespace under `dashboard:<tenant_id>:<dashboard_id>`, tenant_id always re-derived from verifySession() (never client input). See 04-CONTEXT.md D-05/D-06.

### Pending Todos

None yet.

### Blockers/Concerns

- **[RESOLVED 2026-08-12]** Phase 4 LLM provider/API key — now using EdgeOne Makers' built-in AI Gateway (`ai-gateway.edgeone.link`, OpenAI-compatible), model `@makers/deepseek-v4-flash`, no external vendor account needed. Requires generating a `MAKERS_MODELS_KEY` via EdgeOne Makers console → Models → API Key. Note: official docs flag built-in models as prototyping-only, not production-guaranteed — acceptable for this project's v1 scope. See `04-CONTEXT.md` D-04.
- **[RESOLVED — was flagged, now designed]** Constrained generation vocabulary/DSL for dashboard generation (GEN-03) — concrete design now exists in 04-CONTEXT.md D-01/D-02/D-03 (closed enums, server-side validation, no LLM string ever reaches the outbound API call). Ready for Phase 4 planning to consume.
- SSO protocol choice (OIDC vs SAML) — resolved in Phase 2 (OIDC only, SAML excluded), no longer a blocker.

**Outstanding human checkpoints (both are blocking, both require credentials/actions only the human can provide):**
1. **Phase 2 Plan 02 Task 2** — live browser OIDC round-trip (login → IdP → return logged-in; refresh persists session; spoofed `tenant_id` query param has zero effect). Latest live blocker was `authorization_code_grant_failed` caused by EdgeOne rejecting a `URLSearchParams` token-exchange body; fixed in `edge-functions/lib/oidc-config.js` and pushed to `main`. User needs to redeploy, keep `AUTH_DEBUG_CALLBACK=true` only while retesting, and re-run the checkpoint walkthrough in `.planning/phases/02-sso-authentication-tenant-mapping/02-02-PLAN.md` Task 2 `<how-to-verify>`.
2. **Phase 3 Plan 01 Task 2** — requires: (a) a Tencent Cloud API SecretId/SecretKey pair with `teo` read permissions, (b) a real EdgeOne Zone ID, (c) one seeded KV record (`tenant:<tenant_id>` → `{zoneId, secretId, secretKey}`) matching the Phase 2 test IdP's actual tenant (now `global.tencent.com` per the Pitfall 6 fix), (d) already pushed and live as of the last push. See `.planning/phases/03-tenant-scoped-data-source-selection/03-01-PLAN.md` Task 2 `<how-to-verify>` and `user_setup` frontmatter block.

**[NEW] Live gotcha found and fixed — Auth0 social-login users have no `user_metadata` by default.** The test user was a Google OAuth identity (`google-oauth2|...`); Auth0 never populates `user_metadata` for social connections, so the Post-Login Action's `event.user.user_metadata.tenant_id` read silently resolved to nothing, sending every login through the generic access-denied page even though the app's OIDC/session code was correct. Fixed by updating the Action to fall back to `event.user.idp_tenant_domain` (already populated for this Google Workspace user, resolving to `global.tencent.com`). Documented as `02-RESEARCH.md` Pitfall 6 for future onboarding reference — production customers using database-connection IdPs won't hit this path, but any future social-login test users will.

**[NEW] Live callback diagnostics and EdgeOne OIDC compatibility fix.** Auth0 logs can show `Successful login` while the app still denies the callback because Auth0 authentication and app callback acceptance are separate stages. Tencent EdgeOne did not surface Edge Function logs during debugging, so the app now supports `AUTH_DEBUG_CALLBACK=true` to append non-token diagnostic keys to `/access-denied.html` temporarily. The first visible failure was `authorization_code_grant_failed` with EdgeOne rejecting `URLSearchParams` as the token request body initializer. Fixed by installing a custom fetch on the OIDC configuration that converts `URLSearchParams` bodies to form-encoded strings before calling EdgeOne `fetch`. Also changed tenant extraction from hard-coded `claims.tenant_id` to configurable `claims[env.OIDC_TENANT_CLAIM || 'tenant_id']` for Auth0 namespaced custom claims.

**[NEW] UI-SPEC implementation gap closed, then reconciled with a user-driven restructure.** `02-UI-SPEC.md` (system font, EdgeOne blue `#0052D9`, spacing scale, card layout, exact copywriting) was written during Phase 2's UI-phase step but never actually built into code — `index.html`/`access-denied.html` remained Phase 1's bare unstyled HTML. User reported "I don't see any CSS design on the webpage yet." First fix: added a shared `styles.css` implementing the spec. The user then independently rebuilt `index.html`/`app.js`/`access-denied.html` into a richer structure (top nav with tenant badge, dedicated login screen, Phase-3-ready `.card-grid`/`.source-card` data-source picker) as per-page inline `<style>` blocks with different (indigo) colors, without initially flagging the change. Reconciled by keeping the user's structure/layout in full and swapping its color tokens + copy back to the spec's EdgeOne-blue palette and exact wording; `styles.css` removed as orphaned. `02-UI-SPEC.md`'s Checker Sign-Off and `02-02-SUMMARY.md` updated to describe the merged, final implementation.

**Resolved this session:** Plan 02-01's live verification gap is partially closed but still being actively retested. User set the required env vars in EdgeOne Makers Console and provisioned a real test IdP (Auth0). Three genuine EdgeOne edge-runtime compatibility bugs surfaced once the code reached `openid-client` internals — (1) `AbortSignal.timeout` not implemented on the runtime, (2) `response.setCookies()` deprecated in favor of `Headers`-based `Set-Cookie`, (3) `fetch` rejecting `URLSearchParams` token request bodies. All three have code fixes; the latest fetch-body fix has been pushed and needs live redeploy verification.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 requirement | SHARE-01, SHARE-02 (shareable links, dashboard history) | Deferred to v2 | Project init |
| v2 requirement | AUTH-04 (explicit logout) | Deferred to v2 | Project init |
| v2 requirement | LIVE-01 (auto-refreshing dashboards) | Deferred to v2 | Project init |
| v2 requirement | DATA-04, DATA-05 (DNS analytics, Edge Functions metrics) | Deferred to v2 | Project init |

## Session Continuity

Last session: 2026-08-12T03:15:00.000Z
Stopped at: UI-SPEC implemented, reconciled with user's own page-structure rebuild, and live; Auth0 tenant-claim gap fixed at the Action level; Phase 3 credentials checkpoint still outstanding
Resume file: .planning/phases/02-sso-authentication-tenant-mapping/02-02-SUMMARY.md, .planning/phases/03-tenant-scoped-data-source-selection/03-01-SUMMARY.md, .planning/phases/04-prompt-driven-dashboard-generation-save/04-CONTEXT.md

**Next steps for the user:**
1. Redeploy latest `main`, keep `AUTH_DEBUG_CALLBACK=true` only during the next SSO attempt, and confirm the previous `authorization_code_grant_failed` body-initializer error is gone.
2. If the next denial is `missing_tenant_claim`, set `OIDC_TENANT_CLAIM` to the exact Auth0 ID-token claim key shown by the debug page, then redeploy and retry.
3. Once login succeeds, turn `AUTH_DEBUG_CALLBACK=false`, redeploy, and complete Phase 2's remaining checkpoint steps (refresh persists session; spoofed `tenant_id` query param has no effect).
4. Resolve the Phase 3 checkpoint (Tencent Cloud credentials + KV seed record).
5. Decide the Phase 4 LLM provider/API key question.
6. Run `/gsd-plan-phase 4` to turn `04-CONTEXT.md` into an executable PLAN.md.
7. Continue with `03-02-PLAN.md` (Security Events route) once Plan 01's checkpoint is approved.
