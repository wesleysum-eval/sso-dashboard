---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03
current_phase_name: tenant-scoped-data-source-selection
status: executing
stopped_at: "Phase 4 (both plans) fully complete and live-verified. Plan 02's Task 3 blocking checkpoint received the human's \\\\\\\\\\\\\\\"approved\\\\\\\\\\\\\\\" response after a full live walkthrough of all 6 verification steps, including the GEN-03 prompt-injection negative test and the SAVE-01 cross-tenant negative test. GEN-04, SAVE-01 marked complete in REQUIREMENTS.md. Phase 3 Plan 02 (Security Events route) still not built — biggest remaining gap. Phase 2/3 documentation checkpoints (refresh persistence, spoofed tenant_id, Phase 3 Plan 01 Task 2 re-confirmation) also still outstanding."
last_updated: "2026-08-13T04:56:33.226Z"
last_activity: 2026-08-13
last_activity_desc: "Executed Phase 4 Plan 02 (04-02-PLAN.md): built edge-functions/api/dashboard.js (POST, session-gated KV save) and edge-functions/api/dashboard/[id].js (GET, EdgeOne bracket dynamic route, session-gated KV retrieve with cross-tenant-safe key construction), committed aa241a9; extended app.js/index.html with re-prompt/Regenerate wiring confirmation, a Save Dashboard UI rendering its confirmation from the in-memory POST response, and a read-only ?dashboard=<id> retrieval view, committed 125b809; then halted at Task 3 (checkpoint:human-verify, gate=\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"blocking\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\") until the human performed a full live walkthrough of all 5 ROADMAP Phase 4 success criteria (including the GEN-03 prompt-injection negative test and the SAVE-01 cross-tenant negative test) and responded \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"approved\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\". Updated REQUIREMENTS.md (GEN-04, SAVE-01 marked complete — all Phase 4 requirements now complete) and 04-02-SUMMARY.md to reflect the live pass."
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 8
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-10)

**Core value:** Enterprise customers can self-serve custom reporting on their own EdgeOne data (CDN traffic, security events) without filing a support/sales request — via a prompt-driven agent, gated behind their enterprise SSO, with data strictly isolated to their own account.
**Current focus:** Phase 03 — tenant-scoped-data-source-selection

## Current Position

Phase: 03 (tenant-scoped-data-source-selection) — EXECUTING
Plan: 1 of 2
Status: Executing Phase 03
Last activity: 2026-08-12 — Phase 03 execution started

Progress: [█████████░] 88% (Phase 4 fully complete and live-verified; Phase 3 Plan 02 remains the biggest open gap; 2 human checkpoints still outstanding in Phases 2-3)

## Performance Metrics

**Velocity:**

- Total plans completed: 5 (Phase 4 now fully complete and live-verified — both plans)
- Average duration: ~7 min/plan (code portions only)
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 2/2 | complete | - |
| 2 | 2/2 (code); 1 checkpoint pending | - | 9 min, ~5 min |
| 3 | 1/2 (code); 1 checkpoint pending, 1 plan unbuilt | - | - |
| 4 | 2/2 complete + live-verified | ~45 min (code) + outage fix | - |

**Recent Trend:**

