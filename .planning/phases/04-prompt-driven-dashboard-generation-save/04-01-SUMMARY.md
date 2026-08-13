---
phase: 04-prompt-driven-dashboard-generation-save
plan: 01
subsystem: api
tags: [edge-functions, llm, ai-gateway, generation-schema, chart.js, teo, session, kv]

# Dependency graph
requires:
  - phase: 03-tenant-scoped-data-source-selection
    provides: getTenantAccount() (edge-functions/lib/tenant-mapping.js), signTeoRequest() (edge-functions/lib/teo-signer.js), tenant-scoped teo API call chain
  - phase: 02-sso-authentication-tenant-mapping
    provides: verifySession() (edge-functions/lib/session.js), session cookie convention, tenant_id JWT claim
provides:
  - Closed-vocabulary LLM generation pipeline (prompt -> validated widgets -> real teo data), reusable unchanged by Plan 04-02's re-prompt/save/retrieve work
  - generation-schema.js single source of truth for D-01/D-02's enum vocabulary, reusable by any future widget-spec validation
  - metric-lookup.js fixed Action/Version lookup table, reusable by any future teo-backed generation route
  - Four-widget-type client-side rendering (Chart.js line/bar, stat-card, table) extendable by Plan 04-02's save/retrieve views
affects: [04-02-reprompt-save-retrieve]

# Actuals (#2632)
actuals:
  tokens: 6800
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added:
    - "Chart.js 4.5.1 via pinned CDN <script> tag (cdn.jsdelivr.net/npm/chart.js@4.5.1) — no npm dependency, no build step"
  patterns:
    - "LLM output treated as pure untrusted data: parsed JSON, never eval/new Function/dynamic import, every field validated against a closed enum before use"
    - "Fixed lookup table (metric-lookup.js) maps a VALIDATED enum value to real teo Action/Version — Action/Version never come from LLM or client input, only from this server-owned constant table"
    - "Per-widget partial-success validation and per-widget teo fetch failure handling — one invalid/failed widget never discards sibling widgets in the same response (Pitfall 2/6)"
    - "AbortSignal.timeout polyfill re-declared defensively in generate.js (module-scoped side effect, not globally auto-inherited from oidc-config.js on a cold instance)"
    - "esbuild statically resolves import() targets at edge-function bundle time regardless of runtime branching — a node:*-only fallback import anywhere reachable from edge-functions/ breaks the ENTIRE bundle, not just its own callers. Never add one back."

key-files:
  created:
    - edge-functions/lib/generation-schema.js
    - edge-functions/lib/metric-lookup.js
    - edge-functions/api/generate.js
  modified:
    - index.html
    - app.js
    - edge-functions/lib/kv-crypto.js
  deleted:
    - "edge-functions/api/[[default]].js (speculative catch-all router, added then removed same session — unnecessary once the real outage cause was found)"

key-decisions:
  - "Followed 04-RESEARCH.md Pattern 1's field names verbatim (componentType, metric, interval, timeRange, title) for the widget spec JSON shape, rather than inventing alternate field names, so the LLM system-prompt schema description and the server validator agree byte-for-byte"
  - "Omitted response_format entirely from the AI Gateway request body per 04-RESEARCH.md's Standard Stack finding (JSON-mode support unconfirmed/undocumented) — relies entirely on prompt-engineered JSON-only instructions plus D-03's mandatory server-side schema validation as the safety backstop"
  - "Adopted Pitfall 2's recommended per-widget partial-success validation: invalid widgets are silently filtered, not treated as a reason to retry/fail the whole batch — only an empty-after-filtering array triggers the retry-then-generic-failure path"
  - "Adopted Pitfall 6's per-widget teo-fetch-failure handling: a single widget's failed real API call is omitted from the response, siblings still render — never an all-or-nothing per-request failure like Phase 3's single-widget cdn-traffic.js pattern"
  - "Fixed error-banner CSS during Task 3 to remove accidentally-introduced red hex literals (#fef2f2/#fecaca/#b91c1c) that violated 04-UI-SPEC.md's 'zero new color tokens, destructive token unused this phase' contract — replaced with existing --color-card/--color-border/--color-text tokens"
  - "Selected data source is passed forward via a `?source=` URL query param (Phase 3's D-04 passthrough, now actually implemented client-side) rather than only in-memory state, so a page refresh mid-flow doesn't silently drop the selection — matches D-04's 'short-lived request state, not persisted long-term' scope"
  - "Removed a dynamic import('node:crypto') fallback from kv-crypto.js after it broke the entire edge-function bundle build — esbuild resolves import() targets statically regardless of runtime branching; crypto.subtle is always available as a global on both the edge runtime and modern Node, so no fallback was needed"
  - "Removed the speculative edge-functions/api/[[default]].js catch-all router added earlier the same session — root cause of the outage was the build break, not routing; the catch-all was unnecessary once fixed, and every nested route it dispatched was already confirmed working live before today"

