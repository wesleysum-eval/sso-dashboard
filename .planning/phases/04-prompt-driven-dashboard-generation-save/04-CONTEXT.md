# Phase 4: Prompt-Driven Dashboard Generation & Save - Context

**Gathered:** 2026-08-12 (auto mode — no live user available; decisions are Claude-selected recommended defaults, replicating 03-CONTEXT.md's auto-mode framing/format for consistency)
**Status:** Ready for planning — pending resolution of one open question (LLM provider/API key, see Claude's Discretion)

<domain>
## Phase Boundary

A logged-in user who has already selected a data source (Phase 3: CDN Traffic Stats or Security Events, tenant-scoped via `verifySession()` → `getTenantAccount()` → `signTeoRequest()`) types a natural-language prompt describing the dashboard/view they want. The app generates a read-only dashboard (charts/tables) from that data source reflecting the prompt, using only the fixed, constrained query/component vocabulary defined below — never arbitrary generated code executed against live APIs. The user can re-prompt to refine/regenerate without returning to data-source selection, and can save the resulting dashboard for later retrieval under their account. This phase ends at "prompt → generated dashboard → refine → save → retrieve," fully verified against the live EdgeOne deployment (ROADMAP Phase 4 success criteria 1-5).

This phase does **not** add: dashboard history/listing UI (SHARE-02, v2), shareable public links (SHARE-01, v2), live/auto-refreshing dashboards (LIVE-01, v2), or any additional data sources beyond the two Phase 3 already scoped (DATA-04/05, v2).

</domain>

<decisions>
## Implementation Decisions

### Constrained Generation Vocabulary (GEN-03's core safety mechanism)
- **D-01:** [auto] Fixed component vocabulary — exactly four widget types, no others: `line-chart` (time-series `Detail` array), `bar-chart` (aggregate Sum/Avg/Max comparison), `stat-card` (single-number summary), `table` (raw tabular rows). This is the entire rendering vocabulary; there is no fifth "custom" or "code" type. — **Reversibility:** one-way — expanding this list is a deliberate future decision, not something a prompt can trigger at runtime.

- **D-02:** [auto] Fixed query-shape vocabulary, built entirely on Phase 3's existing routes/functions — no new API surface against `teo`. Each widget the LLM proposes must select from three closed enums, never freeform values:
  - `metric`: an allow-listed subset of `MetricNames` per data source (CDN traffic: extends the `l7Flow_outFlux` value Phase 3 already calls; Security Events: extends the `ddos_attackBandwidth`/`ddos_attackMaxBandwidth` values Phase 3 already calls). **The exact full allow-list per data source needs confirmation against real `teo` API docs — flagged to Phase 4 research, not locked here.**
  - `interval`: `hour` | `day` (matches the `Interval` param Phase 3 already uses).
  - `timeRange`: `last24h` | `last7d` | `last30d` — mapped server-side to `StartTime`/`EndTime` ISO8601 values; the LLM never supplies raw timestamps.
  — **Reversibility:** one-way — this enum-selection-only design is the mechanism that makes GEN-03's "never arbitrary code" guarantee structurally true, not just policy. Loosening it (e.g., letting the LLM supply a raw metric string) reopens the exact injection/exfil risk PROJECT.md's Constraints section calls out.

- **D-03:** [auto] Generation pipeline, strict validation, no execution of model output as code:
  1. Server sends the user's prompt + the fixed vocabulary (as a JSON Schema / enum list, not example code) to an LLM.
  2. LLM must return **JSON only** — an array of widgets: `{ componentType, metric, interval, timeRange, title }` (`title` is free-text, display-only, never used to construct a query or executed).
  3. Server validates the returned JSON against the fixed schema: any widget whose `componentType`/`metric`/`interval`/`timeRange` is not in the closed enum list is rejected outright (no coercion, no "best guess" substitution).
  4. If validation fails entirely (malformed JSON, zero valid widgets), retry the LLM call once with an explicit "you must return valid JSON matching this schema" correction prompt; if it fails a second time, show a generic "Couldn't generate a dashboard from that prompt — try rephrasing" message (D-08 no-leak convention) rather than surfacing the raw model output or error.
  5. For each **valid** widget, the server calls the same underlying functions Phase 3 already proved live (`getTenantAccount()`, `signTeoRequest()`) directly (in-process, not via a nested HTTP call to `/api/data/*`) — passing only server-owned constant strings for `Action`/`MetricNames`/`ZoneIds` (mapped from the validated enum value via a fixed lookup table), never the LLM's raw string, never a client-supplied value. This is the same "server is the only thing that constructs the real API params" pattern Phase 3's D-02/D-03 established for tenant scoping, now applied one layer further to prevent prompt injection from reaching the outbound API call.
  — **Reversibility:** one-way — this is GEN-03's literal implementation; `eval`, `new Function()`, dynamically-`import()`-ed model output, or passing model strings directly into API params must never appear in this codebase.

### LLM Integration Mechanism
- **D-04:** [auto] The LLM call happens **server-side, from an Edge Function** (e.g. `edge-functions/api/generate.js`), following the exact `context.env` secret pattern established in Phase 1 (`PLACEHOLDER_OIDC_CLIENT_ID`) and Phase 2/3 (`SESSION_SIGNING_KEY`, OIDC secrets): an `LLM_API_KEY` (name TBD per provider) read from `env`, never sent to or readable by the client, never echoed in any response. The call uses plain `fetch()` against the provider's REST endpoint — **not an npm SDK** — following Phase 3's precedent of avoiding an SDK dependency after `tencentcloud-sdk-nodejs` proved incompatible with the edge/V8-isolate runtime; most LLM providers expose a plain HTTPS JSON REST API callable via `fetch()`, so the same risk class is avoidable by construction here, pending confirmation in Phase 4 research for the specific provider chosen (see Claude's Discretion — provider choice is an open question).

### Save & Retrieval (SAVE-01)
- **D-05:** [auto] Saved dashboards persist in the existing bound KV namespace (`my_kv`, bound since Phase 1 Plan 02, reused unchanged — same bare-global convention, same `typeof my_kv === 'undefined'` fail-closed guard as `tenant-mapping.js`). Key shape: `dashboard:<tenant_id>:<dashboard_id>`, where `tenant_id` comes exclusively from `verifySession()` (never client input, matching D-02/D-03's tenant-scoping precedent) and `dashboard_id` is a server-generated `crypto.randomUUID()`. Value: JSON string containing the validated widget spec, the fetched data snapshot (v1 dashboards are generated-once/saved, not live-refreshing per PROJECT.md's Out of Scope), the original prompt text, and a `createdAt` timestamp.

- **D-06:** [auto] Retrieval (`GET /api/dashboard/:id`) is session-gated like every other data route: `verifySession()` first, 401 if invalid. The route reads `dashboard:${payload.tenant_id}:${id}` — i.e., it reconstructs the full key from the **verified session's** `tenant_id`, never from a client-supplied tenant segment, so a guessed/enumerated `dashboard_id` alone can never retrieve another tenant's saved dashboard (defense-in-depth beyond mere ID obscurity, consistent with D-02's "always re-derive from session" pattern). v1 scope is "save one, get an ID/URL back, revisit that exact URL later" — there is no dashboard list/history UI in this phase (SHARE-02 is v2).

### Re-Prompt / Refine Flow (GEN-04)
- **D-07:** [auto] Conversation/dashboard-draft state during refinement is kept **client-side** (a JS object in the prompt/dashboard page — prompt history + current widget spec + fetched data), not server-side. Each re-prompt POSTs `{ dataSource, previousSpec, newPrompt }` to the same generation endpoint; the server remains fully stateless per request (no draft KV writes, no session-store growth), extending both Phase 2's D-06 ("no server-side session store") and Phase 3's D-04 ("short-lived request state, not persisted") precedents one step further — refinement state simply doesn't survive a page refresh mid-session, which is an accepted v1 tradeoff (not a stated requirement) and only the final explicit Save action (D-05) writes to KV.

### Error Handling Extension
- **D-08:** [auto] Every failure branch in the generation/save/retrieve paths — LLM call failure, LLM timeout, schema-validation failure (twice), KV write/read failure — returns the same class of generic, no-leak message already established in D-05/Phase 2/Phase 3 ("Couldn't generate a dashboard from that prompt, try rephrasing" / "Couldn't save right now" / "Dashboard not found"). Raw LLM provider error bodies, API keys, and stack traces are never forwarded to the client, matching the no-leak convention's lineage (Phase 2 access-denied → Phase 3 `{available:false}` → this phase's generation/save/retrieve equivalents).

### Claude's Discretion
- **Open question requiring human input — LLM provider and API key.** No provider is locked. Needs a human decision on: (a) which provider/model (e.g., an OpenAI-API-compatible provider, Tencent Hunyuan, DeepSeek, Anthropic, etc.), (b) procuring a real API key/account (cost + a data-handling consideration: prompts and possibly tenant metric summaries would be sent to whichever third party is chosen), and (c) the exact REST endpoint shape (affects D-04's `fetch()`-only implementation and whether structured-output/JSON-mode is natively supported by that provider, which materially simplifies D-03's validation step). This must be resolved before or during Phase 4 planning — recommend surfacing as a `checkpoint:human-verify` early task, mirroring Phase 3's `user_setup` pattern for the Tencent Cloud API SecretId/SecretKey.
- Exact full `metric` allow-list per data source (beyond the one value each Phase 3 already proved live) — left to Phase 4 research against real `teo` API docs.
- Charting/rendering implementation for the four fixed component types — hand-rolled minimal SVG/canvas rendering (zero new dependency, consistent with this project's "no framework" convention) vs. a small CDN-loaded chart library (e.g. loaded via `<script>` tag, not npm) — left to Phase 4 research to weigh against the project's established dependency-minimalism precedent (Phase 3 explicitly avoided an SDK in favor of hand-rolling for the same reason).
- Exact JSON Schema field names/structure for the widget spec — left to planning, as long as it satisfies D-01/D-02's closed-enum constraints.
- Whether the LLM call needs a request timeout / abort pattern — Phase 2 already hit and fixed an `AbortSignal.timeout` polyfill gap on this edge runtime; Phase 4 research should confirm whether that fix is reusable here or needs re-verification for this new outbound call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/PROJECT.md` — Core value, v1 requirements, "Generation safety" constraint (constrained vocabulary, not arbitrary code), out-of-scope list
- `.planning/REQUIREMENTS.md` — GEN-01, GEN-02, GEN-03, GEN-04, SAVE-01 definitions and traceability
- `.planning/ROADMAP.md` — Phase 4 goal and success criteria (UI hint: yes)
- `.planning/STATE.md` — Blockers/Concerns entry flagging GEN-03's DSL as needing concrete design during Phase 4 planning (addressed by D-01/D-02/D-03 above)

### Prior phases (this phase builds directly on all three)
- `.planning/phases/01-edgeone-deployment-foundation/01-CONTEXT.md` / `01-RESEARCH.md` — KV namespace binding (`my_kv`, bare global), `context.env` secret pattern — both reused unchanged for D-04/D-05.
- `.planning/phases/02-sso-authentication-tenant-mapping/02-CONTEXT.md` / `02-RESEARCH.md` — `verifySession()` contract, D-06 (JWT-in-httpOnly-cookie, no server-side session store — extended by D-07), the no-leak/generic-error convention lineage (D-05 there → D-08 here), the `AbortSignal.timeout` polyfill gap already fixed once on this runtime (relevant to any new outbound LLM `fetch()` call).
- `.planning/phases/03-tenant-scoped-data-source-selection/03-CONTEXT.md` / `03-RESEARCH.md` — D-02 (tenant identity exclusively from `verifySession()`, one-way), D-03 (KV-backed tenant→account mapping), D-04 (short-lived selection-state passthrough — extended by D-07), D-05 (no-leak generic states — extended by D-08); `getTenantAccount()`/`signTeoRequest()` are reused **unchanged** by this phase's generation pipeline (D-03 above); the precedent of avoiding an SDK/npm dependency in favor of hand-rolled `fetch()`-based calls when no edge-runtime-compatible SDK exists (directly informs D-04's LLM-call approach).

No external specs/ADRs beyond ROADMAP.md and REQUIREMENTS.md. Phase 4 research MUST additionally cover: (1) the chosen LLM provider's REST API contract and structured-output/JSON-mode support (net-new research area, blocked on the open provider question above), (2) the full `teo` `MetricNames` allow-list per data source beyond the single value each Phase 3 route already calls, (3) `crypto.randomUUID()` availability on EdgeOne Edge Functions (net-new — not previously verified in Phase 1-3 research, though it is a standard Web Crypto API method).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `edge-functions/lib/session.js` (Phase 2): `verifySession()` — reused unchanged for every new route this phase adds (`generate.js`, `dashboard/:id` retrieval).
- `edge-functions/lib/tenant-mapping.js` (Phase 3): `getTenantAccount()` — reused unchanged; the generation pipeline calls this directly, not via HTTP, to resolve the real `zoneId`/credentials for whichever data source the dashboard's widgets query.
- `edge-functions/lib/teo-signer.js` (Phase 3): `signTeoRequest()` — reused unchanged; called per-widget with server-owned constant `Action`/`MetricNames`/`ZoneIds` values (D-02/D-03), never LLM- or client-supplied strings.
- `edge-functions/api/data/cdn-traffic.js` (Phase 3, live): concrete worked example of the verify→lookup→sign→fetch→generic-response chain this phase's `generate.js` route extends one layer further (multiple widgets per request instead of one fixed query).
- KV namespace (`my_kv`, bound Phase 1 Plan 02): reused for both the existing `tenant:*` read-only mapping (Phase 3) and this phase's new `dashboard:*` read/write records (D-05/D-06) — same binding, new key prefix, no new provisioning needed.
- `index.html` / `app.js`: existing login-gated card-rendering pattern (Phase 3: cards only render when `data.authenticated`) extends naturally to a login-gated prompt input + generated-widget rendering area.

### Established Patterns
- Edge Functions (not Cloud Functions) are the only runtime with KV access — the new `generate.js` and `dashboard/:id` routes belong in `edge-functions/api/`, following the existing `edge-functions/api/data/` sibling structure (e.g. `edge-functions/api/generate.js`, `edge-functions/api/dashboard.js` or `edge-functions/api/dashboard/[id].js` depending on this platform's dynamic-route convention — confirm exact file-based routing syntax in Phase 4 research, not yet exercised in Phases 1-3 which only used static route names).
- `verifySession()` is always the first branch, before any KV read or outbound call — proven live in `cdn-traffic.js`; this phase's new routes must open the same way.
- Generic, no-leak error/empty states (`{ available: false }` in Phase 3) — this phase's equivalent shapes (`{ error: 'generation_failed' }`, `{ error: 'not_found' }`, etc.) must follow the same never-echo-raw-detail discipline.
- No npm SDK when the runtime's edge/V8-isolate compatibility isn't confirmed — Phase 3 already established hand-rolled `fetch()` + `crypto.subtle` as the fallback pattern; this phase's LLM integration should default to the same approach (D-04) rather than installing a provider SDK sight-unseen.

### Integration Points
- New: prompt input UI (extends `index.html`/`app.js`, gated behind both `data.authenticated` and a selected data source per Phase 3's D-04 passthrough state).
- New: `edge-functions/api/generate.js` — session-gated, calls the LLM, validates JSON, fetches real widget data via Phase 3's lib functions, returns the assembled dashboard (spec + data) to the client for rendering.
- New: `edge-functions/api/dashboard.js` (or equivalent dynamic route) — `POST` to save (writes `dashboard:<tenant_id>:<dashboard_id>` to KV, returns the new ID), `GET /:id` to retrieve (session-gated, tenant-checked per D-06).
- New: client-side rendering functions for the four fixed widget types (D-01) — plain JS/SVG/canvas or a CDN-loaded chart lib (open per Claude's Discretion).
- Existing, unchanged: `edge-functions/lib/session.js`, `edge-functions/lib/tenant-mapping.js`, `edge-functions/lib/teo-signer.js`, `edge-functions/api/data/cdn-traffic.js`, `edge-functions/api/data/security-events.js` (Phase 3 Plan 02, not yet executed as of this writing but already planned/specified).

</code_context>

<specifics>
## Specific Ideas

No specific UI/UX mockups were discussed (auto mode) — standard flow expected, consistent with the project's stated Workbuddy-inspired UX: after selecting a data source (Phase 3), the user sees a prompt input + "Generate" button; the generated dashboard renders as a vertical stack of the four fixed widget types; a "Save" button persists it; a re-prompt input stays available above/below the rendered dashboard for GEN-04 refinement without navigating away.

</specifics>

<deferred>
## Deferred Ideas

- SHARE-01 (shareable public links) — v2 per REQUIREMENTS.md; this phase's `dashboard:<tenant_id>:<dashboard_id>` KV shape is deliberately compatible with adding a public/shareable retrieval path later, but no public (unauthenticated) route is built this phase.
- SHARE-02 (dashboard list/history UI) — v2 per REQUIREMENTS.md; v1 retrieval is "revisit the exact saved URL," not "browse my past dashboards." D-05/D-06's KV shape does not preclude a future list feature (KV keys are already tenant-prefixed and listable), but no list endpoint/UI is built this phase.
- LIVE-01 (auto-refreshing dashboards) — v2 per REQUIREMENTS.md; D-05 explicitly saves a data **snapshot** at generation time, matching PROJECT.md's "generated once and saved, refresh-on-demand only, not real-time" constraint.
- DATA-04/DATA-05 (DNS analytics, Edge Functions metrics as data sources) — deferred to v2 per REQUIREMENTS.md; D-02's metric allow-list is scoped only to the two data sources Phase 3 already built.
- Multiple simultaneous data sources in one dashboard — explicitly out of scope per REQUIREMENTS.md; every widget in a dashboard's spec queries the single data source selected in Phase 3.
- Expanding the fixed component/query vocabulary (D-01/D-02) beyond the four widget types or the closed metric/interval/timeRange enums — not deferred to a specific version, but explicitly flagged as a one-way, deliberate-future-decision boundary, not something this phase or a user prompt can expand at runtime.

None — discussion otherwise stayed within phase scope (auto mode, no live user discussion to introduce scope creep).

</deferred>

---

*Phase: 4-prompt-driven-dashboard-generation-save*
*Context gathered: 2026-08-12 (auto mode)*
