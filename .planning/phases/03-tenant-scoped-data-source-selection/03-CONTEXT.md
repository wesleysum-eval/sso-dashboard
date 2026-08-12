# Phase 3: Tenant-Scoped Data Source Selection - Context

**Gathered:** 2026-08-11 (auto mode — `--auto` — decisions are Claude-selected recommended defaults, not a live user discussion)
**Status:** Ready for planning

<domain>
## Phase Boundary

A logged-in user (resolved server-side to exactly one EdgeOne account via Phase 2's session JWT) selects a data source — CDN Traffic Stats or Security Events — from a dedicated selection screen. Every query the app executes against that data source is scoped exclusively to the logged-in user's own EdgeOne account; no request, regardless of client input, can return another tenant's data. No dashboard generation happens in this phase (that's Phase 4) — this phase ends at "data source selected, and a provably tenant-scoped fetch of that data source succeeds."

</domain>

<decisions>
## Implementation Decisions

### Data Source Picker
- **D-01:** [auto] Selection screen presents exactly two options as simple cards/buttons — "CDN Traffic Stats" and "Security Events" — gating access to Phase 4's prompt screen. No search, filtering, or additional metadata needed for only two options.

### Tenant Scoping Mechanism
- **D-02:** [auto] Every data-source query derives the tenant identity exclusively from the verified session JWT (`verifySession()` from Phase 2's `edge-functions/lib/session.js`) on the server side — never from a client-supplied query param, header, or body field. This directly extends Phase 2's AUTH-03 pattern to satisfy DATA-03. — **Reversibility:** one-way — this is the single hard security invariant of the phase; any future change to how tenant identity is resolved must preserve "server-verified session is the only source," matching the precedent set in Phase 2.

### EdgeOne Account Mapping for Data Fetching
- **D-03:** [auto] The session's `tenant_id` claim must map to the specific EdgeOne account/zone credentials (e.g. Zone ID, SecretId/SecretKey or equivalent) needed to call the real EdgeOne Open API for that tenant's CDN/security data. This mapping is a new lookup this phase introduces — recommend storing it in the EdgeOne KV namespace (bound since Phase 1 Plan 02) as `tenant_id -> { zoneId, ... }`, populated at customer onboarding (out of this phase's build scope, but the read path must exist and be provably tenant-scoped). Real EdgeOne Open API calls, not mocked data — matching Phase 1/2's "prove it live" precedent.

### Data Source Selection Persistence
- **D-04:** [auto] The selected data source is passed forward to Phase 4 via short-lived session/request state (e.g. a query param or an additional signed cookie value) — not persisted long-term. Matches v1 scope: single-source-at-a-time, no "remember my last source" requirement in REQUIREMENTS.md.

### Error / Empty State Handling
- **D-05:** [auto] If the EdgeOne API call for a tenant's data fails or returns empty, show a generic "No data available" state client-side. Never leak raw API error bodies, credentials, or zone/account identifiers to the client — consistent with Phase 2's D-05 no-leak convention for access-denied.

### Claude's Discretion
- Exact EdgeOne Open API endpoint names/params for CDN traffic stats and security events — left to Phase 3 research to confirm against real EdgeOne Open API docs.
- Exact shape of the `tenant_id -> EdgeOne account` KV mapping record — left to planning/research.
- UI styling of the two-option picker — functional minimalism, consistent with Phase 1/2's existing style (plain HTML, no framework introduced).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/PROJECT.md` — Core value, v1 requirements, out-of-scope list
- `.planning/REQUIREMENTS.md` — DATA-01, DATA-02, DATA-03 definitions and traceability
- `.planning/ROADMAP.md` — Phase 3 goal and success criteria

### Prior phases (this phase builds directly on both)
- `.planning/phases/01-edgeone-deployment-foundation/01-CONTEXT.md` — Deployment decisions; KV namespace binding (D-07) is a direct dependency for D-03 above
- `.planning/phases/01-edgeone-deployment-foundation/01-RESEARCH.md` — EdgeOne Makers platform constraints (Edge Functions, KV global-binding pattern)
- `.planning/phases/02-sso-authentication-tenant-mapping/02-CONTEXT.md` — Session JWT shape (`tenant_id`, `sub` claims), D-06 (JWT-in-httpOnly-cookie, no server-side session store), D-03 (tenant resolution via IdP custom claim) — this phase's D-02 extends these directly
- `.planning/phases/02-sso-authentication-tenant-mapping/02-RESEARCH.md` — OIDC/session patterns already established; reuse conventions (302 redirects, no-leak error pages, `context.env` secret handling)

No external specs/ADRs beyond ROADMAP.md and REQUIREMENTS.md — requirements fully captured in decisions above. Phase 3 research MUST additionally cover real EdgeOne Open API documentation for CDN traffic stats and security events endpoints (net-new research area, not covered by Phase 1/2 research).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `edge-functions/lib/session.js` (Phase 2): `verifySession()` — the only mechanism this phase should use to resolve tenant identity server-side.
- `edge-functions/api/status.js` (Phase 1): established pattern for reading `context.env` secrets and never echoing raw values in responses — same pattern applies to any EdgeOne API credentials this phase reads.
- KV namespace (bound Phase 1 Plan 02): available for the `tenant_id -> EdgeOne account` mapping lookup (D-03).
- `index.html` / `app.js`: minimal static entry point + client-side fetch pattern — the data-source picker screen extends this rather than introducing a framework.

### Established Patterns
- Edge Functions (not Cloud Functions) are the only runtime with KV access — the tenant-mapping lookup and any new API routes belong in `edge-functions/`.
- 302 redirects (never 307) for any auth-gated navigation, matching Phase 2's convention.
- Generic, no-leak error/denial pages — established in Phase 2 (`access-denied.html`) and extended here for "no data available" states.

### Integration Points
- New: data-source selection screen (static HTML + `app.js` extension, or new page) gated behind a valid `session` cookie.
- New: Edge Function route(s) for fetching CDN Traffic Stats and Security Events from the real EdgeOne Open API, scoped via the session-resolved tenant.
- New: `tenant_id -> EdgeOne account` KV-backed mapping lookup, read (not written) by this phase's Edge Functions.
- Existing: `edge-functions/lib/session.js` — imported by new routes to verify the session and extract `tenant_id` server-side.

</code_context>

<specifics>
## Specific Ideas

No specific UI/UX references were discussed (auto mode) — standard "pick one of two cards, then proceed" flow expected, consistent with the project's stated Workbuddy-inspired UX (pick data source, then prompt).

</specifics>

<deferred>
## Deferred Ideas

- Multiple simultaneous data sources in one dashboard — explicitly out of scope per REQUIREMENTS.md; v1 is single-source-at-a-time.
- DNS analytics / Edge Functions metrics as additional data sources (DATA-04, DATA-05) — deferred to v2 per REQUIREMENTS.md.
- "Remember last selected data source" across sessions — not a v1/v2 requirement; D-04 explicitly keeps this short-lived/session-scoped only.

None — discussion otherwise stayed within phase scope (auto mode, no live user discussion to introduce scope creep).

</deferred>

---

*Phase: 3-tenant-scoped-data-source-selection*
*Context gathered: 2026-08-11 (auto mode)*
