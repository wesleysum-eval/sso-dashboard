# Phase 2: SSO Authentication & Tenant Mapping - Context

**Gathered:** 2026-08-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Enterprise users log in through their company's SSO on the live deployed app (from Phase 1) and are resolved, server-side, to exactly one EdgeOne account. Sessions persist across browser refresh without re-login. The identity-to-tenant mapping cannot be influenced by any client-supplied request parameter.

</domain>

<decisions>
## Implementation Decisions

### SSO Protocol
- **D-01:** OIDC only for v1 — SAML explicitly excluded from this phase. — **Reversibility:** costly — adding SAML later means a second, structurally different auth flow (XML/SAML assertions vs JSON/OIDC tokens) alongside the existing one; not a rewrite of D-01, but a parallel addition.
- **D-02:** OIDC client is generic/standards-compliant (works with any IdP via discovery URL + client ID/secret configured per customer at onboarding) — not tied to a specific vendor SDK (e.g., not Auth0-specific or Okta-specific).

### Tenant Mapping
- **D-03:** Tenant resolution uses an IdP-issued custom claim/attribute (e.g., `tenant_id` or `account_id` in the ID token) that the app trusts directly and maps to exactly one EdgeOne account. — **Reversibility:** one-way — once customers configure this claim in their IdP during onboarding, switching to a different mapping mechanism (e.g., email-domain-based) requires re-onboarding every existing customer's IdP config.
- **D-04:** Requires enterprise IT (the customer's own team) to configure the claim in their IdP during onboarding — this is an onboarding/support-doc dependency, not something the app can automate away in v1.
- **D-05:** If SSO login succeeds but the identity has no valid tenant mapping (claim missing or unrecognized), show a **generic "Access denied"** page — do NOT reveal tenant-mapping details, configured domains, or hints about what's misconfigured. Prioritizes not leaking tenant/config info over self-service unblocking.

### Session Persistence
- **D-06:** Session persists via a **signed/encrypted JWT stored in an httpOnly cookie** — no server-side session store. All needed session data (resolved tenant/account ID, expiry) is encoded directly in the token.
  - **Reversibility:** costly — switching to server-side (KV-backed) sessions later means changing the cookie contract (opaque ID vs full JWT) and adding revocation-checking logic; every issued token under the old scheme becomes unrevocable-by-design until it naturally expires.
  - **Rationale for this choice over KV:** EdgeOne KV namespace is not yet bound to the live project (Phase 1 Plan 02 was skipped) — JWT cookies avoid that dependency entirely and work today. This was a direct trade-off during discussion: KV-backed sessions would be more secure (server-side revocation) but are blocked; JWT is available now.
  - **Known limitation carried forward:** JWT sessions cannot be server-side revoked before natural expiry. Acceptable for v1; revisit if a "force logout all sessions" requirement emerges (not in v1/v2 requirements today).

### Claude's Discretion
- Specific OIDC library/SDK choice (e.g., `openid-client`, `jose` for JWT signing) — left to research/planning to determine what's compatible with the EdgeOne Edge Functions runtime.
- JWT expiry duration and refresh strategy (e.g., sliding expiry vs fixed) — not discussed, use reasonable defaults (research to confirm platform constraints).
- Exact claim name for tenant mapping (`tenant_id` vs `account_id` vs namespaced custom claim) — default to `tenant_id`, but allow a deployment-specific `OIDC_TENANT_CLAIM` override because Auth0 and similar IdPs commonly emit custom claims under URI-style namespaced keys.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/PROJECT.md` — Core value, v1 requirements, out-of-scope list
- `.planning/REQUIREMENTS.md` — AUTH-01, AUTH-02, AUTH-03 definitions and traceability

### Phase 1 (prior phase — deployment foundation this phase builds on)
- `.planning/phases/01-edgeone-deployment-foundation/01-CONTEXT.md` — Deployment decisions
- `.planning/phases/01-edgeone-deployment-foundation/01-RESEARCH.md` — EdgeOne Makers platform constraints (Edge Functions vs Cloud Functions, secrets handling, KV binding limitations)
- `.planning/phases/01-edgeone-deployment-foundation/01-01-SUMMARY.md` — **IMPORTANT:** documents a known platform quirk — GitHub-connected deploys and CLI (`edgeone makers`) deploys create/manage SEPARATE project identities, even for the same repo. Whoever plans/executes Phase 2 secrets (real OIDC client ID/secret, JWT signing key) MUST confirm which project identity is authoritative before setting secrets, or repeat the Phase 1 gap (secret set via CLI, unreachable by the live GitHub-connected deployment).
- `.planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt` — Canonical live URL (https://sso-dashboard.edgeone.dev/)

No external specs/ADRs beyond ROADMAP.md and REQUIREMENTS.md — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `edge-functions/api/status.js`: Established pattern for reading `context.env` secrets and never echoing raw values in responses — same pattern applies to OIDC client secret and JWT signing key.
- `index.html` / `app.js`: Minimal static entry point + client-side fetch pattern already established; Phase 2's login/callback UI can extend this rather than introducing a new framework.

### Established Patterns
- Edge Functions (not Cloud Functions) are the only runtime with KV access — moot for this phase since JWT-cookie sessions were chosen specifically to avoid the KV dependency, but OIDC callback/token-exchange logic should still live in `edge-functions/` for consistency with Phase 1's architectural split.
- Secrets are set via `edgeone makers env set` — but Phase 1 proved this only reaches the CLI-linked project, not the GitHub-connected live deployment. This phase's OIDC client secret and JWT signing key MUST be verified reachable on the canonical live URL, not just the CLI-linked project.

### Integration Points
- New: OIDC redirect/callback Edge Functions (e.g., `/api/auth/login`, `/api/auth/callback`)
- New: JWT issuance/verification helper (likely a shared module imported by callback and by future protected routes in Phase 3/4)
- Existing: `edge-functions/api/status.js` pattern for "is user authenticated" style checks in later phases

</code_context>

<specifics>
## Specific Ideas

No specific UI/UX references given — standard OIDC redirect flow expected (unauthenticated visit → redirect to IdP → IdP login → redirect back to app in logged-in state).

</specifics>

<deferred>
## Deferred Ideas

- **KV-backed sessions (server-side revocation)** — deferred, not because it's out of scope, but because it's blocked on the KV namespace binding (Phase 1 Plan 02, currently skipped). If/when KV is set up, revisit whether to migrate from JWT cookies to KV-backed sessions for revocation capability. Not a v1/v2 requirement today, but noted as a natural follow-up.
- **"Force logout all sessions" / explicit revocation** — not a current requirement (AUTH-04 explicit logout is deferred to v2 per REQUIREMENTS.md); JWT's non-revocability limitation only matters if this becomes a requirement later.
- **SAML support** — explicitly out of scope for this phase; noted as a possible v2+ consideration if enterprise customers with legacy-only IdPs are encountered.

None — discussion otherwise stayed within phase scope.

</deferred>

---

*Phase: 2-sso-authentication-tenant-mapping*
*Context gathered: 2026-08-11*