- Last 3 plans: 04-CONTEXT (gathered), 04-01 (generation tracer, live-verified), 04-02 (re-prompt/save/retrieve, live-verified)
- Trend: code lands quickly; human-credential checkpoints and (Plan 04-01) a self-inflicted build-breaking bug were the actual bottlenecks, not implementation speed. Plan 04-02's checkpoint passed cleanly on the first live walkthrough.

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 02 P01 | 9min | 2 tasks | 7 files |
| Phase 02 P02 | ~5min (Task 1) | 1/2 tasks | 2 files |
| Phase 03 P01 | ~10min (Task 1) | 1/2 tasks | 5 files |
| Phase 04 P01 | ~25min (code) + outage fix | 3/3 tasks complete | 5 files + 2 outage-fix files |
| Phase 04 P02 | ~20min (code) + live verification | 3/3 tasks complete | 4 files |

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
- [Phase 4 Plan 01]: Omitted `response_format` entirely from the AI Gateway request body — JSON-mode support is unconfirmed/undocumented on this gateway; relies on prompt-engineered JSON-only instructions plus mandatory server-side `validateWidget()` as the sole safety backstop.
- [Phase 4 Plan 01]: Per-widget partial-success validation and per-widget teo-fetch-failure isolation — one invalid/failed widget never discards sibling widgets in the same generated dashboard.
- [Phase 4 Plan 01]: Implemented Phase 3's D-04 `?source=` URL passthrough client-side in app.js — this had been specified in 03-CONTEXT.md but never actually wired by Plan 03-01/03-02.
- [Phase 4 Plan 01, incident fix]: Removed a `dynamic import('node:crypto')` fallback from `edge-functions/lib/kv-crypto.js` — esbuild statically resolves `import()` targets at edge-function bundle time regardless of whether the branch executes, so this single unnecessary fallback broke the ENTIRE edge-function bundle (every `/api/*` route 404'd, not just this module's callers). `crypto.subtle` is always available as a global on both the EdgeOne edge runtime and modern Node; no fallback needed. **Standing rule going forward: never add a `node:*`-only import anywhere reachable from `edge-functions/`, even inside a conditional/fallback branch.**
- [Phase 4 Plan 01, incident fix]: Removed a speculative `edge-functions/api/[[default]].js` catch-all router that had been added earlier the same session as an unconfirmed attempted fix for a suspected routing regression. It was not the actual cause of anything and added unnecessary route-dispatch complexity — all nested routes it forwarded (`data/cdn-traffic`, `tenant/connect`) were already confirmed working live in Phase 2/3 before this session's changes.
- [Phase 4 Plan 02]: GEN-04 (re-prompt/Regenerate) required no new server-side or client-side wiring — Plan 04-01's Task 2 had already threaded `previousSpec` into the single Generate/Regenerate button; Plan 04-02's only touch was a clarifying doc comment plus the live re-verification in Task 3.
- [Phase 4 Plan 02]: `draft.data` added as a field mirroring `draft.spec` exactly (each widget already carries its own fetched `teo` data merged in from Plan 04-01) rather than introducing a separate raw-data extraction path server-side.
- [Phase 4 Plan 02]: Save-confirmation renders entirely from the in-memory `POST /api/dashboard` response — never an immediate `GET` re-fetch of the just-written key — to sidestep KV's documented 60-second eventual-consistency window (04-RESEARCH.md Pitfall 5).

### Pending Todos

None yet.

### Blockers/Concerns

- **[RESOLVED 2026-08-12]** Phase 4 LLM provider/API key — now using EdgeOne Makers' built-in AI Gateway (`ai-gateway.edgeone.link`, OpenAI-compatible), model `@makers/deepseek-v4-flash`, no external vendor account needed. Requires generating a `MAKERS_MODELS_KEY` via EdgeOne Makers console → Models → API Key. Note: official docs flag built-in models as prototyping-only, not production-guaranteed — acceptable for this project's v1 scope. See `04-CONTEXT.md` D-04.
- **[RESOLVED — was flagged, now designed]** Constrained generation vocabulary/DSL for dashboard generation (GEN-03) — concrete design now exists in 04-CONTEXT.md D-01/D-02/D-03 (closed enums, server-side validation, no LLM string ever reaches the outbound API call). Ready for Phase 4 planning to consume.
- SSO protocol choice (OIDC vs SAML) — resolved in Phase 2 (OIDC only, SAML excluded), no longer a blocker.

**Outstanding human checkpoints (all blocking, all require credentials/actions only the human can provide):**

1. **Phase 2 Plan 02 Task 2** — live browser OIDC round-trip (login → IdP → return logged-in; refresh persists session; spoofed `tenant_id` query param has zero effect). User confirmed live login now works. Still needs explicit re-confirmation of: refresh persists session with no re-auth, and `/?tenant_id=some-other-tenant` has zero effect. See `.planning/phases/02-sso-authentication-tenant-mapping/02-02-PLAN.md` Task 2 `<how-to-verify>`.
2. **Phase 3 Plan 01 Task 2** — requires: (a) a Tencent Cloud API SecretId/SecretKey pair with `teo` read permissions, (b) a real EdgeOne Zone ID, (c) one seeded KV record (`tenant:<tenant_id>` → `{zoneId, secretId, secretKey}`) matching the Phase 2 test IdP's actual tenant. See `.planning/phases/03-tenant-scoped-data-source-selection/03-01-PLAN.md` Task 2 `<how-to-verify>` and `user_setup` frontmatter block. **NOTE: this is likely already satisfied as a side effect of Phase 4 Plan 01's live checkpoint passing (CDN Traffic Stats returned real data end-to-end) — worth explicitly re-confirming and closing this checkpoint rather than re-doing it.**
3. **Phase 3 Plan 02 — NOT YET BUILT.** `edge-functions/api/data/security-events.js` does not exist. Must be executed before DATA-02/DATA-03's full-picker + negative-test checkpoint can even be attempted. See `.planning/phases/03-tenant-scoped-data-source-selection/03-02-PLAN.md`.