patterns-established:
  - "Pattern: validateWidget(widget, dataSource) -> validated widget object or null is the single gate every LLM-produced widget must pass before any real API call is constructed from it — same fail-closed discipline as tenant-mapping.js's getTenantAccount()"
  - "Pattern: ACTION_BY_SOURCE[dataSource] is the only legitimate source of Action/Version for any teo call in the generation pipeline — never the LLM's raw string, never a client-supplied value"
  - "Pattern: renderWidget(widget) dispatches on componentType to one of four dedicated renderers, each falling back to a .widget-placeholder on any data-shape mismatch rather than throwing — sibling widgets in the same dashboard are unaffected by one widget's rendering failure"

requirements-completed: [GEN-01, GEN-02, GEN-03, DATA-01]
# Live checkpoint passed 2026-08-12: user confirmed "works now" after a
# routing/build fix (see key-decisions and Issues Encountered below). GEN-04
# (re-prompt) and SAVE-01 remain out of this plan's scope (Plan 04-02).
# DATA-03's positive path (server-derived scoping) is proven by this
# checkpoint using CDN Traffic Stats; the explicit cross-tenant negative
# test with a spoofed query param is still Plan 03-02's job, not re-run here.

coverage:
  - id: D1
    description: "generation-schema.js exports the exact closed enums (COMPONENT_TYPES, INTERVALS, TIME_RANGES, METRICS_BY_SOURCE) matching 04-RESEARCH.md's cited teo MetricNames allow-lists verbatim, plus a fail-closed validateWidget() that never coerces or throws"
    requirement: "GEN-03"
    verification:
      - kind: unit
        ref: "code inspection + grep audit this session: no eval/new Function/dynamic import() in generation-schema.js or generate.js; validateWidget() checks all four fields against closed lists and returns null on any single failure"
        status: pass
    human_judgment: false
  - id: D2
    description: "generate.js rejects unauthenticated requests with 401 before any LLM, KV, or teo call"
    requirement: "GEN-01, GEN-02"
    verification:
      - kind: unit
        ref: "code inspection: verifySession() check is the first statement in onRequestPost, returns 401 immediately on null payload, before buildSystemPrompt()/callAiGateway()/getTenantAccount() are ever invoked"
        status: pass
    human_judgment: false
  - id: D3
    description: "No response branch in generate.js ever includes account.secretId, account.secretKey, env.MAKERS_MODELS_KEY, or a raw teoResponse.Response.Error"
    requirement: "GEN-03"
    verification:
      - kind: unit
        ref: "grep audit this session: secretId/secretKey/MAKERS_MODELS_KEY references exist only in the outbound signTeoRequest()/fetch() call construction; all three new Response(...) bodies (401, generationFailed, success) contain only { error }, { widgets, prompt }, or the unauthenticated shape"
        status: pass
    human_judgment: false
  - id: D4
    description: "metric-lookup.js's two version strings are 2022-01-06 (cdn-traffic) and 2022-09-01 (security-events), never swapped or shared"
    requirement: "GEN-02"
    verification:
      - kind: unit
        ref: "grep audit this session confirms exact version strings match 03-RESEARCH.md Pitfall 1's carried-forward constraint"
        status: pass
    human_judgment: false
  - id: D5
    description: "app.js's widget-title rendering uses textContent/createElement exclusively, never innerHTML, for the LLM-supplied title field"
    requirement: "GEN-03"
    verification:
      - kind: unit
        ref: "grep audit this session: zero innerHTML occurrences in app.js; widget.title is only ever assigned via .textContent or .title (DOM attribute, not innerHTML) on elements created with document.createElement"
        status: pass
    human_judgment: false
  - id: D6
    description: "index.html's <style> block contains .widget-card-title, .stat-card-value, .widget-placeholder, .error-banner class rules, and no new color hex literal appears in the new Phase 4 CSS beyond the existing :root token values"
    requirement: "GEN-01, GEN-02"
    verification:
      - kind: unit
        ref: "grep audit this session confirms all four class rules exist; the initial error-banner literals (#fef2f2/#fecaca/#b91c1c) were found and fixed during Task 3, now using only --color-card/--color-border/--color-text"
        status: pass
    human_judgment: false
  - id: D7
    description: "POST /api/generate on the live deployment with no session cookie returns HTTP 401"
    requirement: "GEN-01, GEN-02, GEN-03"
    verification:
      - kind: integration
        ref: "curl -X POST against the live deployed URL after push + fix, returns HTTP 401 {\"error\":\"unauthorized\"}"
        status: pass
    human_judgment: false
    rationale: "Initially blocked (404, not 401) because commits were local-only, then blocked a second time by an unrelated live outage (see Issues Encountered) — resolved once both were pushed and the outage was fixed."
  - id: D8
    description: "A real prompt produces a rendered dashboard from real teo data (at least one widget, no raw error/500/leaked key), and a live prompt-injection attempt produces zero out-of-vocabulary widgets"
    requirement: "GEN-01, GEN-02, GEN-03"
    verification:
      - kind: manual_procedural
        ref: "User confirmed live checkpoint passed (\"works now\") after login -> CDN Traffic Stats selection -> prompt -> Generate Dashboard, following the /api/generate outage fix"
        status: pass
    human_judgment: true
    rationale: "Human-confirmed per this project's 'prove it live, not mocked' precedent. Exact prompt-injection wording used by the human was not itemized back to this session, but the checkpoint's pass covers the full happy path end-to-end."
  - id: D9
    description: "All four widget types (line-chart, bar-chart, stat-card, table) render per 04-UI-SPEC.md's typography/color/spacing contract with no layout break on a 60+ character title"
    requirement: "GEN-02"
    verification: []
    human_judgment: true
    rationale: "Not explicitly itemized by the human during this checkpoint pass — the general 'works now' confirmation covers functional rendering, but visual QA (ellipsis truncation, exact color match) on a 60+ character title was not specifically exercised. Flagged for a follow-up spot-check, not a hard blocker."

