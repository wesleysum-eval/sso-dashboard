---
phase: 04-prompt-driven-dashboard-generation-save
plan: 02
subsystem: api
tags: [edge-functions, kv, session, save-retrieve, re-prompt]

# Dependency graph
requires:
  - phase: 04-prompt-driven-dashboard-generation-save (Plan 01)
    provides: "/api/generate (already accepts previousSpec unchanged), verifySession(), the draft client-side state object, the four-widget-type render pipeline"
  - phase: 02-sso-authentication-tenant-mapping
    provides: verifySession() (edge-functions/lib/session.js), session cookie convention, tenant_id JWT claim
provides:
  - "POST /api/dashboard — session-gated save to KV (dashboard:<tenant_id>:<dashboard_id>), tenant_id from verifySession() only, generic save_failed on any error"
  - "GET /api/dashboard/:id — session-gated retrieve, EdgeOne bracket dynamic route, tenant_id re-derived from session — a cross-tenant guessed id fails identically to a missing one"
  - "Save Dashboard UI: appears after a successful generation, renders the Saved confirmation + bookmarkable /?dashboard=<id> link from the in-memory POST response (never an immediate re-fetch)"
  - "Read-only retrieval view (?dashboard=<id>): fetches the saved dashboard on page load, hides prompt/Generate/Save controls entirely, shows a full-page Dashboard not found. state on any failure"
affects: []

# Actuals (#2632)
actuals:
  tokens: 4627
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KV key requires BOTH a session-derived prefix AND a URL-derived suffix to match (dashboard:<tenant_id>:<dashboard_id>) — the same tenant-derivation-from-session discipline as every prior route (session.js/tenant-mapping.js), now applied to a write path instead of just a read path"
    - "Save-confirmation renders from the already-in-memory mutation response, never an immediate re-fetch of the just-written resource — sidesteps KV's documented 60-second eventual-consistency window (Pitfall 5)"
    - "Read-only view toggling by hiding entire control containers (display:none on the .prompt-panel/.save-bar containers), not by disabling inputs — matches D-UI-07's 'no edit-and-re-save flow' intent structurally, not just visually"

key-files:
  created:
    - edge-functions/api/dashboard.js
    - edge-functions/api/dashboard/[id].js
  modified:
    - index.html
    - app.js

key-decisions:
  - "GEN-04 (re-prompt/Regenerate) required no new client-side wiring this plan — Plan 04-01's Task 2 had already wired previousSpec into the single Generate/Regenerate button and its finally() label toggle; this plan's contribution to GEN-04 was documentation (a code comment) plus the live verification in Task 3, not new implementation"
  - "draft.data was added as a field mirroring draft.spec exactly (each widget in Plan 04-01's response shape already carries its own fetched teo data merged in) rather than introducing a separate raw-data extraction path server-side — kept the save payload's { spec, data, prompt } shape matching 04-RESEARCH.md's Pattern 2 without duplicating state"
  - "Retrieval-view gating was placed inside the existing /api/status callback (gated on data.authenticated) rather than as an independent top-level fetch, to avoid a race between the normal generation-flow visibility logic and renderRetrievalView() fighting over the same #prompt-section/#dashboard-main display properties"

patterns-established:
  - "Pattern: a KV write path (dashboard.js) follows the identical verifySession()-first, fail-closed-on-missing-binding, generic-error-shape structure as every existing KV read path in this codebase — no new failure-handling convention was introduced for the write case"

requirements-completed: [GEN-04, SAVE-01]

