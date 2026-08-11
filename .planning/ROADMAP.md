# Roadmap: Enterprise SSO Dashboard Builder

## Overview

The journey starts with proving the hardest platform constraint first: getting a real, working app live on EdgeOne Makers + EdgeOne Functions — not a locally-running prototype. Once that foundation is deployed and verified, the app gains an enterprise SSO gate that resolves every user to exactly one EdgeOne account (the core tenant-isolation guarantee). With identity and tenant scoping in place, users can pick a data source that is provably scoped to their own account only. Finally, the prompt-driven generation engine ties it together: users describe what they want, the agent builds a constrained, read-only dashboard from their selected data source, they can refine it by re-prompting, and save it — all running against the live EdgeOne deployment established in phase one.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: EdgeOne Deployment Foundation** - Get a real app skeleton live on EdgeOne Pages + EdgeOne Functions, with storage and secrets proven end-to-end, before any feature work begins.
- [ ] **Phase 2: SSO Authentication & Tenant Mapping** - Enterprise users log in via their company's SSO on the live deployment and are resolved server-side to exactly one EdgeOne account.
- [ ] **Phase 3: Tenant-Scoped Data Source Selection** - Logged-in users pick CDN Traffic Stats or Security Events, with every query provably scoped to their own account only.
- [ ] **Phase 4: Prompt-Driven Dashboard Generation & Save** - Users prompt an agent to generate a constrained, read-only dashboard from their selected data source, refine it, and save it — verified live on EdgeOne.

## Phase Details

### Phase 1: EdgeOne Deployment Foundation
**Goal**: A working app skeleton is live on EdgeOne Pages + EdgeOne Functions, with the platform primitives every later phase depends on (persistent storage, secrets/env config, function routing) proven end-to-end on the real deployed environment — not just local dev.
**Depends on**: Nothing (first phase)
**Requirements**: DEPLOY-01
**Success Criteria** (what must be TRUE):
  1. The app's static site is deployed and publicly reachable at a live EdgeOne Pages URL.
  2. At least one EdgeOne Function endpoint is deployed and callable from the live site, returning a real (not mocked) response.
  3. Environment secrets/config (e.g., placeholder OIDC client credentials) can be set and read by an EdgeOne Function in the deployed environment.
  4. A persistent storage binding (e.g., EdgeOne KV) is provisioned, and a value written in one request can be read back in a later request against the live deployment.
**Plans:** 2 plans
Plans:
- [ ] 01-01-PLAN.md — Static site + Edge Function + secrets live on EdgeOne Makers (CLI deploy, criteria 1-3)
- [ ] 01-02-PLAN.md — KV namespace bound + write-then-read proven live (criterion 4)

### Phase 2: SSO Authentication & Tenant Mapping
**Goal**: Enterprise users can log in through their company's SSO on the live deployed app and be resolved, server-side, to exactly one EdgeOne account, with sessions that persist across refresh.
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. Visiting the live app redirects an unauthenticated user to their company's SSO identity provider, and completing authentication there returns them to the app in a logged-in state.
  2. A logged-in user's session persists across a browser refresh without requiring re-login.
  3. The user's SSO identity is resolved server-side to exactly one EdgeOne account; this mapping cannot be changed or influenced by any client-supplied request parameter.
**Plans**: TBD

### Phase 3: Tenant-Scoped Data Source Selection
**Goal**: A logged-in user can select a data source (CDN traffic or security events) on a dedicated selection screen, and the app only ever surfaces or queries data belonging to that user's own resolved EdgeOne account.
**Depends on**: Phase 2
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. A logged-in user can select "CDN Traffic Stats" as their data source from the selection screen.
  2. A logged-in user can select "Security Events" as their data source from the selection screen.
  3. Every data-source query executed by the app is scoped server-side to the logged-in user's own EdgeOne account; no request, regardless of input, returns another tenant's data.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Prompt-Driven Dashboard Generation & Save
**Goal**: A logged-in user can describe the dashboard they want in natural language, get a generated read-only dashboard from their selected data source, refine it by re-prompting, and save it for later — all verified against the live EdgeOne deployment.
**Depends on**: Phase 3
**Requirements**: GEN-01, GEN-02, GEN-03, GEN-04, SAVE-01
**Success Criteria** (what must be TRUE):
  1. User can type a natural-language prompt describing the dashboard/view they want.
  2. The agent generates a dashboard (charts/tables) from the selected data source that reflects the prompt, using only read-only EdgeOne API calls.
  3. Dashboard generation only ever produces output from a fixed, constrained set of query/component types — never arbitrary executed code against live APIs.
  4. User can re-prompt to refine or regenerate the dashboard without returning to data-source selection.
  5. User can save a generated dashboard and retrieve it later under their account, with the full flow (login → data source → prompt → generate → save) verified end-to-end on the live EdgeOne deployment.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. EdgeOne Deployment Foundation | 0/2 | Not started | - |
| 2. SSO Authentication & Tenant Mapping | 0/TBD | Not started | - |
| 3. Tenant-Scoped Data Source Selection | 0/TBD | Not started | - |
| 4. Prompt-Driven Dashboard Generation & Save | 0/TBD | Not started | - |
