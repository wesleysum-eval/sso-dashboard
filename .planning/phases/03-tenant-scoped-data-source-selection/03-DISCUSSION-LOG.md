# Phase 3: Tenant-Scoped Data Source Selection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-11
**Phase:** 3-tenant-scoped-data-source-selection
**Areas discussed:** Data Source Picker, Tenant Scoping Mechanism, EdgeOne Account Mapping, Data Source Selection Persistence, Error/Empty State Handling

**Mode:** `--auto` — no live AskUserQuestion turns. Claude auto-selected the recommended option for every gray area in a single pass, per `workflows/discuss-phase/modes/auto.md`. All decisions below are logged for audit; user did not review options interactively.

---

## Data Source Picker

| Option | Description | Selected |
|--------|-------------|----------|
| Two simple cards/buttons (CDN Traffic Stats, Security Events) | Minimal picker, matches v1's two-source scope | ✓ |
| Dropdown/select | More scalable to future sources but overkill for 2 options | |
| Tabs | Also viable but implies staying on the picker, not navigating forward | |

**Selected:** Two simple cards/buttons (D-01)
**Notes:** Only two v1 data sources per REQUIREMENTS.md — no need for scalable UI patterns.

---

## Tenant Scoping Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Extend Phase 2's verified session JWT as sole tenant source | Directly reuses AUTH-03's server-side-only precedent | ✓ |
| Re-verify tenant via a fresh IdP call per request | Unnecessary round trip; session JWT already carries verified claim | |

**Selected:** Extend Phase 2 session verification (D-02)
**Notes:** This is a one-way security invariant — flagged with `Reversibility: one-way` in CONTEXT.md.

---

## EdgeOne Account Mapping for Data Fetching

| Option | Description | Selected |
|--------|-------------|----------|
| KV-backed tenant_id -> EdgeOne account mapping | Reuses Phase 1's bound KV namespace; no new infra | ✓ |
| Encode EdgeOne account credentials directly in the JWT | Bloats token, duplicates a mapping that can change independently of login | |

**Selected:** KV-backed mapping (D-03)
**Notes:** Population of the mapping (onboarding) is out of this phase's build scope; only the read path is built here.

---

## Data Source Selection Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Short-lived session/request state only | Matches v1's no-"remember last source" requirement | ✓ |
| Persist to KV per-user | Adds scope beyond what REQUIREMENTS.md asks for in v1 | |

**Selected:** Short-lived only (D-04)

---

## Error / Empty State Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Generic "No data available" state, no leaked error detail | Matches Phase 2's D-05 no-leak convention | ✓ |
| Surface raw API error message to client | Risk of leaking credentials/zone IDs/account details | |

**Selected:** Generic no-leak state (D-05)

---

## Claude's Discretion

- Exact EdgeOne Open API endpoint names/params for CDN traffic stats and security events (left to research).
- Exact KV mapping record shape for tenant_id -> EdgeOne account.
- UI styling of the two-option picker (functional minimalism, consistent with Phase 1/2).

## Deferred Ideas

- Multiple simultaneous data sources in one dashboard — out of scope (REQUIREMENTS.md).
- DNS analytics / Edge Functions metrics as data sources (DATA-04, DATA-05) — deferred to v2.
- "Remember last selected data source" across sessions — not a v1/v2 requirement.