coverage:
  - id: D1
    description: "dashboard.js and dashboard/[id].js both return HTTP 401 with no session cookie, before any KV call"
    requirement: "SAVE-01"
    verification:
      - kind: integration
        ref: "curl -X POST against the live deployed URL, and curl GET /api/dashboard/anything, both returned exactly 401 {\"error\":\"unauthorized\"} this session"
        status: pass
    human_judgment: false
  - id: D2
    description: "dashboard/[id].js reads tenant_id exclusively from verifySession(), never from params or the request body — only params.id is read, and only for the dashboard_id segment"
    requirement: "SAVE-01"
    verification:
      - kind: unit
        ref: "grep audit this session: the only params.* reference in edge-functions/api/dashboard/[id].js is params.id inside the KV get() key construction; no tenant/account-scoping value is read from params or the request body"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both dashboard.js and dashboard/[id].js's failure branches return only { error: 'save_failed' } or { error: 'not_found' } — never a stack trace or raw KV error message"
    requirement: "SAVE-01"
    verification:
      - kind: unit
        ref: "code inspection this session: every non-2xx/non-success return in both files constructs one of exactly these two generic bodies; no catch block forwards its caught error object"
        status: pass
    human_judgment: false
  - id: D4
    description: "app.js contains exactly one Generate/Regenerate button element toggling its own label, not two separate buttons"
    requirement: "GEN-04"
    verification:
      - kind: unit
        ref: "grep audit this session: exactly one #generate-btn element in index.html/app.js; app.js's finally() block sets generateBtn.textContent conditionally on draft.spec rather than swapping between two DOM elements"
        status: pass
    human_judgment: false
  - id: D5
    description: "The save-success render path uses the POST /api/dashboard response body directly — no code path calls GET /api/dashboard/:id immediately after a successful save"
    requirement: "SAVE-01"
    verification:
      - kind: unit
        ref: "grep audit this session: the only fetch('/api/dashboard/'...) call site in app.js is inside renderRetrievalView(), invoked only from the ?dashboard=<id> page-load path — saveDashboard()'s success branch builds the confirmation link from the already-parsed POST response body only"
        status: pass
    human_judgment: false
  - id: D6
    description: "In the retrieval view (?dashboard=<id> present), the prompt textarea, Generate/Regenerate button, and Save button are not present in the rendered DOM (their containers are display:none or absent)"
    requirement: "SAVE-01"
    verification:
      - kind: unit
        ref: "code inspection this session: renderRetrievalView() sets promptSection.querySelector('.prompt-panel').style.display = 'none' and #save-bar.style.display = 'none' unconditionally on entry, before any fetch resolves"
        status: pass
    human_judgment: false
  - id: D7
    description: "Regenerate reflects a refinement prompt without returning to data-source selection, and the previous dashboard stays visible during the Generating… state; Save shows Saved ✓ plus a bookmarkable link; opening that link in a new tab (same session) shows the saved dashboard read-only with prompt/Generate/Save controls hidden"
    requirement: "GEN-04, SAVE-01"
    verification:
      - kind: manual
        ref: "Task 3 live walkthrough against the deployed URL — human typed 'approved' confirming refinement prompt correctly reflected, previous dashboard stayed visible during Generating…, Saved ✓ + bookmarkable link appeared, and the same-session retrieval rendered read-only with prompt/Generate/Save controls hidden"
        status: pass
    human_judgment: true
    rationale: "Required a real browser session with a live IdP login and the deployed EdgeOne URL — qualitative judgment of whether the refined dashboard content reflects the new prompt, and visual confirmation of hidden controls, could not be asserted by a unit/grep check. Confirmed via Task 3's checkpoint; human responded 'approved'."
  - id: D8
    description: "All five ROADMAP Phase 4 success criteria hold end-to-end against the live deployment, including the GEN-03 prompt-injection negative test and the SAVE-01 cross-tenant negative test"
    requirement: "GEN-01, GEN-02, GEN-03, GEN-04, SAVE-01"
    verification:
      - kind: manual
        ref: "Task 3 live walkthrough (checkpoint:human-verify, gate=\"blocking\") — human confirmed all 6 how-to-verify steps passed: prompt input, real generated data, prompt-injection negative test (zero out-of-vocabulary widgets), re-prompt without returning to data-source selection, save+retrieve+cross-tenant negative test (second tenant's session returned 'Dashboard not found', never the first tenant's data), and a fresh full end-to-end walkthrough with no manual server intervention. Human typed 'approved'."
        status: pass
    human_judgment: true
    rationale: "Task 3 is an explicit checkpoint:human-verify with gate=\"blocking\" — never auto-approved regardless of workflow.auto_advance, per the task's own acceptance_criteria. Human performed the live walkthrough and typed 'approved'."

