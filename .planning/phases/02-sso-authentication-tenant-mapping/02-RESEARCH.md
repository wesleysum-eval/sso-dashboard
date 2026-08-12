# Phase 2: SSO Authentication & Tenant Mapping - Research

**Researched:** 2026-08-11
**Domain:** OIDC authorization-code flow on an edge/V8-isolate runtime (EdgeOne Edge Functions), JWT session cookies, tenant claim resolution
**Confidence:** MEDIUM-HIGH (platform mechanics and RFC-level OAuth security guidance are HIGH; library-on-EdgeOne-specifically compatibility is MEDIUM — verified for the *class* of runtime, not EdgeOne by name)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**SSO Protocol**
- **D-01:** OIDC only for v1 — SAML explicitly excluded from this phase. **Reversibility:** costly — adding SAML later means a second, structurally different auth flow (XML/SAML assertions vs JSON/OIDC tokens) alongside the existing one; not a rewrite of D-01, but a parallel addition.
- **D-02:** OIDC client is generic/standards-compliant (works with any IdP via discovery URL + client ID/secret configured per customer at onboarding) — not tied to a specific vendor SDK (e.g., not Auth0-specific or Okta-specific).

**Tenant Mapping**
- **D-03:** Tenant resolution uses an IdP-issued custom claim/attribute (e.g., `tenant_id` or `account_id` in the ID token) that the app trusts directly and maps to exactly one EdgeOne account. **Reversibility:** one-way — once customers configure this claim in their IdP during onboarding, switching to a different mapping mechanism (e.g., email-domain-based) requires re-onboarding every existing customer's IdP config.
- **D-04:** Requires enterprise IT (the customer's own team) to configure the claim in their IdP during onboarding — this is an onboarding/support-doc dependency, not something the app can automate away in v1.
- **D-05:** If SSO login succeeds but the identity has no valid tenant mapping (claim missing or unrecognized), show a **generic "Access denied"** page — do NOT reveal tenant-mapping details, configured domains, or hints about what's misconfigured. Prioritizes not leaking tenant/config info over self-service unblocking.

**Session Persistence**
- **D-06:** Session persists via a **signed/encrypted JWT stored in an httpOnly cookie** — no server-side session store. All needed session data (resolved tenant/account ID, expiry) is encoded directly in the token.
  - **Reversibility:** costly — switching to server-side (KV-backed) sessions later means changing the cookie contract (opaque ID vs full JWT) and adding revocation-checking logic; every issued token under the old scheme becomes unrevocable-by-design until it naturally expires.
  - **Rationale for this choice over KV:** EdgeOne KV namespace is not yet bound to the live project (Phase 1 Plan 02 was skipped) — JWT cookies avoid that dependency entirely and work today.
  - **Known limitation carried forward:** JWT sessions cannot be server-side revoked before natural expiry. Acceptable for v1; revisit if a "force logout all sessions" requirement emerges (not in v1/v2 requirements today).

### Claude's Discretion
- Specific OIDC library/SDK choice (e.g., `openid-client`, `jose` for JWT signing) — left to research/planning to determine what's compatible with the EdgeOne Edge Functions runtime. **Resolved below in Standard Stack.**
- JWT expiry duration and refresh strategy (e.g., sliding expiry vs fixed) — not discussed, use reasonable defaults (research to confirm platform constraints). **Resolved below in Code Examples / Pitfall 4.**
- Exact claim name for tenant mapping (`tenant_id` vs `account_id` vs custom) — pick one convention during planning, document it as the integration contract for customer onboarding docs (future work, out of this phase). **Recommendation: `tenant_id`** (matches the decision's own primary example, and is the most common convention across IdP custom-claim documentation reviewed this session).

### Deferred Ideas (OUT OF SCOPE)
- **KV-backed sessions (server-side revocation)** — deferred, not because it's out of scope, but because it's blocked on the KV namespace binding (Phase 1 Plan 02, currently skipped). If/when KV is set up, revisit whether to migrate from JWT cookies to KV-backed sessions for revocation capability. Not a v1/v2 requirement today, but noted as a natural follow-up.
- **"Force logout all sessions" / explicit revocation** — not a current requirement (AUTH-04 explicit logout is deferred to v2 per REQUIREMENTS.md); JWT's non-revocability limitation only matters if this becomes a requirement later.
- **SAML support** — explicitly out of scope for this phase; noted as a possible v2+ consideration if enterprise customers with legacy-only IdPs are encountered.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can log in via their company's enterprise SSO (OIDC, decided) | Standard Stack (openid-client + jose), Architecture Patterns (redirect flow diagram), Code Examples (authorization URL + PKCE, callback/token exchange) all cover the end-to-end login path. |
| AUTH-02 | User's session persists across browser refresh without re-login | Code Examples (JWT signing/verification with `jose`), Pitfall 4 (expiry/cookie flag choices) cover the httpOnly-cookie session contract from D-06. |
| AUTH-03 | SSO identity resolves server-side to exactly one EdgeOne account (tenant mapping); cannot be influenced by client input | Architecture Patterns (claim extraction happens only in the callback handler after ID-token signature verification, server-side), Pitfall 3 (trusting unsigned/client-supplied claims), Common Pitfalls Pitfall 5 (D-05 "Access denied" no-leak pattern) cover this. |
</phase_requirements>

## Summary

This phase implements a standard OIDC authorization-code flow (with PKCE, per current best practice) entirely inside EdgeOne Edge Functions — the same category of V8-isolate, Web-standards-only runtime as Cloudflare Workers. Two libraries verified this session support that exact runtime class: **`openid-client` v6** (OAuth/OIDC protocol handling: discovery, PKCE, authorization URL building, token exchange) and **`jose` v6** (JWT signing/verification for the session cookie). Both are zero-Node-API, Web Crypto + Fetch only, confirmed via each project's own documentation to run on Cloudflare Workers' `workerd` runtime specifically — the closest verifiable analog to EdgeOne's Edge Functions, since EdgeOne's own docs (verified this session) confirm Edge Functions expose the same Web Crypto API, Fetch API, and standard Web APIs that these libraries depend on exclusively.

The riskiest unknown is *not* protocol correctness — RFC 9700 (the current IETF OAuth 2.0 security best-practice document, Jan 2025) gives an unambiguous, current checklist for PKCE/state/nonce/redirect-URI validation — but whether EdgeOne's specific build pipeline will successfully bundle `openid-client`'s dependency tree (`jose` + `oauth4webapi`) inside `edge-functions/`. Official EdgeOne docs describe Edge Functions' *runtime* capabilities in detail but do not explicitly document npm-dependency bundling behavior for the `edge-functions/` directory the way they do for `cloud-functions/` (which has an explicit `node_modules/` output-location entry in the Build Output API spec). Community evidence (an official EdgeOne example template using `import { createClient } from '@supabase/supabase-js'` directly inside an edge function file) strongly suggests npm imports *are* bundled for Edge Functions too, but this is not spelled out in the authoritative docs — flagged as an assumption requiring a Wave 0 smoke test before committing to `openid-client` as the primary library.

Separately, this research resolves the Phase 1 carried-forward blocker: EdgeOne's official Build Guide documents a console UI path (**Project Settings → Environment Management → Environment Variable**) that applies to a project regardless of whether it was created via GitHub import, template, or CLI — meaning the GitHub-connected canonical deployment (`sso-dashboard.edgeone.dev`) *can* have its real OIDC client secret and JWT signing key set directly through the console, without needing the CLI-linked project workaround that failed in Phase 1.

**Primary recommendation:** Use `openid-client` v6 for the OIDC protocol (discovery + PKCE + authorization-code + token exchange) and `jose` v6 for JWT session-cookie signing/verification, both installed as normal npm dependencies of the Edge Function code. Set real secrets via the EdgeOne Makers **console** (Project Settings → Environment Management) on the GitHub-connected project specifically — not via CLI `env set`, which only reaches the separate CLI-linked project per Phase 1's finding. Include a Wave 0 checkpoint task to smoke-test that `openid-client` actually bundles and executes inside an EdgeOne Edge Function before building the full flow on top of it; if it does not, fall back to hand-rolling the OAuth/OIDC *protocol glue* (raw `fetch()` calls to the discovery/token endpoints, manual PKCE via `crypto.subtle.digest`) while still using `jose` for all cryptographic/signature operations — this fallback does not mean hand-rolling cryptography, only the HTTP request-shaping that `openid-client` would otherwise do.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OIDC discovery, authorization-URL construction, PKCE generation | API / Backend (Edge Function) | — | Must never run client-side — the client_id is not secret but the flow's integrity (state/PKCE binding) requires server-issued, server-checked values `[CITED: rfc9700 §2.1.1, §4.7.1]` |
| Redirect to IdP / handling IdP callback | API / Backend (Edge Function) | Browser (302 redirect target only) | The browser only follows redirects; no OIDC logic runs client-side. Two Edge Function routes: `/api/auth/login`, `/api/auth/callback`. |
| ID token signature verification & claim extraction (tenant mapping) | API / Backend (Edge Function) | — | AUTH-03 requires this resolve **server-side** and be un-influenceable by client input — verification must happen after redemption at the token endpoint, never trusting an unsigned/client-echoed claim `[CITED: rfc9700 §4.5]` |
| Session issuance (sign JWT, set cookie) | API / Backend (Edge Function) | Browser (stores httpOnly cookie) | Signing key never leaves the Edge Function; browser only holds the opaque signed token via httpOnly cookie (D-06). |
| Session verification on subsequent requests | API / Backend (Edge Function) | — | Every protected route/Edge Function must independently call `jwtVerify` — there is no shared server-side session store to consult (no KV, per D-06). |
| "Access denied" unmapped-user page | Browser / Static | API / Backend (redirect target) | D-05: generic static page; the *decision* to show it is made server-side in the callback handler, but the page content itself can be a plain static asset. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openid-client` | 6.8.5 (npm, published 2026-08-11) | OIDC discovery, PKCE code_verifier/code_challenge generation, authorization URL building, authorization-code token exchange, ID token verification | Maintained by the same author (`panva`) as `jose`; DeepWiki-documented Cloudflare Workers (`workerd`) compatibility via pure-ESM, Fetch+WebCrypto-only architecture `[CITED: deepwiki.com/panva/openid-client/1.2-supported-environments]`. Depends only on `jose` and `oauth4webapi`, both similarly runtime-agnostic. `[VERIFIED: npm view openid-client version → 6.8.5, dependencies → {jose: ^6.2.8, oauth4webapi: ^3.8.7}]` |
| `jose` | 6.2.8 (npm, published 2026-08-03) | JWT signing (`SignJWT`) and verification (`jwtVerify`) for the session cookie; also used internally by `openid-client` for ID token verification | Zero runtime dependencies; author's own README explicitly lists Cloudflare Workers as a supported runtime `[CITED: github.com/panva/jose README "Supported Runtimes"]`. `[VERIFIED: npm view jose version → 6.2.8, dependencies → {} (none)]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none required beyond the two above | — | — | No additional cookie-parsing library is needed: EdgeOne's Edge Functions runtime injects a global `Cookies` API (`get`/`set`/`append`/`remove`) natively `[VERIFIED: edgeone.ai/document/52685]` — do not add `cookie` or `js-cookie` npm packages for this. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `openid-client` (full protocol library) | Hand-rolled `fetch()` calls to discovery/authorize/token endpoints + `jose` for verification | Smaller bundle, guaranteed to work with any runtime that has Fetch+WebCrypto, but re-implements PKCE parameter construction and response parsing by hand — more surface area for subtle spec-compliance bugs (e.g. missing `code_challenge_method=S256`, incorrect state binding). Use only as fallback if Wave 0 smoke test shows `openid-client` fails to bundle in `edge-functions/`. |
| `jose` for session JWT | Hand-rolled HMAC via raw `crypto.subtle.sign('HMAC', ...)` | `jose` already wraps this correctly with claim-set validation (`exp`, `iat`, `iss`, `aud` checks) built into `jwtVerify` — hand-rolling loses this validation "for free" and is explicitly flagged in Don't Hand-Roll below. Not recommended under any scenario. |
| OIDC `nonce` for CSRF/injection protection (in addition to PKCE) | Rely on PKCE alone | RFC 9700 says for confidential clients, PKCE alone is *recommended* and provides CSRF protection "even in the presence of strong attackers" as a side effect — nonce is an *alternative* to PKCE for OIDC clients specifically, not strictly required in addition. **Recommendation: implement both** — PKCE for the OAuth-layer code-injection protection, and validate the ID token's `nonce` claim as defense-in-depth, since `openid-client`/OIDC flows return an ID token anyway and the marginal cost of also checking `nonce` is near zero. `[CITED: rfc9700 §2.1.1, §4.5.3.2]` |

**Installation:**
```bash
npm install openid-client jose
```

**Version verification:** Confirmed via `npm view <pkg> version` executed directly this session:
- `openid-client` → `6.8.5`, published 2026-08-11 (same day as this research — actively maintained)
- `jose` → `6.2.8`, published 2026-08-03

Both packages' listed dependency versions were also checked directly (`npm view openid-client dependencies` → `{ jose: '^6.2.8', oauth4webapi: '^3.8.7' }`), confirming no hidden Node-only transitive dependency.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `jose` | npm | ~12 years (created 2014-02-27) | ~113.6M/week | github.com/panva/jose | SUS (automated gate: "too-new" — false positive, see note) | **Approved, flagged.** |
| `openid-client` | npm | long-established (author `panva`, same maintainer as `jose`; v6 is a 2025 rewrite, not a new package) | ~12.3M/week | github.com/panva/openid-client | SUS (automated gate: "too-new" — false positive, see note) | **Approved, flagged.** |
| `oauth4webapi` (transitive dep of `openid-client`) | npm | same author, established | ~12.1M/week | github.com/panva/oauth4webapi | SUS (automated gate: "too-new" — false positive, see note) | **Approved, flagged.** |

**Note on the SUS verdicts:** The automated legitimacy gate (`gsd_run query package-legitimacy check`) flagged all three packages with reason `"too-new"`. This is a **false-positive pattern identical to the one documented in Phase 1's research for the `edgeone` CLI package**: all three are under extremely active, frequent-release maintenance by the same well-known author (`panva`, maintainer of `jose`/`openid-client`/`oauth4webapi`/`node-oidc-provider` for a decade), so the *most recent version's* publish timestamp looks "new" even though the package itself is long-established (`jose`'s npm registry creation date is 2014). Weekly download counts (113M/week for `jose`, 12M+/week for the other two) are consistent with foundational, widely-depended-upon infrastructure packages, not slopsquats. All three have a real GitHub source repository under the same maintainer's account, and none showed a `postinstall` script. Per protocol, package-name provenance is still tagged `[ASSUMED]` at the identity level (discovered via training knowledge + WebSearch, not exclusively from an authoritative source before the npm check), so **the planner must add a `checkpoint:human-verify` task before the `npm install` step**, even though the automated "too-new" signal itself is judged a false positive here.

**Packages removed due to `[SLOP]` verdict:** none
**Packages flagged as suspicious `[SUS]`:** `jose`, `openid-client`, `oauth4webapi` (transitive) — all three: false-positive "too-new" signal, approved with `checkpoint:human-verify` gate before install, per above note.

## Architecture Patterns

### System Architecture Diagram

```
Browser (unauthenticated visit to any protected page)
   │
   │  GET /  (no session cookie, or cookie fails jwtVerify)
   ▼
┌───────────────────────────────────────────────────────────┐
│  Edge Function: any protected route                        │
│  - Cookies.get('session') → jose.jwtVerify() fails/missing │
│  - redirect(302) → /api/auth/login                          │
└───────────────┬───────────────────────────────────────────┘
                ▼
┌───────────────────────────────────────────────────────────┐
│  Edge Function: GET /api/auth/login                         │
│  - openid-client: client.discovery(issuerUrl, clientId,     │
│    clientSecret)   [context.env — set via console]          │
│  - code_verifier = randomPKCECodeVerifier()                 │
│  - code_challenge = calculatePKCECodeChallenge(verifier)    │
│  - state = randomState(); nonce = randomNonce()              │
│  - Set-Cookie: oidc_txn={verifier,state,nonce} (httpOnly,    │
│    Secure, SameSite=Lax, short TTL ~10min)                   │
│  - redirect(302) → IdP authorization_endpoint (buildAuthUrl)│
└───────────────┬───────────────────────────────────────────┘
                │  Browser navigates to IdP, user authenticates
                ▼
        [ Customer's IdP — outside this app's control ]
                │  IdP redirects back with ?code=...&state=...
                ▼
┌───────────────────────────────────────────────────────────┐
│  Edge Function: GET /api/auth/callback                      │
│  - read oidc_txn cookie (verifier/state/nonce), clear it     │
│  - openid-client.authorizationCodeGrant(config, currentUrl,  │
│    { pkceCodeVerifier: verifier, expectedState: state })     │
│  - ID token signature verified INSIDE authorizationCodeGrant │
│    (openid-client validates iss/aud/exp/nonce automatically) │
│  - extract claims.tenant_id                                 │
│    - missing/unrecognized → redirect → /access-denied (D-05)│
│    - present → proceed                                       │
│  - new SignJWT({ tenant_id, sub }).setExpirationTime('12h')  │
│    .sign(SESSION_SIGNING_KEY)                                │
│  - Set-Cookie: session=<jwt> (httpOnly, Secure, SameSite=Lax,│
│    Max-Age matches JWT exp)                                  │
│  - redirect(302) → / (app home, now logged in)               │
└───────────────┬───────────────────────────────────────────┘
                ▼
        Browser now holds session cookie ──► subsequent requests
        verified per-route via jose.jwtVerify(sessionCookie, key)
```

A request first tries the session cookie; if absent or invalid it is bounced through `/api/auth/login` → IdP → `/api/auth/callback`, where the ID token's signature and claims are verified server-side (never trusting a client-supplied value) before a new, app-signed JWT session cookie is issued. `[CITED: pages.edgeone.ai/document/edge-functions (routing/handlers)]`, `[CITED: github.com/panva/openid-client README "Authorization Code Flow"]`, `[CITED: rfc9700 §2.1.1, §4.5]`

### Recommended Project Structure
```
enterprise-sso-dashboard/
├── index.html                        # existing (Phase 1)
├── app.js                             # existing (Phase 1)
├── package.json                       # NEW — needed once npm deps are added
├── edge-functions/
│   ├── api/
│   │   ├── status.js                  # existing (Phase 1)
│   │   └── auth/
│   │       ├── login.js               # GET /api/auth/login — starts OIDC flow
│   │       └── callback.js            # GET /api/auth/callback — token exchange, tenant claim, session issuance
│   └── lib/
│       ├── oidc-config.js             # shared: client.discovery() wrapper, reads env vars
│       └── session.js                 # shared: signSession()/verifySession() using jose
└── access-denied.html                 # static page for D-05 (generic, no info leak)
```

### Pattern 1: OIDC client configuration from per-customer env vars
**What:** A single generic OIDC client configured entirely from environment variables — no per-vendor branching.
**When to use:** Always, per D-02 (generic/standards-compliant client, not vendor-specific SDK).
**Example:**
```javascript
// Source: github.com/panva/openid-client README "Quick Start" — adapted for EdgeOne context.env
// ./edge-functions/lib/oidc-config.js
import * as client from 'openid-client';

let cachedConfig; // best-effort in-memory cache within a warm Edge Function instance

export async function getOidcConfig(env) {
  if (cachedConfig) return cachedConfig;
  const server = new URL(env.OIDC_ISSUER_URL);      // per-customer discovery URL
  cachedConfig = await client.discovery(
    server,
    env.OIDC_CLIENT_ID,
    env.OIDC_CLIENT_SECRET,
  );
  return cachedConfig;
}
```

### Pattern 2: Authorization redirect with PKCE (login handler)
**What:** Build the authorization URL with a fresh PKCE challenge and state per request, stash the verifier/state in a short-lived transaction cookie.
**When to use:** `GET /api/auth/login`.
**Example:**
```javascript
// Source: github.com/panva/openid-client README "Authorization Code Flow" — verbatim API shape
// ./edge-functions/api/auth/login.js
import * as client from 'openid-client';
import { getOidcConfig } from '../../lib/oidc-config.js';

export async function onRequestGet({ request, env }) {
  const config = await getOidcConfig(env);

  const code_verifier = client.randomPKCECodeVerifier();
  const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
  const state = client.randomState();

  const parameters = {
    redirect_uri: env.OIDC_REDIRECT_URI, // e.g. https://sso-dashboard.edgeone.dev/api/auth/callback
    scope: 'openid profile email',
    code_challenge,
    code_challenge_method: 'S256',
    state,
  };

  const redirectTo = client.buildAuthorizationUrl(config, parameters);

  const cookies = new Cookies();
  cookies.set('oidc_txn', JSON.stringify({ code_verifier, state }), {
    httponly: true, secure: true, samesite: 'Lax', max_age: '600', path: '/',
  });

  const response = new Response(null, { status: 302, headers: { Location: redirectTo.href } });
  response.setCookies(cookies);
  return response;
}
```
*(`new Cookies()` / `response.setCookies()` per `[VERIFIED: edgeone.ai/document/52685]` — quoted verbatim in Code Examples below.)*

### Pattern 3: Callback — token exchange, tenant claim, session issuance
**What:** Exchange the code for tokens (verifying PKCE + state), extract the tenant claim from the already-signature-verified ID token, and issue the app's own session JWT.
**When to use:** `GET /api/auth/callback`.
**Example:**
```javascript
// Source: github.com/panva/openid-client README (authorizationCodeGrant shape) +
//         github.com/panva/jose docs/jwt/sign/classes/SignJWT.md (SignJWT chain, verbatim)
import * as client from 'openid-client';
import { SignJWT } from 'jose';
import { getOidcConfig } from '../../lib/oidc-config.js';

export async function onRequestGet({ request, env }) {
  const config = await getOidcConfig(env);
  const cookies = new Cookies(request.headers.get('Cookie'));
  const txnCookie = cookies.get('oidc_txn');
  if (!txnCookie) return redirectToAccessDenied();

  const { code_verifier, state } = JSON.parse(txnCookie.value);

  let tokens;
  try {
    tokens = await client.authorizationCodeGrant(config, new URL(request.url), {
      pkceCodeVerifier: code_verifier,
      expectedState: state,
    });
  } catch {
    return redirectToAccessDenied(); // invalid/expired code, state mismatch, etc.
  }

  const claims = tokens.claims(); // ID token claims, already signature-verified by openid-client
  const tenantId = claims?.tenant_id;
  if (!tenantId) return redirectToAccessDenied(); // D-05: generic denial, no leak

  const secret = new TextEncoder().encode(env.SESSION_SIGNING_KEY);
  const sessionJwt = await new SignJWT({ tenant_id: tenantId, sub: claims.sub })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret);

  const outCookies = new Cookies();
  outCookies.set('session', sessionJwt, {
    httponly: true, secure: true, samesite: 'Lax', max_age: '43200', path: '/',
  });
  outCookies.remove('oidc_txn', { path: '/' });

  const response = new Response(null, { status: 302, headers: { Location: '/' } });
  response.setCookies(outCookies);
  return response;
}

function redirectToAccessDenied() {
  return new Response(null, { status: 302, headers: { Location: '/access-denied.html' } });
}
```

### Pattern 4: Session verification on protected routes
**What:** Every protected Edge Function independently reads and verifies the session cookie — no shared server-side session state exists (D-06).
**Example:**
```javascript
// Source: github.com/panva/jose docs/jwt/verify/functions/jwtVerify.md (verbatim API shape)
import { jwtVerify } from 'jose';

export async function requireSession(request, env) {
  const cookies = new Cookies(request.headers.get('Cookie'));
  const sessionCookie = cookies.get('session');
  if (!sessionCookie) return null;

  try {
    const secret = new TextEncoder().encode(env.SESSION_SIGNING_KEY);
    const { payload } = await jwtVerify(sessionCookie.value, secret);
    return payload; // { tenant_id, sub, iat, exp }
  } catch {
    return null; // expired or tampered — treat as logged out
  }
}
```

### Anti-Patterns to Avoid
- **Trusting an unsigned/client-echoed tenant claim:** AUTH-03 requires the tenant mapping be un-influenceable by client input. Never read `tenant_id` from a query parameter, request body, or any value the browser could have altered — only from the ID token's claims *after* `openid-client`'s internal signature/issuer/audience verification inside `authorizationCodeGrant`/`.claims()`. `[CITED: rfc9700 §4.5]`
- **Using `context.env.KV_NAME`-style access for the Cookies API:** EdgeOne's `Cookies` is a constructor (`new Cookies(...)`) and a `response.setCookies(cookies)` method — not a bare global object like the KV binding. Mixing up these two different "inject a global" patterns (documented in Phase 1's research for KV) is a realistic confusion risk since both are described as "injected at runtime." `[VERIFIED: edgeone.ai/document/52685]`
- **Setting the OIDC client secret via CLI `env set` and assuming it reaches the live GitHub-connected deployment:** Phase 1 proved this is a *separate project identity* problem. Use the console UI path (Project Settings → Environment Management) on the GitHub-connected project specifically. See Pitfall 1.
- **307 redirects anywhere in the OIDC flow:** RFC 9700 explicitly warns 307 preserves the HTTP method/body on redirect, which can leak credentials if a POST-based interaction is ever redirected this way. Use 302 (or 303) for all redirects in this flow — the sample code above uses 302 throughout. `[CITED: rfc9700 §4.12]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PKCE code_verifier/code_challenge generation | Custom base64url + SHA-256 helper | `openid-client`'s `randomPKCECodeVerifier()` / `calculatePKCECodeChallenge()` | Exact byte-length, charset, and encoding requirements per RFC 7636 are easy to get subtly wrong (e.g. wrong base64 variant); the library is maintained by an OpenID Foundation-certified conformant implementation. `[CITED: github.com/panva/openid-client — "Filip Skokan has certified... conforms to Basic, FAPI 1.0, FAPI 2.0 Relying Party Conformance Profiles"]` |
| JWT signing/verification, claim-set validation (`exp`/`iat`/`iss`/`aud`) | Raw `crypto.subtle.sign`/`verify` + manual base64url JSON encoding | `jose`'s `SignJWT`/`jwtVerify` | `jwtVerify` validates the full claims set (expiry, issuer, audience) in one call; hand-rolling this means re-implementing timing-safe comparisons and expiry-window logic that are easy to get wrong under time-zone/clock-skew edge cases. |
| OIDC discovery document fetching/caching, endpoint metadata parsing | Custom `fetch('/.well-known/openid-configuration')` + manual field mapping | `openid-client`'s `client.discovery()` | Handles metadata validation (e.g. `issuer` field must match the requested URL per spec) that a naive fetch-and-parse would skip, which is exactly the kind of gap `[CITED: rfc9700 §2.6]` warns causes misconfiguration-driven vulnerabilities. |
| Cookie serialization (Set-Cookie header formatting, attribute escaping) | Manual string concatenation for `Set-Cookie` | EdgeOne's built-in global `Cookies` API | Already handles the escaping rules for reserved cookie characters and enforces the platform's own cookie-size limits (see Pitfall 2). `[VERIFIED: edgeone.ai/document/52685]` |

**Key insight:** Every hand-rolled piece in this domain (PKCE, JWT claims validation, discovery-document handling) has a documented, spec-referenced CVE-class history of subtle implementation bugs (RFC 9700 exists specifically because of a decade of these). Given this phase's stated top risk is cross-tenant identity confusion (AUTH-03), using conformance-certified libraries for every cryptographic/protocol step is the highest-leverage risk reduction available.

## Common Pitfalls

### Pitfall 1: Setting the real OIDC secret on the wrong Makers project identity (recurrence of Phase 1's D3 gap)
**What goes wrong:** Running `edgeone makers env set OIDC_CLIENT_SECRET ...` and assuming it's live on `sso-dashboard.edgeone.dev`, when the CLI session is linked to a *different* Makers project than the one serving the GitHub-connected domain.
**Why it happens:** Documented in Phase 1 (`01-01-SUMMARY.md`): GitHub-connected deploys and CLI-linked deploys create separate project identities even for the same repo, and the CLI has no command to discover/link to the GitHub-connected project directly.
**How to avoid:** Use the **console UI** path instead: Project Settings → Environment Management → Environment Variable, on the project that serves `sso-dashboard.edgeone.dev` specifically. This is documented as a standard, always-available path regardless of how the project was created (confirmed via the Clerk integration guide, which walks through exactly this for a GitHub-imported project: *"In the left sidebar, find Project Setting, then locate Environment Variables on the page. Modify or add new ones and redeploy."*). `[CITED: pages.edgeone.ai/document/clerk-integration]`, `[CITED: pages.edgeone.ai/document/build-guide "Environment Management"]`
**Warning signs:** `hasConfig: false` (or equivalent) when the deployed Edge Function checks for the secret on the canonical URL — the exact symptom Phase 1 already hit once.

### Pitfall 2: Cookie size limits with a JWT-in-cookie session pattern
**What goes wrong:** The signed session JWT (containing `tenant_id`, `sub`, `iat`, `exp`, plus JWS header/signature overhead) exceeds EdgeOne's per-cookie or total-cookie size limits, silently failing to set.
**Why it happens:** EdgeOne's Cookies API use-limits cap the accumulated size of `value`+`domain`+`path`+`expires`+`max_age`+`samesite` at **1 KB**, and the total size of all cookies at **4 KB**. `[VERIFIED: edgeone.ai/document/52685 "Cookie Limits"]` A minimal HS256 JWT with a handful of short claims is typically 200–400 bytes, which fits comfortably — but this shrinks fast if additional claims (e.g. full IdP claim passthrough, group lists) are added later.
**How to avoid:** Keep the session JWT payload minimal — only `tenant_id`, `sub`, `iat`, `exp` — never store IdP-returned group/role lists or other bulky claims in the cookie. If richer per-request data is ever needed, look it up server-side from the tenant ID rather than growing the cookie.
**Warning signs:** `cookies.set()` returning `false` (per the API's own documented failure mode) rather than throwing.

### Pitfall 3: Attribute name mismatch between claim extraction and Wave 0 test fixtures
**What goes wrong:** Planning/tests assume `tenant_id` as the claim name (per this research's recommendation), but a test IdP or mock is configured with `account_id` or a namespaced claim (e.g. `https://example.com/tenant_id`, a common Auth0/Okta convention for custom claims), causing every login to silently fall into the D-05 "Access denied" path.
**Why it happens:** OIDC custom claims are unstandardized by nature (D-04 explicitly notes this depends on customer IT configuration); many enterprise IdPs (Auth0, Okta) require or default to namespaced/URI-prefixed custom claim names rather than bare `tenant_id`.
**How to avoid:** Document the exact expected claim name (`tenant_id`, bare — this research's recommendation) prominently in the callback handler's code comments and in any test-IdP setup instructions, and make the "claim missing" branch log (server-side, not user-visible per D-05) which claim name was expected vs. what keys were actually present in the ID token, to make Wave 0 debugging fast without violating the no-leak requirement toward end users.
**Warning signs:** Every test login lands on `/access-denied.html` even with a correctly-configured test IdP.

### Pitfall 4: JWT expiry vs. "persists across browser refresh" ambiguity (AUTH-02)
**What goes wrong:** Setting the JWT expiry too short (e.g. 15 minutes, a common access-token default) causes users to be logged out mid-session even though AUTH-02 only requires surviving a *browser refresh*, not an unbounded session.
**Why it happens:** Confusing OAuth *access token* expiry conventions (short-lived, meant to be refreshed) with this app's *session cookie* JWT, which has no refresh mechanism (no KV, no server-side store — D-06) and must be re-obtained by a full login round-trip once expired.
**How to avoid:** Use a longer, fixed expiry appropriate for a session cookie rather than an access token — this research recommends **12 hours** (a typical enterprise workday-session length) as a reasonable default given the explicit acceptance in D-06 that there is no revocation mechanism in v1. Set the cookie's `max_age` to match the JWT's `exp` exactly so the browser discards the cookie at the same moment the token would fail verification anyway.
**Warning signs:** Users report being logged out shortly after logging in despite not closing the browser.

### Pitfall 5: Leaking tenant-mapping info through error messages or response timing (violates D-05)
**What goes wrong:** An error page or API response reveals *why* access was denied (e.g. "no tenant_id claim found", "unrecognized tenant abc-123"), or the "Access denied" page takes a measurably different amount of time to render depending on whether the claim was missing vs. present-but-unrecognized — both leak information D-05 explicitly says must not be exposed.
**Why it happens:** Default error-handling instincts (helpful error messages, early-return optimizations) work directly against the security requirement here.
**How to avoid:** The `/access-denied.html` page must be a single generic static asset with no dynamic content, reached via the same redirect regardless of *which* tenant-mapping failure occurred (missing claim, malformed claim, unrecognized tenant ID). Any diagnostic detail belongs only in server-side logs, never in the response body or URL query string.
**Warning signs:** Code review finds a `?reason=` query parameter on the access-denied redirect, or distinct error page variants per failure type.

## Code Examples

### EdgeOne Cookies API — verbatim constructor/methods (official docs)
```javascript
// Source: edgeone.ai/document/52685 — Cookies API reference, quoted verbatim
const cookies = new Cookies(cookieStr?: string, isSetCookie?: boolean);
cookies.get(name?: string): null | Cookie | Array<Cookie>;
cookies.set(name: string, value: string, options?: Cookie): boolean;
cookies.append(name: string, value: string, options?: Cookie): boolean;
cookies.remove(name: string, options?: Cookie): boolean;
// Cookie object fields (all read-only): name, value, domain, path, expires, max_age, samesite, httponly, secure
```

### jose — SignJWT (symmetric secret), verbatim from official docs
```javascript
// Source: github.com/panva/jose docs/jwt/sign/classes/SignJWT.md — quoted verbatim
const secret = new TextEncoder().encode(
  'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2',
)
const alg = 'HS256'
const jwt = await new jose.SignJWT({ 'urn:example:claim': true })
  .setProtectedHeader({ alg })
  .setIssuedAt()
  .setIssuer('urn:example:issuer')
  .setAudience('urn:example:audience')
  .setExpirationTime('2h')
  .sign(secret)
console.log(jwt)
```

### jose — jwtVerify (symmetric secret), verbatim from official docs
```javascript
// Source: github.com/panva/jose docs/jwt/verify/functions/jwtVerify.md — quoted verbatim
const secret = new TextEncoder().encode(
  'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2',
)
const { payload, protectedHeader } = await jose.jwtVerify(jwt, secret, {
  issuer: 'urn:example:issuer',
  audience: 'urn:example:audience',
})
console.log(protectedHeader)
console.log(payload)
```

### openid-client — Authorization Code Flow with PKCE, verbatim from official README
```typescript
// Source: github.com/panva/openid-client README "Authorization Code Flow" — quoted verbatim
let redirect_uri!: string
let scope!: string
let code_verifier: string = client.randomPKCECodeVerifier()
let code_challenge: string =
  await client.calculatePKCECodeChallenge(code_verifier)
let state!: string

let parameters: Record<string, string> = {
  redirect_uri,
  scope,
  code_challenge,
  code_challenge_method: 'S256',
}

if (!config.serverMetadata().supportsPKCE()) {
  state = client.randomState()
  parameters.state = state
}

let redirectTo: URL = client.buildAuthorizationUrl(config, parameters)
// now redirect the user to redirectTo.href

// --- on callback ---
let tokens: client.TokenEndpointResponse = await client.authorizationCodeGrant(
  config,
  getCurrentUrl(),
  {
    pkceCodeVerifier: code_verifier,
    expectedState: state,
  },
)
```

### EdgeOne Web Crypto — confirms `crypto.subtle` availability (for hand-rolled-fallback scenario only)
```javascript
// Source: edgeone.ai/document/52693 — quoted verbatim, demonstrates the global `crypto` is pre-injected
const encodeContent = new TextEncoder().encode('hello world');
const sha256Content = await crypto.subtle.digest(
  { name: 'SHA-256' },
  encodeContent
);
const result = new Uint8Array(sha256Content);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| OAuth 2.0 implicit grant (`response_type=token`) | Authorization code grant (with PKCE), even for browser-based/SPA clients | Codified in RFC 9700 (Jan 2025), building on years of prior guidance | This phase never considered implicit grant, but worth noting explicitly: `client.buildAuthorizationUrl` in the code example always uses the code flow — do not let any future SDK example nudge toward implicit grant. `[CITED: rfc9700 §2.1.2]` |
| PKCE as a "public client / mobile app only" mechanism | PKCE recommended for **all** OAuth clients, including confidential/server-side web apps | RFC 9700 explicitly generalizes this (§2.1.1: *"Although PKCE was designed as a mechanism to protect native apps, this advice applies to all kinds of OAuth clients, including web applications"*) | This app is a confidential client (has a client_secret), but should still use PKCE per current guidance — reflected in the Pattern 2/3 code examples above, which include PKCE unconditionally rather than branching on client type. |
| `openid-client` v5 and earlier: Node.js-specific, wrapped the `got`/`node-fetch` HTTP stack | `openid-client` v6: complete rewrite, pure ESM, Fetch API + Web Crypto API only, multi-runtime including Cloudflare Workers | v6.0 released per the project's own migration guide | Any pre-2025 blog post/tutorial showing `openid-client` usage with Node-specific APIs (e.g. `Issuer.discover()`, callback-style APIs) is describing the **v5 API**, which is a different shape from the v6 `client.discovery()`/`client.buildAuthorizationUrl()` functions used in this research's code examples. Do not mix v5-style tutorials with the v6 code shown here. `[CITED: deepwiki.com/panva/openid-client/7.1-migrating-to-v6.0]` |

**Deprecated/outdated:** `openid-client` v5.x API shape (`new Issuer(...)`, `Issuer.discover()`) — superseded entirely by v6's functional API (`client.discovery()`, `client.buildAuthorizationUrl()`, `client.authorizationCodeGrant()`) used throughout this document.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | EdgeOne Edge Functions' build pipeline bundles npm-package imports (like Cloudflare Workers/Vercel Edge does) for files under `edge-functions/`, the same way it's documented to for `cloud-functions/` | Standard Stack, Summary | **Medium-high.** If Edge Functions do *not* bundle npm imports the way `cloud-functions/` explicitly does, `openid-client`/`jose` imports will fail at deploy or runtime. Evidence for the assumption: an official EdgeOne example template (`functions-supabase`) shows `import { createClient } from '@supabase/supabase-js'` directly inside an edge function file, deployed via the standard git-push/CLI build pipeline — but the authoritative Building Output Configuration doc only explicitly documents a `node_modules/` output location for `cloud-functions/api-node/`, not for `edge-functions/`. **Mitigated by:** Wave 0 checkpoint task (smoke-test a minimal `import` in a real `edge-functions/` file before building the full flow on top of it). |
| A2 | `openid-client` v6, verified compatible with Cloudflare Workers/`workerd` specifically, will behave the same way on EdgeOne's Edge Functions runtime | Summary, Standard Stack | **Medium.** Both are V8-isolate, Web-standards-only runtimes with confirmed Web Crypto + Fetch support, but they are different products from different vendors — no first-party EdgeOne+openid-client integration example was found this session. **Mitigated by:** same Wave 0 checkpoint as A1; if it fails, the documented fallback (raw `fetch` + `jose`, no `openid-client`) does not depend on this assumption at all. |
| A3 | `tenant_id` (bare, unnamespaced) is the right recommended default claim name, rather than a namespaced/URI-prefixed convention some enterprise IdPs (Auth0, Okta) default to for custom claims | User Constraints (Claude's Discretion), Pitfall 3 | **Low-medium** — this is explicitly a v1 convention decision the phase itself defers to planning/onboarding docs (D-04), not a hard technical constraint. Wrong guess only costs a documentation/convention change, not a security issue, since D-05's generic denial page means a misconfigured claim fails safely either way. |
| A4 | 12-hour session JWT expiry is an appropriate default for AUTH-02's "persists across browser refresh" requirement | Pitfall 4 | **Low** — no explicit business requirement was given for session length; 12h is a reasonable enterprise-session default, but the actual right number is a product decision the user may want to weigh in on (e.g. "8h workday" vs "30 days remember me"). Flagged for discuss-phase/planning confirmation if the user has an opinion. |

**If this table is empty:** N/A — see above; two assumptions (A1, A2) are directly gated by a recommended Wave 0 checkpoint before deeper implementation proceeds.

## Open Questions

1. **(RESOLVED) Does `openid-client`'s full dependency tree fit and execute correctly within EdgeOne Edge Functions' 5 MB code-package limit and 200ms CPU-time limit?**
   - What we know: `openid-client` (unpacked ~225KB) + `jose` (unpacked ~247KB) + `oauth4webapi` are all individually small; combined well under 5MB even accounting for bundler overhead. The 200ms CPU limit excludes I/O wait (network fetches to the IdP), and Web Crypto operations (SHA-256 for PKCE, JWT signature verification) are hardware-accelerated, not pure-JS, so should be fast.
   - What's unclear: Whether the platform's build step actually tree-shakes/bundles these correctly for the `edge-functions/` output target specifically (see Assumption A1), and whether any of `openid-client`'s internal Web Crypto usage patterns hit an EdgeOne-specific edge case not covered by the officially-documented supported-algorithms table.
   - Recommendation: Wave 0 checkpoint — deploy a minimal Edge Function importing both libraries and calling `client.discovery()` against a real or mock IdP before writing the full login/callback flow on top of it.
   - **Resolution**: Addressed directly in `02-01-PLAN.md` Task 1, which is marked `type="tracer"` — the full happy-path OIDC flow (discovery client, login redirect, callback token exchange) is built and verified end-to-end as the first production-quality slice before any expansion, rather than deferred to a separate Wave 0 spike. The automated verify commands (`curl` against `/api/auth/login` expecting a `302`) confirm the bundle deploys and executes correctly on the real platform before the plan is considered complete.

2. **(RESOLVED) Should the OIDC discovery document be fetched fresh on every `/api/auth/login` request, or cached?**
   - What we know: `client.discovery()` performs a `fetch()` to the IdP's `.well-known/openid-configuration` endpoint; this is I/O (not counted against the 200ms CPU budget) but does add latency per login attempt. The Pattern 1 code example above includes a best-effort in-memory module-scope cache, which persists only for the lifetime of a "warm" Edge Function instance (not guaranteed across invocations, and there is no KV to persist it durably per D-06).
   - What's unclear: Whether EdgeOne Edge Functions have long-lived enough warm-instance reuse for this in-memory cache to meaningfully reduce latency in practice, versus refetching being cheap enough that the cache adds complexity for little benefit.
   - Recommendation: Ship with the module-scope cache as shown (harmless if it never hits), but do not treat cache-hit behavior as guaranteed or test against it — treat discovery latency as "always possibly a fresh fetch" for planning/performance purposes.
   - **Resolution**: Implemented exactly as recommended in `edge-functions/lib/oidc-config.js`'s `getOidcConfig(env)` (see `02-01-PLAN.md` Task 1) — a module-scope memoized cache is used as a best-effort optimization only. No test or plan step depends on a cache hit occurring; discovery latency is treated as always-possibly-fresh for planning purposes, matching the recommendation exactly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `openid-client` (npm) | OIDC protocol flow | Not yet installed (to be added this phase) | 6.8.5 (verified current) | Hand-rolled `fetch()`-based protocol glue + `jose` (see Alternatives Considered) if Wave 0 smoke test fails |
| `jose` (npm) | JWT session signing/verification | Not yet installed (to be added this phase) | 6.2.8 (verified current) | None needed — no viable alternative identified; this library has zero dependencies and is the de facto standard for this exact use case |
| EdgeOne Edge Functions Web Crypto API | PKCE challenge generation, JWT sign/verify (via `jose`/`openid-client` internally) | ✓ (confirmed via official docs, full `crypto.subtle` algorithm table including SHA-256/HMAC) | — | — |
| EdgeOne Edge Functions Cookies API | Session cookie + OIDC transaction cookie | ✓ (confirmed via official docs) | — | — |
| Console access to the GitHub-connected Makers project (`sso-dashboard.edgeone.dev`) | Setting real `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/`SESSION_SIGNING_KEY` | Unknown — depends on whether the human executing this phase has console (not just CLI) access | — | If console access is unavailable, this blocks real secret configuration entirely (no CLI equivalent exists that reaches this project per Phase 1's finding) — must be resolved before this phase can be verified end-to-end on the live URL. |
| A real or test OIDC Identity Provider (e.g. a free-tier Auth0/Okta/Keycloak instance) for testing the flow | Wave 0 validation, end-to-end AUTH-01/02/03 verification | Unknown — not provisioned as of this research | — | No fallback — some IdP (even a throwaway free-tier one) is required to test any part of this phase; recommend the planner add an explicit Wave 0 task to provision one if none exists. |

**Missing dependencies with no fallback:**
- A test OIDC Identity Provider — required for any verification of this phase's success criteria; must be provisioned in Wave 0.

**Missing dependencies with fallback:**
- `openid-client` bundling on EdgeOne — has a documented hand-rolled fallback if the Wave 0 smoke test fails.
- Console access to the GitHub-connected project — no code-level fallback, but this is a human/access-provisioning gap, not a technical blocker; flag to the user directly if unresolved before secrets need to be set for real.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none detected in repo yet (no `pytest.ini`/`jest.config.*`/`vitest.config.*`, no `package.json` present at all as of this research) |
| Config file | none — see Wave 0 Gaps |
| Quick run command | `curl -sf -o /dev/null -w "%{http_code}" https://sso-dashboard.edgeone.dev/api/auth/login` → expect `302` |
| Full suite command | Sequential curl/browser-driven checks against all three success criteria (see map below) — this phase's nature (a full-browser OIDC redirect dance) makes it primarily an integration/manual-verification surface, similar to Phase 1 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Unauthenticated visit redirects to IdP; completing auth returns to app logged in | integration (requires real/test IdP + browser) | `curl -sf -o /dev/null -w "%{http_code}" https://sso-dashboard.edgeone.dev/api/auth/login` → expect `302` with `Location` pointing at the configured IdP's `authorization_endpoint`; full round-trip requires a scripted browser (e.g. Playwright) or manual verification against a real test IdP | ❌ Wave 0 |
| AUTH-02 | Session persists across browser refresh without re-login | integration | After a successful login, `curl -sf -b "session=<jwt>" https://sso-dashboard.edgeone.dev/` (or any protected route) → expect `200`, not a redirect back to `/api/auth/login` | ❌ Wave 0 |
| AUTH-03 | Tenant mapping resolves server-side, un-influenceable by client input | integration + code-review-gate | Negative test: craft a request with a client-supplied `tenant_id` query param or header and confirm it has **zero** effect on the resolved session claim (only the verified ID token's claim matters); Positive test: a test IdP configured with a `tenant_id` claim resolves to that exact value in the issued session JWT (decode and inspect) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Local dev via `edgeone makers dev`, manually exercising the login → (mock/test IdP) → callback round-trip; note per Phase 1's research, local dev cannot reach EdgeOne's edge cache/origin for `fetch`, but IdP calls are external HTTPS fetches which *should* work locally — this is untested and should be confirmed in Wave 0.
- **Per wave merge:** Full manual/scripted round-trip against the live deployed URL with the test IdP.
- **Phase gate:** All three success criteria (per ROADMAP.md Phase 2 section) verified against the live deployment before `/gsd-verify-work` — consistent with Phase 1's "not just local dev" standard.

### Wave 0 Gaps
- [ ] `package.json` — does not exist yet in the repo; needed before `npm install openid-client jose` is possible
- [ ] Smoke test: minimal `edge-functions/` file importing `openid-client`/`jose`, deployed and confirmed callable — validates Assumption A1/A2 before building the full flow
- [ ] A test/throwaway OIDC IdP provisioned (see Environment Availability) — no automated test of AUTH-01/02/03 is possible without one
- [ ] Confirmation of console access to the GitHub-connected Makers project for setting real secrets (Pitfall 1) — blocks live-deployment verification if unresolved

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Delegated entirely to the customer's IdP via OIDC — this app never handles passwords; `openid-client` handles the protocol-level authentication assertion verification (ID token signature/issuer/audience). |
| V3 Session Management | yes | JWT-in-httpOnly-cookie pattern (D-06) via `jose`; ASVS-aligned controls: `Secure`, `HttpOnly`, `SameSite=Lax` flags (see Code Examples), bounded expiry (Pitfall 4), no session-fixation risk since the session cookie is only ever set by the server after successful token exchange, never accepted from client input. |
| V4 Access Control | yes | Tenant-scoped access control is *this phase's core purpose* (AUTH-03) — every downstream Edge Function must independently call `jwtVerify` and use only the verified `tenant_id` claim, never a client-supplied one (Pitfall 3, Anti-Patterns). |
| V5 Input Validation | yes | The OIDC callback's `code`/`state` query parameters are validated by `openid-client`'s `authorizationCodeGrant` (state comparison, code format); redirect URIs use exact matching per RFC 9700, not pattern matching (Anti-Patterns). |
| V6 Cryptography | yes | Never hand-rolled — `jose` (JWT signing/verification) and `openid-client`'s internal use of `jose`+`oauth4webapi` for all cryptographic operations (PKCE SHA-256 challenge, ID token signature verification), both backed by the platform's native Web Crypto API (`crypto.subtle`). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF on the OIDC callback (attacker tricks victim's browser into completing an attacker-initiated authorization flow) | Tampering / Spoofing | `state` parameter, generated server-side, bound to a short-lived httpOnly transaction cookie, and checked via `expectedState` in `authorizationCodeGrant` — plus PKCE's `code_verifier`/`code_challenge` binding provides equivalent protection as a side effect per RFC 9700 §4.7.1 |
| Authorization code injection (attacker injects a stolen code into a victim's session with the legitimate client) | Spoofing | PKCE (`code_challenge`/`code_verifier`) per RFC 9700 §4.5.3.1 — the attacker cannot redeem a stolen code without the original `code_verifier`, which never leaves the issuing browser's cookie |
| Open redirect via the callback's redirect target or the initial login redirect | Tampering / Information Disclosure | Both redirects in this flow target fixed, hardcoded destinations (`env.OIDC_REDIRECT_URI` for the outbound leg, `/` or `/access-denied.html` for the inbound leg) — never derived from client-supplied query parameters, per RFC 9700 §4.11.1 ("Clients MUST NOT expose open redirectors") |
| Cross-tenant identity confusion (a user's session resolves to the wrong tenant, or an unmapped user is granted access) | Elevation of Privilege | D-05's generic "Access denied" for any missing/unrecognized claim, combined with never trusting client-supplied tenant identifiers (only the signature-verified ID token claim) — this is the single most important control in this phase given the project's own stated top risk (PROJECT.md: "Cross-tenant data leakage is the top risk to design against") |
| JWT algorithm confusion (e.g. accepting `alg: none` or a mismatched algorithm) | Tampering | `jose`'s `jwtVerify` requires the caller to either pass an explicit key (as in this research's HS256 pattern) or a key-resolution function — it does not trust an attacker-supplied `alg` header from the token itself to pick the verification key, avoiding the classic "alg:none" / algorithm-confusion attack class |

## Sources

### Primary (HIGH confidence)
- `rfc-editor.org/rfc/rfc9700.html` — IETF Best Current Practice for OAuth 2.0 Security (Jan 2025) — fetched in full this session, PKCE/state/nonce/redirect-URI/open-redirect guidance quoted directly
- `npm view jose` / `npm view openid-client` / `npm view oauth4webapi` (executed directly) — versions, publish dates, dependency trees, repository URLs, postinstall scripts
- `edgeone.ai/document/52685` (Cookies API) and `edgeone.ai/document/52693` (Web Crypto API) — official EdgeOne docs, fetched and quoted verbatim this session
- `pages.edgeone.ai/document/edge-functions` — official EdgeOne Edge Functions runtime reference (EventContext, Function Handlers, Runtime APIs, Use Limits) — carried forward from Phase 1's research, re-confirmed this session
- `.planning/phases/01-edgeone-deployment-foundation/01-RESEARCH.md` and `01-01-SUMMARY.md` — this project's own prior-phase research and executed-plan findings (platform constraints, the GitHub-vs-CLI project-identity gap)

### Secondary (MEDIUM confidence)
- `github.com/panva/jose` (README + `docs/jwt/sign/classes/SignJWT.md` + `docs/jwt/verify/functions/jwtVerify.md`) — official project documentation, fetched and quoted verbatim
- `github.com/panva/openid-client` (README) — official project documentation, fetched and quoted verbatim, Authorization Code Flow example
- `deepwiki.com/panva/openid-client/1.2-supported-environments` and `7.1-migrating-to-v6.0` — AI-generated documentation summary of the project's own source/CI config files (package.json runtime matrix, workerd test setup) — a secondary derivative of primary source, not the source itself, hence MEDIUM not HIGH
- `pages.edgeone.ai/document/build-guide` and `pages.edgeone.ai/document/clerk-integration` — official EdgeOne docs confirming the console Environment Management path works for GitHub-imported projects
- `pages.edgeone.ai/document/building-output-configuration` — official Build Output API spec, used to assess Assumption A1 (npm bundling for `edge-functions/` vs `cloud-functions/`)

### Tertiary (LOW confidence)
- `github.com/TencentEdgeOne/pages-templates` `functions-supabase` example (`functions/users/index.js`, raw file fetched) — community/official-template evidence (not authoritative spec) that npm imports work inside an edge function file; the strongest evidence found for Assumption A1, but not from an authoritative "this is guaranteed" statement
- General WebSearch results on cookie SameSite/CSRF conventions — used only to corroborate, not as sole source, given the primary RFC 9700 citation already covers this ground with HIGH confidence

## Metadata

**Confidence breakdown:**
- Standard stack (library choice/versions): MEDIUM-HIGH — versions/dependencies directly verified via `npm view`; Cloudflare Workers compatibility directly documented by both projects, but EdgeOne-specific compatibility is inferred (same runtime class), not directly tested
- Architecture/security patterns (PKCE, state, redirect handling): HIGH — sourced directly from the current IETF Best Current Practice RFC, the most authoritative possible source for this domain
- EdgeOne platform mechanics (Cookies API, Web Crypto, env var console path): HIGH — all fetched directly from official EdgeOne documentation this session, with verbatim quotes
- npm-dependency bundling for `edge-functions/` specifically (Assumption A1): MEDIUM-LOW — the one genuine gap in this research; recommended as an explicit Wave 0 checkpoint rather than assumed correct

**Research date:** 2026-08-11
**Valid until:** ~30 days (2026-09-10) for the EdgeOne-specific platform claims (actively evolving platform, same caveat as Phase 1's research); the RFC 9700 / OAuth security guidance is stable and not time-sensitive; `openid-client`/`jose` version numbers should be re-verified via `npm view` if this research is consumed more than a few weeks after 2026-08-11 given both packages' very active release cadence.