**RESOLVED this session:**

- ~~Phase 4 Plan 01 Task 1 + Task 2~~ — `MAKERS_MODELS_KEY` set manually in console (CLI `env set`/`env pull` silently no-op'd for this project — noted as a quirk, use console directly for any future env var changes here). Code pushed (`3bcc7b4`, `294e99f`, `cdfc994`, `6b1ec8f`). Live checkpoint passed — user confirmed "works now" after logging in, selecting CDN Traffic Stats, prompting, and generating a real dashboard. GEN-01/GEN-02/GEN-03/DATA-01 marked complete in REQUIREMENTS.md.
- ~~Phase 4 Plan 02 Task 3~~ — full live verification of all 5 ROADMAP Phase 4 success criteria (`checkpoint:human-verify`, `gate="blocking"`). Code pushed (`aa241a9`, `125b809`). Human performed the complete live walkthrough — GEN-01 (prompt input), GEN-02 (real generated data), GEN-03 negative test (prompt-injection produced zero out-of-vocabulary widgets), GEN-04 (re-prompt without returning to data-source selection), SAVE-01 (save + retrieve + cross-tenant negative test — second tenant's session correctly got "Dashboard not found") — and typed **"approved"**. GEN-04/SAVE-01 marked complete in REQUIREMENTS.md. **Phase 4 is now fully complete.**

**[NEW] Full `/api/*` production outage found and fixed during Phase 4 Plan 01's checkpoint.** After pushing Phase 4's generation pipeline, ALL API routes 404'd — not just the new `/api/generate`, but previously-working `/api/status` and `/api/kv-check` too. Root cause: `edge-functions/lib/kv-crypto.js` (added earlier the same session, unrelated to Phase 4) had a `dynamic import('node:crypto')` fallback for older Node; `esbuild` statically resolves `import()` targets at edge-function bundle time regardless of whether the branch executes, so this broke the entire bundle build on EdgeOne. Confirmed via `edgeone makers dev` locally (reproduced "Could not resolve node:crypto" build failure). Fixed by removing the fallback (`crypto.subtle` is always a global on both the edge runtime and modern Node — no fallback was ever needed). Also removed an unrelated speculative `edge-functions/api/[[default]].js` catch-all router added earlier the same session as an unconfirmed fix attempt for a different suspected issue — turned out unnecessary. **New standing rule: never add a `node:*`-only import anywhere reachable from `edge-functions/`, even inside a conditional/fallback branch — esbuild's static resolution breaks the whole bundle regardless of runtime branching.** Documented as an explicit code comment in `kv-crypto.js` for future reference.

**[NEW] Live gotcha found and fixed — Auth0 social-login users have no `user_metadata` by default.** The test user was a Google OAuth identity (`google-oauth2|...`); Auth0 never populates `user_metadata` for social connections, so the Post-Login Action's `event.user.user_metadata.tenant_id` read silently resolved to nothing, sending every login through the generic access-denied page even though the app's OIDC/session code was correct. Fixed by updating the Action to fall back to `event.user.idp_tenant_domain` (already populated for this Google Workspace user, resolving to `global.tencent.com`). Documented as `02-RESEARCH.md` Pitfall 6 for future onboarding reference — production customers using database-connection IdPs won't hit this path, but any future social-login test users will.

**[NEW] Live callback diagnostics and EdgeOne OIDC compatibility fix.** Auth0 logs can show `Successful login` while the app still denies the callback because Auth0 authentication and app callback acceptance are separate stages. Tencent EdgeOne did not surface Edge Function logs during debugging, so the app now supports `AUTH_DEBUG_CALLBACK=true` to append non-token diagnostic keys to `/access-denied.html` temporarily. The first visible failure was `authorization_code_grant_failed` with EdgeOne rejecting `URLSearchParams` as the token request body initializer. Fixed by installing a custom fetch on the OIDC configuration that converts `URLSearchParams` bodies to form-encoded strings before calling EdgeOne `fetch`. Also changed tenant extraction from hard-coded `claims.tenant_id` to configurable `claims[env.OIDC_TENANT_CLAIM || 'tenant_id']` for Auth0 namespaced custom claims.

**[NEW] UI-SPEC implementation gap closed, then reconciled with a user-driven restructure.** `02-UI-SPEC.md` (system font, EdgeOne blue `#0052D9`, spacing scale, card layout, exact copywriting) was written during Phase 2's UI-phase step but never actually built into code — `index.html`/`access-denied.html` remained Phase 1's bare unstyled HTML. User reported "I don't see any CSS design on the webpage yet." First fix: added a shared `styles.css` implementing the spec. The user then independently rebuilt `index.html`/`app.js`/`access-denied.html` into a richer structure (top nav with tenant badge, dedicated login screen, Phase-3-ready `.card-grid`/`.source-card` data-source picker) as per-page inline `<style>` blocks with different (indigo) colors, without initially flagging the change. Reconciled by keeping the user's structure/layout in full and swapping its color tokens + copy back to the spec's EdgeOne-blue palette and exact wording; `styles.css` removed as orphaned. `02-UI-SPEC.md`'s Checker Sign-Off and `02-02-SUMMARY.md` updated to describe the merged, final implementation.

**Resolved this session:** Plan 02-01's live verification gap is partially closed but still being actively retested. User set the required env vars in EdgeOne Makers Console and provisioned a real test IdP (Auth0). Three genuine EdgeOne edge-runtime compatibility bugs surfaced once the code reached `openid-client` internals — (1) `AbortSignal.timeout` not implemented on the runtime, (2) `response.setCookies()` deprecated in favor of `Headers`-based `Set-Cookie`, (3) `fetch` rejecting `URLSearchParams` token request bodies. All three have code fixes; the latest fetch-body fix has been pushed and needs live redeploy verification.

### Roadmap Evolution

- Phase 4.1 inserted after Phase 4: Dashboard Renderer & Insights Polish (URGENT)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 requirement | SHARE-01, SHARE-02 (shareable links, dashboard history) | Deferred to v2 | Project init |
| v2 requirement | AUTH-04 (explicit logout) | Deferred to v2 | Project init |
| v2 requirement | LIVE-01 (auto-refreshing dashboards) | Deferred to v2 | Project init |
| v2 requirement | DATA-04, DATA-05 (DNS analytics, Edge Functions metrics) | Deferred to v2 | Project init |

## Session Continuity

Last session: 2026-08-13T01:05:58.840Z
Stopped at: Phase 4 fully complete — both plans live-verified. Plan 02's Task 3 blocking checkpoint received "approved" after a full live walkthrough of all 6 verification steps (GEN-01 through GEN-04, SAVE-01, including the prompt-injection and cross-tenant negative tests). Phase 3 Plan 02 (Security Events) still not built — now the single biggest remaining gap for v1.
Resume file: .planning/phases/04-prompt-driven-dashboard-generation-save/04-02-SUMMARY.md, .planning/phases/03-tenant-scoped-data-source-selection/03-02-PLAN.md

**Next steps for the user:**

1. Decide priority: build Phase 3 Plan 02 (Security Events route — currently unbuilt, needed for DATA-02/DATA-03's full picker + cross-tenant negative test) — this is now the only unbuilt plan standing between the current state and full v1 requirements coverage.
2. Explicitly close out Phase 3 Plan 01's outstanding checkpoint — real Tencent Cloud API call already proven live via Phase 4's checkpoints, so this is likely just a documentation/sign-off step now, not new work.
3. Explicitly re-confirm Phase 2's remaining checkpoint items: refresh persists session with no re-auth, and a spoofed `?tenant_id=` query param has zero effect.
4. Run `/gsd-execute-phase 3` (targeting Plan 02) to close the last open gap.
5. **Standing reminder for future edge-functions/ work:** never add a `node:*`-only import (even inside a conditional fallback) anywhere reachable from `edge-functions/` — it will silently break the entire bundle build. If unsure a route change might have broken something, `edgeone makers dev` locally reproduces the exact build error before pushing.