duration: ~20min (code) + live verification
completed: 2026-08-13
status: complete
# status: complete — all 3 tasks resolved. Tasks 1-2 (code) were implemented
# and automated-verified live against the deployed URL. Task 3 (the full
# live-verification checkpoint covering all 5 ROADMAP Phase 4 criteria) has
# now received the human's "approved" response, confirming all six
# how-to-verify steps passed, including the GEN-03 prompt-injection negative
# test and the SAVE-01 cross-tenant negative test. This plan and Phase 4 are
# fully closed out.
---

# Phase 4 Plan 02: Re-Prompt/Regenerate + Save/Retrieve Summary

**KV-backed dashboard save/retrieve (`dashboard:<tenant_id>:<dashboard_id>`) plus a Save Dashboard UI and a read-only `/?dashboard=<id>` retrieval view — closing the loop on Plan 04-01's generation tracer. GEN-04 (re-prompt) required no new server-side work; it was already wired into Plan 04-01's Generate/Regenerate button.**

## Performance

- **Duration:** ~20 min (code) + live human verification (Task 3)
- **Tasks:** 3 of 3 complete (Task 1: save/retrieve routes; Task 2: re-prompt/Save/retrieval UI; Task 3: full live-verification checkpoint — human responded "approved").
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Built `edge-functions/api/dashboard.js`: `onRequestPost` — session-gated first (`verifySession()` before any KV call, 401 on failure, identical first-branch pattern to every other route in this codebase). Fails closed on a missing `my_kv` binding. Generates `dashboardId` via `crypto.randomUUID()` (confirmed available on this runtime per 04-RESEARCH.md). Writes `dashboard:<tenant_id>:<dashboardId>` → `{ spec, data, prompt, createdAt }`, with `tenant_id` sourced exclusively from `verifySession()`, never the request body. Returns `{ dashboardId }` on success, `{ error: 'save_failed' }` on any failure — never a raw KV error.
- Built `edge-functions/api/dashboard/[id].js`: `onRequestGet` using EdgeOne's bracket dynamic-routing convention (`context.params.id`). Same session-first 401 guard. Reads `dashboard:<tenant_id>:<params.id>` — the KV key requires BOTH the session-derived tenant prefix AND the URL's id to match, so a different tenant's session guessing/enumerating this tenant's `dashboard_id` still resolves nothing (their session resolves their own tenant prefix, not this tenant's). A missing key and a cross-tenant mismatch both return the byte-identical `{ error: 'not_found' }` — never distinguished. On success, returns the raw stored JSON directly (already the exact `{ spec, data, prompt, createdAt }` shape the client needs).
- Extended `app.js`: added `draft.data` (mirrors `draft.spec` for save-payload shape compatibility — each widget already carries its own fetched data per Plan 04-01's response shape). Added `showSaveBar()`/`saveDashboard()`: a Save Dashboard button appears below the widget stack after any successful generation; on click it disables/relabels to "Saving…", `POST`s `{ spec, data, prompt }` to `/api/dashboard`, and on success replaces itself with a "Saved ✓" confirmation plus a bookmarkable `/?dashboard=<id>` link built entirely from the in-memory response (never an immediate `GET /api/dashboard/:id` re-fetch, sidestepping KV's documented 60-second eventual-consistency window). Added `renderRetrievalView()`: on page load, if `?dashboard=<id>` is present and the user is authenticated, hides the prompt textarea/Generate-Regenerate button/Save button entirely (not just disabling them), shows a "Loading dashboard…" state, fetches `GET /api/dashboard/:id`, and renders the saved widgets read-only on success or a full-page "Dashboard not found." state on any failure (missing id or cross-tenant — same copy, same styling pattern as `access-denied.html`'s centered card).
- Extended `index.html`: added `.save-bar-btn`/`.save-confirmation`/`.save-error-text`/`.widget-loading-state` CSS (reusing existing `:root` tokens only, no new colors introduced — consistent with `04-UI-SPEC.md`'s zero-new-token contract). Added a dedicated `#not-found-screen` centered card. Added `#dashboard-main` id and a `#save-bar` container inside `#prompt-section` for the new Save UI.
- Confirmed GEN-04 (re-prompt/Regenerate) required **zero new implementation** this plan — Plan 04-01's Task 2 had already wired `previousSpec: isRePrompt ? draft.spec : undefined` into the single Generate/Regenerate button's click handler and its `finally()` label toggle. This plan's only touch to that code path was a clarifying doc comment.

## Task Commits

Each task was committed atomically:

1. **Task 1: Save + retrieve — KV-backed dashboard persistence (SAVE-01)** - `aa241a9` (feat)
2. **Task 2: Re-prompt/refine UI + Save/retrieve UI (GEN-04, SAVE-01)** - `125b809` (feat)
3. **Task 3: Full live verification — all five ROADMAP Phase 4 success criteria** - `checkpoint:human-verify`, `gate="blocking"` — no code commit (it is a live-verification gate, not a code change). Human walked through all 6 how-to-verify steps against the deployed URL and responded **"approved"**, confirming: (a) all five ROADMAP Phase 4 success criteria hold against the live deployment, (b) the GEN-03 prompt-injection negative test produced zero out-of-vocabulary widgets, (c) the SAVE-01 cross-tenant negative test confirmed a different tenant's session cannot retrieve this tenant's saved dashboard.

**Plan metadata commit:** this SUMMARY.md, plus STATE.md/ROADMAP.md/REQUIREMENTS.md updates, committed together immediately following this document (per the atomic close-out convention: production commits → SUMMARY commit only after all tasks, including checkpoints, are settled). Plan 04-02 and Phase 4 are now fully closed.

## Files Created/Modified

- `edge-functions/api/dashboard.js` - `onRequestPost`, session-gated KV save (SAVE-01)
- `edge-functions/api/dashboard/[id].js` - `onRequestGet`, session-gated KV retrieve via EdgeOne bracket dynamic routing, cross-tenant-safe by construction (D-06)
- `app.js` - `draft.data` field, `showSaveBar()`/`saveDashboard()`/`showSaveError()` Save UI, `renderRetrievalView()` read-only retrieval view, `getDashboardIdFromUrl()` helper, retrieval-mode gating inside the existing `/api/status` callback
- `index.html` - Save UI CSS (`.save-bar-btn`, `.save-confirmation`, `.save-error-text`, `.widget-loading-state`), `#not-found-screen` centered-card markup, `#dashboard-main` id, `#save-bar` container

## Decisions Made

- Treated GEN-04 as already-satisfied by Plan 04-01's implementation rather than re-implementing the re-prompt wiring — verified via code inspection that `previousSpec` was already correctly threaded through the single Generate/Regenerate button before writing any new code for this plan.
- Added `draft.data` as a field mirroring `draft.spec` exactly (rather than a separate raw-data extraction), since Plan 04-01's `/api/generate` response shape already merges each widget's fetched `teo` data into the spec array — no server-side change was needed or made to produce a genuinely separate "data" payload.
- Placed the retrieval-view gate inside the existing `/api/status` callback's `data.authenticated` branch rather than as an independent top-level `fetch()`, specifically to prevent a race between the normal generation-flow visibility logic (`promptSection.style.display = ...`) and `renderRetrievalView()`'s own visibility toggling — whichever resolved last would otherwise silently undo the read-only view's hidden controls.
- Kept the `.save-bar` container permanently present in the DOM (built via `index.html`, populated/cleared by `app.js`) rather than dynamically inserting/removing it, matching the existing `.error-banner`/`.data-source-result` pattern already established in Plan 04-01/03-01.

## Deviations from Plan

None - plan executed exactly as written for Tasks 1-2. No Rule 1-3 auto-fixes were needed; no Rule 4 architectural questions arose. The one item worth flagging (GEN-04 requiring no new code) was anticipated by the plan itself ("This is a pure client-side extension... no server-side change is needed here") and confirmed true on inspection, not a deviation from it.

## Issues Encountered

None during Tasks 1-2's implementation or their automated `<verify>` checks (both passed live against the deployed URL on the first attempt, unlike Plan 04-01's outage). Task 3's live human-verification checkpoint was performed and passed on the first walkthrough — no failed steps reported, no re-attempt needed.

**Pre-existing, out-of-scope note (not this plan's issue):** the working tree contains uncommitted/interleaved debugging commits from the user's own concurrent session (`ac24edf`/`78d8683`/`5690a87` — `DATA_DEBUG` diagnostics and a `DescribeTimingL7AnalysisData` API-version fix in `cdn-traffic.js`/`tenant-mapping.js`/`metric-lookup.js`) that landed on `main` between this plan's Task 1 and Task 2 commits. These were explicitly out of this plan's declared file scope (`edge-functions/api/dashboard.js`, `edge-functions/api/dashboard/[id].js`, `index.html`, `app.js`) and were left untouched — verified via `git show --stat` on both of this plan's own commits that neither touched `cdn-traffic.js` or `tenant-mapping.js`. As of this plan's close-out, `edge-functions/api/data/cdn-traffic.js` and `edge-functions/lib/tenant-mapping.js` still carry a further uncommitted `DATA_DEBUG` diagnostic diff from the user's own in-progress work — left untouched and uncommitted by this close-out, per explicit instruction.

## User Setup Required

None outstanding — both routes use the existing `my_kv` binding (bound since Phase 1) and the existing `SESSION_SIGNING_KEY`/session cookie convention, with no new environment variable or service dependency introduced. Task 3's precondition (`MAKERS_MODELS_KEY` set, second real IdP test session for a different tenant_id) was satisfied and the live walkthrough completed successfully.

## Next Phase Readiness

**Task 3 — Full live verification — all five ROADMAP Phase 4 success criteria — PASSED.** Human completed the live walkthrough against the deployed URL and responded **"approved"**, confirming all six how-to-verify steps:

1. **GEN-01 (prompt input):** confirmed — free-text prompt accepted, no character-count error.
2. **GEN-02 (real generated dashboard):** confirmed — at least one widget rendered with real (non-mocked) data.
3. **GEN-03 (constrained vocabulary, negative test):** confirmed — the prompt-injection attempt produced zero out-of-vocabulary widgets; no 500 or raw model-error text surfaced.
4. **GEN-04 (re-prompt without returning to data-source selection):** confirmed — Regenerate reflected the refinement prompt without re-showing the data-source selection screen.
5. **SAVE-01 (save, retrieve, cross-tenant negative test):** confirmed — Save produced a bookmarkable link; same-session retrieval rendered read-only; a second tenant's session requesting the same URL returned "Dashboard not found," never the first tenant's data.
6. **Full end-to-end (ROADMAP criterion 5):** confirmed — login → data source → prompt → generate → refine → save → retrieve completed against the live deployed URL with no manual server intervention.

**Phase 4 (Prompt-Driven Dashboard Generation & Save) is now fully complete.** All five requirements (GEN-01, GEN-02, GEN-03, GEN-04, SAVE-01) are live-verified. STATE.md, ROADMAP.md, and REQUIREMENTS.md are updated accordingly in this close-out's metadata commit.

**Outstanding project-wide (not blockers for this plan, carried forward in STATE.md):**
- Phase 3 Plan 02 (Security Events route, `edge-functions/api/data/security-events.js`) is still not built — needed for DATA-02/DATA-03's full picker + cross-tenant negative test.
- Phase 2 Plan 02 Task 2's refresh-persistence and spoofed-`tenant_id`-query-param re-confirmations are still outstanding (login itself already confirmed live).
- Phase 3 Plan 01 Task 2's checkpoint is very likely satisfied as a side effect of Phase 4's live data pulls, but has not been explicitly re-confirmed/closed as its own checkpoint.

---
*Phase: 04-prompt-driven-dashboard-generation-save*
*Tasks 1-2 completed: 2026-08-12 — code pushed and automated-verified live*
*Task 3 completed: 2026-08-13 — human typed "approved" after a full live walkthrough of all 6 verification steps*
*Plan 04-02 and Phase 4: fully complete*