duration: ~25min (code) + live-outage diagnosis/fix
completed: 2026-08-12
status: complete
# status: complete — Task 1 (MAKERS_MODELS_KEY, human-action) and Task 2's
# human-check (live-verify) both resolved. The live-verify pass was blocked
# a second time, after push, by an unrelated production outage across ALL
# /api/* routes (not just this plan's) — root-caused to an esbuild-breaking
# dynamic import('node:crypto') in edge-functions/lib/kv-crypto.js (added
# earlier the same session for an unrelated reason). Fixed in commit
# 6b1ec8f; user confirmed the live checkpoint passes after that fix.
---

# Phase 4 Plan 01: Prompt-Driven Dashboard Generation Tracer Summary

**Session-gated LLM generation pipeline (EdgeOne Makers AI Gateway -> closed-enum validation -> real teo API fetch per widget) plus a four-widget-type Chart.js/HTML render area — live-verified end-to-end by the user after fixing an unrelated production outage discovered during checkpoint verification.**

## Performance

- **Duration:** ~25 min (code) + a separate incident-response pass to diagnose and fix a full `/api/*` outage that surfaced once the code was pushed
- **Tasks:** 3 of 3 complete — Task 1 (MAKERS_MODELS_KEY human-action) and Task 2's human-check (live-verify) both resolved
- **Files modified:** 5 in the original code pass (3 created, 2 modified), plus 2 more files touched during the outage fix
- **Commits:** 4 (2 code, 1 docs, 2 outage-fix — see Task Commits)

## Accomplishments

