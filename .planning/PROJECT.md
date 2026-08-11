# Enterprise SSO Dashboard Builder

## What This Is

An EdgeOne Makers app that lets enterprise customers log in via their own SSO (enterprise IdP) and generate their own read-only reporting dashboards by prompting an agent — similar to how Workbuddy generates results from an uploaded CSV/Excel/Google Doc, but here the "data source" is the customer's own EdgeOne account data (CDN traffic, security events) instead of an uploaded file. The user picks a data source first, then prompts what they want to see, and the agent builds a saved, shareable dashboard.

## Core Value

Enterprise customers can self-serve custom reporting on their own EdgeOne data (starting with CDN traffic and security events) without filing a support/sales request — via a prompt-driven agent, gated behind their enterprise SSO, with data strictly isolated to their own account.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Enterprise user can log in via their company's SSO (protocol TBD — OIDC vs SAML, pending research)
- [ ] Logged-in user only sees data belonging to their own EdgeOne account (per-customer data isolation, not a shared account)
- [ ] User selects a data source before prompting: CDN traffic stats or Security events (v1 scope)
- [ ] User prompts in natural language (e.g. "show me weekly API errors by region") and the agent generates a dashboard from the selected data source
- [ ] Generated dashboards are read-only (no write/mutation access to EdgeOne account via this tool)
- [ ] Generated dashboard can be saved and shared via link
- [ ] App is deployed on EdgeOne Pages (frontend) + EdgeOne Functions (backend/API glue)

### Out of Scope

- Write/mutation actions against EdgeOne APIs (zone config changes, rule edits, etc.) — read-only only, this is a reporting tool not an admin console
- Arbitrary/open-ended AI code execution against live APIs — generation is constrained to rendering the selected data source, not writing and running arbitrary code
- DNS analytics and Edge Functions metrics as data sources — deferred past v1, CDN traffic + security events only for now
- Live/auto-refreshing dashboards — v1 dashboards are generated once and saved; refresh-on-demand only, not real-time streaming
- Multiple simultaneous data sources in one dashboard — v1 is single-source-at-a-time (pick one, then prompt)

## Context

- Inspired by Workbuddy's flow: user provides a data source (there: CSV/Excel/Google Doc; here: EdgeOne account data) then prompts an agent to generate results/visualizations from it.
- Motivation: enterprise customers currently have to go through manual reporting requests (support/sales) to get custom views of their CDN/security data. This self-serves that.
- Target platform is Tencent EdgeOne Makers — deployment is EdgeOne Pages + EdgeOne Functions, keeping the whole app within the EdgeOne edge ecosystem.
- Read-only scope was a deliberate early decision (see prior conversation) to reduce security surface — since AI-generated "vibe coded" dashboards only need to query/render, not mutate, the blast radius of a prompt-injection or generation bug is much smaller than if write access were in scope.
- SSO is being used purely as an access gate for v1 (can the user get into the tool at all), combined with per-customer data isolation (once in, user can only query their own account's data) — not fine-grained in-tool role/permission management beyond that.

## Constraints

- **Security**: Read-only access to EdgeOne APIs only — no write/mutation capability should exist in this tool's API surface, even as a defense-in-depth measure beyond the UI layer
- **Tenant isolation**: SSO identity must map deterministically to exactly one EdgeOne account's data — cross-tenant data leakage is the top risk to design against
- **Platform**: Must deploy on EdgeOne Pages + EdgeOne Functions (EdgeOne Makers ecosystem)
- **Generation safety**: AI dashboard generation should be constrained (e.g. to a safe component/query DSL) rather than arbitrary open-ended code generation against live APIs, to limit prompt-injection/data-exfil risk

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Read-only scope for v1 | Removes write-exploit risk entirely; AI-generated code can only query/render, not mutate — much safer starting point | ✓ Good |
| SSO protocol (OIDC vs SAML) deferred to research | Both are viable; wanted domain research before locking implementation | — Pending |
| SSO as access gate + per-customer data isolation (not deep in-tool RBAC) | Matches v1 scope — the main risk is cross-tenant leakage, not intra-org permission granularity | — Pending |
| v1 data sources limited to CDN traffic + security events | Narrows scope for a sellable MVP rather than a generic builder | — Pending |
| Deploy on EdgeOne Pages + Functions | Keeps the whole app within the EdgeOne edge ecosystem, showcases the platform | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-10 after initialization*
