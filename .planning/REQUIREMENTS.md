# Requirements: Enterprise SSO Dashboard Builder

**Defined:** 2026-08-10
**Core Value:** Enterprise customers can self-serve custom reporting on their own EdgeOne data (starting with CDN traffic and security events) without filing a support/sales request — via a prompt-driven agent, gated behind their enterprise SSO, with data strictly isolated to their own account.

## v1 Requirements

### Deployment

- [ ] **DEPLOY-01**: App is deployed and live on EdgeOne Pages (frontend) + EdgeOne Functions (backend/API glue), with persistent storage and secrets/config working end-to-end in the deployed environment (not just local dev)

### Authentication

- [ ] **AUTH-01**: User can log in via their company's enterprise SSO (protocol — OIDC vs SAML — decided at phase-planning time)
- [ ] **AUTH-02**: User's session persists across browser refresh without re-login
- [ ] **AUTH-03**: SSO identity resolves server-side to exactly one EdgeOne account (tenant mapping); this mapping cannot be influenced or overridden by client input

### Data Source Selection

- [ ] **DATA-01**: User can select CDN Traffic Stats as a data source
- [ ] **DATA-02**: User can select Security Events as a data source
- [ ] **DATA-03**: Data source picker and all underlying queries are scoped exclusively to the logged-in user's own EdgeOne account — no other tenant's data is ever listed, queryable, or returned

### Dashboard Generation

- [ ] **GEN-01**: User can enter a natural-language prompt describing the dashboard/view they want
- [ ] **GEN-02**: Agent generates a dashboard (charts/tables) from the selected data source based on the prompt, using read-only EdgeOne API calls only
- [ ] **GEN-03**: Dashboard generation is constrained to a fixed query/component vocabulary (not arbitrary/open-ended code execution against live APIs)
- [ ] **GEN-04**: User can re-prompt to refine/regenerate the dashboard without starting over from data-source selection

### Save

- [ ] **SAVE-01**: User can save a generated dashboard for later retrieval under their account

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Sharing & History

- **SHARE-01**: Saved dashboards have a shareable link
- **SHARE-02**: User can view a list/history of their previously generated dashboards

### Auth

- **AUTH-04**: User can explicitly log out

### Data Freshness

- **LIVE-01**: Dashboards can auto-refresh/live-update as underlying data changes

### Additional Data Sources

- **DATA-04**: DNS analytics as a selectable data source
- **DATA-05**: Edge Functions metrics as a selectable data source

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Write/mutation actions against EdgeOne APIs (zone config, rule edits) | Read-only reporting tool, not an admin console — removes an entire class of exploit risk |
| Arbitrary/open-ended AI code generation against live APIs | Constrained generation vocabulary limits prompt-injection/data-exfil blast radius |
| Multiple simultaneous data sources in one dashboard | v1 is single-source-at-a-time; combining sources adds query/generation complexity deferred past v1 |
| Fine-grained in-tool RBAC beyond tenant isolation | v1 risk is cross-tenant leakage, not intra-org permission granularity; SSO is an access gate + tenant scope only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEPLOY-01 | Phase 1 | Pending |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| DATA-01 | Phase 3 | Pending |
| DATA-02 | Phase 3 | Pending |
| DATA-03 | Phase 3 | Pending |
| GEN-01 | Phase 4 | Pending |
| GEN-02 | Phase 4 | Pending |
| GEN-03 | Phase 4 | Pending |
| GEN-04 | Phase 4 | Pending |
| SAVE-01 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12/12 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-10*
*Last updated: 2026-08-10 after roadmap creation (added DEPLOY-01, mapped all v1 requirements to phases)*