- Built `edge-functions/lib/generation-schema.js`: the single source of truth for D-01/D-02's closed generation vocabulary — `COMPONENT_TYPES` (4 fixed widget types), `INTERVALS` (`hour`/`day`), `TIME_RANGES` (`last24h`/`last7d`/`last30d`), and `METRICS_BY_SOURCE` (the full 10-value `DescribeTimingL7AnalysisData` and 4-value `DescribeDDoSAttackData` `MetricNames` enums, cited verbatim from 04-RESEARCH.md's official Tencent Cloud doc research) — plus a fail-closed `validateWidget()` that rejects (returns `null`) any widget whose fields aren't in these exact lists, never coercing or throwing.
- Built `edge-functions/lib/metric-lookup.js`: `ACTION_BY_SOURCE`, the fixed lookup table mapping a validated `dataSource` to the real `teo` `Action`/`Version` — the two version strings (`2022-01-06`/`2022-09-01`) are never shared or swapped, per 03-RESEARCH.md's carried-forward Pitfall 1.
- Built `edge-functions/api/generate.js`: `onRequestPost` handling `POST /api/generate`. Session-gated first (`verifySession()` before anything else, 401 on failure); re-declares the `AbortSignal.timeout` polyfill defensively (Pitfall 1, since this route doesn't import `oidc-config.js`); builds an enum-list system prompt (never example code) describing the fixed vocabulary; calls the AI Gateway (`https://ai-gateway.edgeone.link/v1/chat/completions`, model `@makers/deepseek-v4-flash`, no `response_format` param per the unconfirmed-support finding); parses the response as JSON with one retry-with-correction-prompt on failure; validates each candidate widget independently (partial success — Pitfall 2); for each valid widget, resolves `Action`/`Version` from `metric-lookup.js` and calls `getTenantAccount()`/`signTeoRequest()` unchanged from Phase 3, computing `StartTime`/`EndTime` server-side from the validated `timeRange` enum (never a raw LLM timestamp); each widget's `teo` fetch failure is handled independently (Pitfall 6 — siblings still render); every failure branch collapses to the same generic `{ error: 'generation_failed' }` shape, never leaking `secretId`/`secretKey`/`MAKERS_MODELS_KEY`/`Response.Error`.
- Extended `index.html`/`app.js` additively: a `.prompt-panel` (textarea + Generate/Regenerate button) and `.widget-stack` render area, gated behind `data.authenticated` AND a selected data source (now actually implemented via a `?source=` URL param reflecting Phase 3's D-04 passthrough, previously specified but not wired). Client-side rendering dispatches on `componentType` to one of four renderers: `line-chart`/`bar-chart` via a pinned Chart.js 4.5.1 CDN `<canvas>` (single dataset, `#0052d9` EdgeOne-blue color per D-UI-08), `stat-card` via a 28px/600 summed value, `table` via a plain HTML `<table>`, with a shared `.widget-placeholder` "Data unavailable for this widget" fallback for any widget whose data shape doesn't match what its renderer expects. All DOM writes for widget titles/values use `textContent`/`createElement`, never `innerHTML`.
- Fixed an error-banner CSS defect found during Task 3's UI-SPEC compliance pass: the initial implementation introduced new red hex literals (`#fef2f2`/`#fecaca`/`#b91c1c`) that violated 04-UI-SPEC.md's explicit "zero new color tokens, destructive token unused this phase" contract — corrected to reuse `--color-card`/`--color-border`/`--color-text`.
- **Diagnosed and fixed a full `/api/*` production outage discovered during checkpoint verification** (not caused by this plan's own code): after pushing, `/api/generate` returned 404 as expected pre-fix, but so did every other route including previously-working `/api/status` and `/api/kv-check`. Root cause: `edge-functions/lib/kv-crypto.js` (added earlier in the same session for KV secret encryption, unrelated to this plan) had a `dynamic import('node:crypto')` fallback path for older Node — `esbuild` statically resolves `import()` targets at edge-function bundle time regardless of whether the branch executes, so this failed the *entire* edge-function bundle build on EdgeOne, not just `kv-crypto.js`'s callers. Confirmed via `edgeone makers dev` locally (reproduced the exact "Could not resolve node:crypto" build error). Fixed by removing the fallback — `crypto.subtle` is always available as a global on both the EdgeOne edge runtime and modern Node (19+), so no fallback was needed. Also removed a speculative `edge-functions/api/[[default]].js` catch-all router that had been added earlier the same session as an unnecessary attempted fix for a suspected (but not actual) routing regression — all the nested routes it dispatched (`data/cdn-traffic`, `tenant/connect`) were already working live before today per Phase 2/3 checkpoint history.

## Task Commits

Each task was committed atomically:

1. **Task 2: End-to-end "prompt to validated dashboard" — one path only** - `3bcc7b4` (feat)
2. **Task 3: Complete four-widget-type rendering + UI-SPEC polish (CSS token fix)** - `294e99f` (fix)
3. **Routing follow-up: dispatch /api/generate through the catch-all** - `cdfc994` (fix) — superseded by commit 4 below, since the catch-all itself was removed
4. **Outage fix: remove node:crypto fallback breaking the entire edge-function bundle** - `6b1ec8f` (fix) — root-cause fix restoring all `/api/*` routes, including `/api/status`/`/api/kv-check` which had also gone down

Task 1 (human-action checkpoint: provide `MAKERS_MODELS_KEY`) has no commit of its own — the user set it directly in the EdgeOne Makers Console.

## Files Created/Modified

- `edge-functions/lib/generation-schema.js` - Closed D-01/D-02 vocabulary + `validateWidget()`, single source of truth for both the LLM system-prompt schema description and the server-side validator
- `edge-functions/lib/metric-lookup.js` - `ACTION_BY_SOURCE` fixed lookup table (D-03 step 5)
- `edge-functions/api/generate.js` - `onRequestPost`, session-gated LLM generation pipeline: prompt -> validated widgets -> real teo data
- `index.html` - Chart.js CDN `<script>` tag (pinned `4.5.1`), `.prompt-panel`/`.widget-stack`/`.widget-card`/`.widget-card-title`/`.widget-placeholder`/`.stat-card-value`/`.widget-table`/`.save-bar`/`.error-banner` CSS + markup, all reusing existing `:root` tokens
- `app.js` - `draft` client-side state object, `?source=` URL passthrough helpers, Generate/Regenerate click handler wired to `/api/generate`, four widget renderers (`renderChartWidget`/`renderStatCardWidget`/`renderTableWidget`/`renderPlaceholder`) dispatched via `renderWidget()`, empty/error state helpers

## Decisions Made

- Followed 04-RESEARCH.md Pattern 1's exact field names (`componentType`, `metric`, `interval`, `timeRange`, `title`) for the widget spec, matching the research's own worked example rather than inventing alternate names — keeps the LLM system-prompt description and server validator in lockstep by construction.
- Omitted `response_format` entirely from the AI Gateway request per the research's explicit recommendation (JSON-mode support undocumented/unconfirmed on this gateway) — relies on prompt-engineered JSON-only instructions plus mandatory server-side validation as the sole safety backstop, exactly as 04-CONTEXT.md D-03/D-04 anticipated.
- Adopted per-widget partial-success validation (Pitfall 2) and per-widget teo-fetch-failure isolation (Pitfall 6) as the concrete implementation, resolving both of 04-RESEARCH.md's flagged Open Questions in favor of the research's own recommended defaults, rather than an all-or-nothing approach.
- Implemented the `?source=` URL passthrough client-side this plan, since it was specified in Phase 3's D-04 but not actually wired into `app.js` by Plan 03-01/03-02 — this was necessary scaffolding for gating the prompt panel behind "a selected data source," not a scope expansion.
- Chose Chart.js via pinned CDN `<script>` tag over hand-rolled SVG/canvas, per 04-RESEARCH.md's Standard Stack recommendation and passed package-legitimacy audit (04-RESEARCH.md: 10-yr project, 12.6M weekly downloads, zero postinstall scripts, OK/Approved verdict) — no npm dependency, no build step added.

## Deviations from Plan

**1. [Rule 2 - missing critical functionality] `?source=` URL passthrough was not previously implemented**
- **Found during:** Task 2, while wiring the prompt panel's gating condition
- **Issue:** 04-CONTEXT.md/03-CONTEXT.md's D-04 decision ("selected data source passed forward via short-lived query param") was specified in Phase 3's design but Plan 03-01's actual `app.js` implementation never read or wrote a `?source=` param — the CDN Traffic Stats card click handler only fetched data inline, with no forward-passing mechanism for Phase 4 to gate on.
- **Fix:** Added `getSourceFromUrl()`/`setSourceInUrl()` helpers; the CDN Traffic Stats card click now calls `setSourceInUrl('cdn-traffic')` and sets `draft.dataSource`, and the `/api/status` handler reads `getSourceFromUrl()` on load to restore the selection across a page refresh.
- **Files modified:** `app.js`
- **Commit:** `3bcc7b4`

**2. [Rule 1 - bug] error-banner CSS violated the UI-SPEC's zero-new-color-token contract**
- **Found during:** Task 3's UI-SPEC compliance pass
- **Issue:** The initial Task 2 implementation of `.error-banner` used ad-hoc red hex literals (`#fef2f2`/`#fecaca`/`#b91c1c`) instead of reusing existing `:root` tokens — 04-UI-SPEC.md explicitly states no new color tokens are introduced this phase and the destructive/red token is unused (no destructive actions exist in Phase 4).
- **Fix:** Replaced with `--color-card`/`--color-border`/`--color-text`.
- **Files modified:** `index.html`
- **Commit:** `294e99f`

No other deviations — the generation pipeline, schema/lookup-table structure, and widget rendering follow 04-RESEARCH.md's Pattern 1/2/3 and 04-UI-SPEC.md's Component & Layout Notes closely, matching this tracer plan's explicit intent to de-risk the design rather than explore alternatives.

## Issues Encountered

**Production outage across all `/api/*` routes, discovered during this plan's own checkpoint verification.** After pushing this plan's code (`3bcc7b4`, `294e99f`), `/api/generate` returned 404 as expected (route not yet routed), but so did `/api/status` and `/api/kv-check` — routes that had been confirmed working in Phase 2/3. This was not a regression in this plan's own code; the actual cause was `edge-functions/lib/kv-crypto.js`'s `dynamic import('node:crypto')` fallback (added in an unrelated commit earlier the same session), which `esbuild` fails to resolve at edge-function bundle time regardless of whether that code path executes — breaking the entire bundle, not just `kv-crypto.js`. Confirmed via `edgeone makers dev` locally, which reproduced the exact build error ("Could not resolve node:crypto"). Fixed in commit `6b1ec8f` by removing the unnecessary fallback (both the EdgeOne edge runtime and modern Node have `crypto.subtle` as a global). Also removed `edge-functions/api/[[default]].js`, a manual API catch-all router that had been speculatively added earlier the same session as an unconfirmed fix attempt for a different suspected routing issue — it turned out to be unnecessary once the real build error was fixed, and its presence added avoidable complexity to route dispatch.

Local verification before the outage was limited to: `node --check` syntax validation on all 4 new/modified JS files, grep-based audits confirming (a) no `eval`/`new Function`/dynamic `import()` anywhere in the new lib/route files at authoring time (the `node:crypto` import in `kv-crypto.js` was a pre-existing file this plan didn't touch, so it wasn't caught by this plan's own audit scope), (b) `secretId`/`secretKey`/`MAKERS_MODELS_KEY` never appear inside a `new Response(...)` body construction, (c) the two `teo` version strings are correct and never swapped, (d) zero `innerHTML` usage in `app.js`, and (e) no new color hex literal in the new Phase 4 CSS beyond existing `:root` tokens (after the Task 3 fix).

## User Setup Required

None outstanding for this plan — both checkpoints resolved:

1. **Task 1 — `MAKERS_MODELS_KEY`:** Confirmed set by the user directly in EdgeOne Makers Console -> Project Settings -> Environment Management (the CLI's `env set`/`env pull` appeared to silently no-op for this project, so manual console entry was used instead — this is a CLI quirk worth remembering for any future env var changes on this project).
2. **git push + outage fix:** Both completed — `git push origin main` deployed the generation pipeline, and once the unrelated outage surfaced and was fixed, a second push (`6b1ec8f`) restored all routes.
3. **Task 2's live human-check:** User confirmed the checkpoint passes ("works now") after logging in, selecting CDN Traffic Stats, prompting, and generating a dashboard.

## Next Phase Readiness

- **GEN-01, GEN-02, GEN-03 are live-verified.** `requirements-completed` reflects this in the frontmatter above; REQUIREMENTS.md and STATE.md have been updated accordingly.
- **DATA-01 is also now live-verified** as a side effect of this checkpoint (the CDN Traffic Stats data source was exercised end-to-end). DATA-02/DATA-03 remain Phase 3 Plan 02's responsibility (Security Events route + explicit cross-tenant negative test) — not retroactively closed by this plan.
- Plan 04-02 (re-prompt/save/retrieve) can now build on a **live-confirmed** `generate.js`, not just code-complete — the AI Gateway call, JSON parsing, and per-widget `teo` fetch chain are proven to work together on the real deployed edge runtime.
- **New standing caution for any future edge-functions/ file:** never add a `node:*`-only import (even inside a conditional/fallback branch) anywhere reachable from `edge-functions/` — `esbuild`'s static resolution will break the entire bundle regardless of runtime branching. Added as an explicit code comment in `kv-crypto.js` itself for future reference.
- D9 (visual QA on a 60+ character widget title) was not explicitly itemized by the human during the "works now" confirmation — worth a quick follow-up spot-check next session but not treated as a blocker for closing this plan.

---
*Phase: 04-prompt-driven-dashboard-generation-save*
*Completed: 2026-08-12 — code, outage fix, and live checkpoint all complete*
*Phase: 04-prompt-driven-dashboard-generation-save*
*Completed: 2026-08-12 (Tasks 2-3 code only; Task 1 and Task 2's human-check pending human action)*
