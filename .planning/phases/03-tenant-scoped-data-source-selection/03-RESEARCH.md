# Phase 3: Tenant-Scoped Data Source Selection - Research

**Researched:** 2026-08-12
**Domain:** Tencent Cloud EdgeOne (`teo`) Open API — CDN traffic analytics + DDoS/security event data, TC3-HMAC-SHA256 request signing on an edge/V8-isolate runtime (EdgeOne Edge Functions), KV-backed tenant-to-account credential mapping
**Confidence:** MEDIUM-HIGH (API contracts and signature algorithm are directly from official Tencent Cloud docs, HIGH; edge-runtime signing via Web Crypto is a documented pattern applied by analogy, MEDIUM — no first-party "teo API from EdgeOne Edge Functions" example was found)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Picker is exactly two cards ("CDN Traffic Stats", "Security Events") — no dropdown/search.
- **D-02:** Tenant identity is derived exclusively from `verifySession()` (Phase 2) — never from client input. **Reversibility: one-way.**
- **D-03:** `tenant_id` claim maps via EdgeOne KV to the specific EdgeOne account credentials (ZoneId + API SecretId/SecretKey) needed to call the real EdgeOne Open API. This mapping's *population* is out of this phase's build scope; only the *read* path is built here. Real API calls, not mocked data.
- **D-04:** Selected data source flows forward as short-lived request state (query param / signed cookie value) — not persisted long-term.
- **D-05:** API failure or empty result → generic "No data available" client-side; never leak raw error bodies, credentials, or zone/account IDs.

### Claude's Discretion (resolved below)
- Exact EdgeOne Open API endpoint names/params for CDN traffic stats and security events → **resolved: `DescribeTimingL7AnalysisData`** (traffic) and **`DescribeDDoSAttackData`** (security/DDoS events) — see Standard Stack.
- Shape of the `tenant_id -> EdgeOne account` KV record → **resolved:** `{ zoneId, secretId, secretKey, apiDomain? }` JSON string, see Architecture Patterns.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | User can select CDN Traffic Stats as a data source | `DescribeTimingL7AnalysisData` API contract (Standard Stack), Architecture diagram |
| DATA-02 | User can select Security Events as a data source | `DescribeDDoSAttackData` API contract (Standard Stack), Architecture diagram |
| DATA-03 | Every query is scoped server-side to the logged-in user's own account; no client input affects scoping | KV-backed `tenant_id -> zoneId` lookup (Architecture Patterns, Pitfall 2), reuses Phase 2's `verifySession()` (AUTH-03 precedent) |

</phase_requirements>

## Summary

Tencent Cloud EdgeOne's Open API (`teo` service) exposes read-only, per-`ZoneId`-scoped analytics endpoints that fit this phase's two data sources exactly: **`DescribeTimingL7AnalysisData`** for CDN traffic (Layer-7 time-series: outbound flux/requests/bandwidth) and **`DescribeDDoSAttackData`** for security/attack events (DDoS attack bandwidth/packet-rate time-series). Both are POST-only JSON APIs on `teo.tencentcloudapi.com` (or `teo.intl.tencentcloudapi.com` for the international console), authenticated per-request with Tencent's **TC3-HMAC-SHA256** signature scheme — a request-canonicalization + HMAC-SHA256 chain (`SecretDate -> SecretService -> SecretSigning`) fully specified in Tencent's own documentation with worked examples in eight languages, none of which is edge-runtime-specific but which requires only `crypto.subtle` (SHA-256 hashing, HMAC-SHA256 signing) — both confirmed available in EdgeOne Edge Functions per Phase 1's platform research.

There is **no official Tencent Cloud SDK build target for V8-isolate edge runtimes** (`tencentcloud-sdk-nodejs` depends on Node's `crypto`/`http` modules, not Fetch/Web Crypto) — unlike Phase 2's `openid-client`/`jose`, which explicitly targeted Cloudflare Workers. This means the SDK is **not usable as-is inside `edge-functions/`**, and the correct, lowest-risk path is to **hand-roll the TC3-HMAC-SHA256 signing logic directly against `crypto.subtle`**, following Tencent's own algorithm spec verbatim (canonical request → string-to-sign → HMAC chain → Authorization header). This is explicitly *not* the kind of hand-rolling the `Don't Hand-Roll` table normally warns against (that guidance targets *cryptographic primitives* like raw HMAC math or JWT claim validation) — here the "primitive" (`crypto.subtle.sign('HMAC', ...)`) is the platform-native building block, and only the *request-shaping* (string concatenation per Tencent's documented format) is hand-rolled, exactly analogous to Phase 2's fallback plan for `openid-client` if bundling had failed.

**Primary recommendation:** Build a small `edge-functions/lib/teo-signer.js` module implementing TC3-HMAC-SHA256 using `crypto.subtle` (no npm dependency, no package-legitimacy gate needed), a `edge-functions/lib/tenant-mapping.js` module reading the KV-backed `tenant_id -> { zoneId, secretId, secretKey }` record, and two thin Edge Function routes (`/api/data/cdn-traffic`, `/api/data/security-events`) that: verify session → resolve tenant → look up account credentials → sign and POST to the real `teo` API → return only the metric data (never echo credentials). A `checkpoint:human-verify` task is required to seed one real KV mapping record + real Tencent Cloud API SecretId/SecretKey with `teo` read permissions, since population is explicitly out of this phase's build scope but live verification cannot proceed without at least one real record.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Data-source picker (two cards) | Browser / Static | — | D-01: pure UI, gated by an existing session check before rendering (same pattern as Phase 2's login-state UI) |
| Tenant → EdgeOne account credential lookup | API / Backend (Edge Function, KV read) | — | D-03: must never be client-influenced; KV read happens only after `verifySession()` succeeds server-side |
| TC3-HMAC-SHA256 request signing | API / Backend (Edge Function) | — | SecretKey never leaves the Edge Function; signing must happen server-side per-request (timestamps are short-lived — signature expires after 5 min per Tencent's spec) |
| Real `teo` API call (`DescribeTimingL7AnalysisData` / `DescribeDDoSAttackData`) | API / Backend (Edge Function, outbound `fetch`) | — | DATA-03: `ZoneIds` param is set server-side from the KV-resolved value only, never from client input |
| "No data available" generic state | Browser / Static | API / Backend (decides which response shape to send) | D-05: mirrors Phase 2's D-05 no-leak convention for access-denied |

## Standard Stack

### Core

No new npm dependency is required or recommended for this phase.

| Approach | Purpose | Why |
|----------|---------|-----|
| Hand-rolled TC3-HMAC-SHA256 via `crypto.subtle` | Signs every `teo` Open API request | No edge-runtime-compatible SDK exists for Tencent Cloud API 3.0 (`tencentcloud-sdk-nodejs` requires Node's `crypto`/`http`, not confirmed Workers/edge-compatible anywhere in official docs — unlike `jose`/`openid-client` in Phase 2, which explicitly listed Cloudflare Workers support). The algorithm itself is fully specified by Tencent `[CITED: intl.cloud.tencent.com/zh/document/product/583/31703]` and requires only `crypto.subtle.digest('SHA-256', ...)` and `crypto.subtle.sign('HMAC', ...)`, both confirmed available in EdgeOne Edge Functions `[VERIFIED: edgeone.ai/document/52693, carried forward from 02-RESEARCH.md]`. |
| Native `fetch()` | Sends the signed POST request to `teo.tencentcloudapi.com` | Same Web-standard primitive used throughout this codebase (no HTTP client library needed). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled TC3 signing | `tencentcloud-sdk-nodejs` (official SDK) | Would need to verify Node-API-free bundling on `edge-functions/` first (same class of risk flagged as Assumption A1 in 02-RESEARCH.md for `openid-client`) — but unlike `openid-client`, no vendor documentation anywhere claims edge/Workers compatibility for this SDK, making the bundling risk **unverified and unmitigated** rather than merely unconfirmed. Hand-rolling against a fully-specified, example-rich algorithm is the lower-risk choice here. |
| Hardcoded `teo.tencentcloudapi.com` domain | Env-var-configurable API domain (`TEO_API_DOMAIN`) | **Recommended**: mirrors D-02/Phase-2's "generic, not vendor-locked" pattern — some customers' accounts may need the international endpoint (`teo.intl.tencentcloudapi.com`) instead of the mainland one. Default to `teo.tencentcloudapi.com`, override per-tenant if ever needed (out of v1 scope to make this per-tenant; a single global env var default is sufficient). |

## Package Legitimacy Audit

Not applicable — no new npm packages are installed this phase. `package.json` remains unchanged (still only `openid-client`, `jose` from Phase 2).

## Architecture Patterns

### System Architecture Diagram

```
Browser (session cookie already set, per Phase 2)
   │
   │  GET /data-source.html (or extended index.html)
   ▼
┌────────────────────────────────────────────────────────────────┐
│  Static picker page: two cards, "CDN Traffic Stats" /          │
│  "Security Events" — each an onclick that fetches the           │
│  matching Edge Function route and renders the JSON result       │
└───────────────┬──────────────────────────────────────────────┬─┘
                ▼                                              ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│ Edge Function: GET/POST           │   │ Edge Function: GET/POST           │
│ /api/data/cdn-traffic             │   │ /api/data/security-events         │
│ 1. verifySession(cookie) -> null? │   │ 1. verifySession(cookie) -> null? │
│    -> 401 (never fall through)    │   │    -> 401                         │
│ 2. tenant_id from verified JWT    │   │ 2. tenant_id from verified JWT    │
│ 3. my_kv.get(`tenant:${tenant_id}`)│   │ 3. my_kv.get(`tenant:${tenant_id}`)│
│    -> { zoneId, secretId,         │   │    -> { zoneId, secretId,         │
│         secretKey }                │   │         secretKey }                │
│    -> missing? D-05 "No data"      │   │    -> missing? D-05 "No data"      │
│ 4. signTC3Request(action=          │   │ 4. signTC3Request(action=          │
│    'DescribeTimingL7AnalysisData', │   │    'DescribeDDoSAttackData',       │
│    { ZoneIds:[zoneId], ... })      │   │    { ZoneIds:[zoneId], ... })      │
│ 5. fetch(teo API, signed headers)  │   │ 5. fetch(teo API, signed headers)  │
│ 6. return { Data: [...] } only —   │   │ 6. return { Data: [...] } only —   │
│    never echo secretKey/secretId   │   │    never echo secretKey/secretId   │
└───────────────────────────────────┘   └───────────────────────────────────┘
```

A request never reaches the real `teo` API without first passing `verifySession()` — the same "trust boundary at the Edge Function" pattern established in Phase 2 (AUTH-03) is reused verbatim for DATA-03, extended one hop further to also gate the *outbound* credential lookup and API call, not just the inbound session check.

### Recommended Project Structure

```
enterprise-sso-dashboard/
├── index.html                          # existing — extended with a "Select data source" section (D-01, gated on login)
├── app.js                               # existing — extended with card click handlers -> fetch(/api/data/...)
├── edge-functions/
│   ├── api/
│   │   ├── status.js                    # existing (Phase 1/2)
│   │   ├── auth/                        # existing (Phase 2)
│   │   └── data/
│   │       ├── cdn-traffic.js           # NEW — GET, session-gated, DATA-01
│   │       └── security-events.js       # NEW — GET, session-gated, DATA-02
│   └── lib/
│       ├── oidc-config.js               # existing (Phase 2)
│       ├── session.js                   # existing (Phase 2) — verifySession() reused, no changes
│       ├── teo-signer.js                # NEW — TC3-HMAC-SHA256 request signing via crypto.subtle
│       └── tenant-mapping.js            # NEW — KV read: tenant_id -> { zoneId, secretId, secretKey }
```

### Pattern 1: TC3-HMAC-SHA256 signing via `crypto.subtle` (no SDK)
**What:** Build the canonical request, string-to-sign, derive the signing key via the HMAC chain, and produce the `Authorization` header — entirely with `crypto.subtle`.
**When to use:** Every outbound call to `teo.tencentcloudapi.com`.
**Example (algorithm, adapted from Tencent's own Node.js reference — using Web Crypto instead of Node's `crypto` module):**
```javascript
// Source: intl.cloud.tencent.com/zh/document/product/583/31703 "TC3-HMAC-SHA256 Signature Algorithm"
// — steps quoted verbatim; adapted from the doc's Node.js example (which uses
// Node's `crypto.createHmac`/`createHash`) to EdgeOne's Web Crypto (`crypto.subtle`).
// ./edge-functions/lib/teo-signer.js
const enc = new TextEncoder();

async function sha256Hex(message) {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(message));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(message));
}

async function hmacHex(keyBytes, message) {
  const sig = await hmac(keyBytes, message);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// action: e.g. 'DescribeTimingL7AnalysisData'; version: e.g. '2022-01-06'; payload: JS object
export async function signTeoRequest({ secretId, secretKey, action, version, payload, domain }) {
  const host = domain || 'teo.tencentcloudapi.com';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const payloadStr = JSON.stringify(payload);

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const hashedPayload = await sha256Hex(payloadStr);
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n');

  const service = 'teo';
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, hashedCanonicalRequest].join('\n');

  const secretDate = await hmac(enc.encode('TC3' + secretKey), date);
  const secretService = await hmac(new Uint8Array(secretDate), service);
  const secretSigning = await hmac(new Uint8Array(secretService), 'tc3_request');
  const signature = await hmacHex(new Uint8Array(secretSigning), stringToSign);

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${host}/`,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
    },
    body: payloadStr,
  };
}
```
**Note on `hmac()` return type:** `crypto.subtle.sign` returns an `ArrayBuffer`; the second call in each chain step (`hmac(new Uint8Array(secretDate), service)`) must pass the raw bytes, not the hex string — this mirrors Tencent's own pseudocode (`SecretDate = HMAC_SHA256("TC3"+SecretKey, Date)` keeps intermediate results as raw bytes through the whole chain, only hex-encoding the *final* signature) `[CITED: intl.cloud.tencent.com/zh/document/product/583/31703 "Step 3: Calculating the Signature"]`.

### Pattern 2: KV-backed tenant → EdgeOne account mapping (read-only this phase)
**What:** A single KV read, keyed by the verified `tenant_id`, returning the real Zone ID + API credentials needed to call `teo` on that tenant's behalf.
**When to use:** First step after `verifySession()` succeeds, before any outbound API call.
**Example:**
```javascript
// ./edge-functions/lib/tenant-mapping.js
// KV key convention: `tenant:${tenant_id}` -> JSON string { zoneId, secretId, secretKey }
// Population (writing these records) is out of this phase's scope (D-03) — onboarding-time
// concern. This module only reads.
export async function getTenantAccount(tenantId) {
  if (typeof my_kv === 'undefined') return null; // KV not bound — fail closed, not open
  const raw = await my_kv.get(`tenant:${tenantId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.zoneId || !parsed.secretId || !parsed.secretKey) return null;
    return parsed;
  } catch {
    return null; // malformed record -> treat as no mapping, never throw raw parse errors to caller
  }
}
```

### Pattern 3: Session-gated data route, no client-influenced scoping (extends Phase 2's AUTH-03 pattern)
**What:** The full request path — verify session, resolve tenant, look up account, sign, fetch, return only metric data.
**Example:**
```javascript
// ./edge-functions/api/data/cdn-traffic.js
import { verifySession } from '../../lib/session.js';
import { getTenantAccount } from '../../lib/tenant-mapping.js';
import { signTeoRequest } from '../../lib/teo-signer.js';

export async function onRequestGet({ request, env }) {
  const cookies = new Cookies(request.headers.get('Cookie'));
  const sessionCookie = cookies.get('session');
  const payload = sessionCookie ? await verifySession(sessionCookie.value, env) : null;
  if (!payload) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

  const account = await getTenantAccount(payload.tenant_id); // D-02: tenant_id ONLY from verified JWT
  if (!account) {
    return new Response(JSON.stringify({ available: false }), { headers: { 'Content-Type': 'application/json' } }); // D-05
  }

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
  const { url, headers, body } = await signTeoRequest({
    secretId: account.secretId,
    secretKey: account.secretKey,
    action: 'DescribeTimingL7AnalysisData',
    version: '2022-01-06',
    payload: {
      StartTime: startTime.toISOString(),
      EndTime: endTime.toISOString(),
      MetricNames: ['l7Flow_outFlux'],
      Interval: 'hour',
      ZoneIds: [account.zoneId], // D-03: server-resolved only, never from client input
    },
    domain: env.TEO_API_DOMAIN,
  });

  let teoResponse;
  try {
    const res = await fetch(url, { method: 'POST', headers, body });
    teoResponse = await res.json();
  } catch {
    return new Response(JSON.stringify({ available: false }), { headers: { 'Content-Type': 'application/json' } }); // D-05
  }

  if (teoResponse.Response?.Error) {
    return new Response(JSON.stringify({ available: false }), { headers: { 'Content-Type': 'application/json' } }); // D-05: never leak Response.Error.Message
  }

  return new Response(JSON.stringify({ available: true, data: teoResponse.Response.Data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```
`security-events.js` is structurally identical, differing only in `action: 'DescribeDDoSAttackData'`, `version: '2022-09-01'`, and `MetricNames: ['ddos_attackBandwidth']`.

### Anti-Patterns to Avoid
- **Reading `ZoneIds` (or any account identifier) from a query parameter, header, or request body.** DATA-03 requires server-side-only resolution — the *only* legitimate source is `getTenantAccount(payload.tenant_id)`, where `payload` came from `verifySession()`. This is the direct DATA-03 analog of Phase 2's AUTH-03 anti-pattern.
- **Echoing `teoResponse.Response.Error.Message` (or any raw API error) to the client.** Violates D-05 — Tencent's error messages sometimes include the `ZoneId` or account context in the text, which would leak tenant identifiers.
- **Signing with stale/reused timestamps.** Tencent's signature expires after a 5-minute clock-skew window `[CITED: intl.cloud.tencent.com/zh/document/product/583/31703]` — always compute `timestamp = Math.floor(Date.now() / 1000)` fresh per request; never cache a signed request across invocations.
- **Storing `secretKey` anywhere client-visible** (response body, logs visible to the client, URL). It only ever exists inside the Edge Function's KV-read → sign → fetch chain.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing / HMAC-SHA256 primitives themselves | Custom JS SHA-256/HMAC implementation | `crypto.subtle.digest('SHA-256', ...)` / `crypto.subtle.sign('HMAC', ...)` | These are the platform-native, hardware-accelerated primitives — never reimplement hashing in pure JS. This is the one part of "TC3 signing" that must **not** be hand-rolled; only the *request-shaping* (concatenation order, canonical header format) around these primitives is hand-rolled, per Tencent's own documented algorithm. |
| Parsing/validating malformed KV mapping records | Assume the KV value is always well-formed JSON | `try/catch` around `JSON.parse`, validate all three required fields before returning (Pattern 2) | A malformed or partially-written KV record must fail closed (treated as "no mapping" → D-05 generic state), not throw an unhandled exception that could leak a stack trace to the client. |

## Common Pitfalls

### Pitfall 1: Wrong signature domain/version pairing per API
**What goes wrong:** Using the CDN traffic API's `Version: 2022-01-06` when calling `DescribeDDoSAttackData` (which requires `2022-09-01`), causing a `Version` mismatch error that Tencent Cloud returns as a generic auth-adjacent failure, easily confused with a signature bug.
**Why it happens:** Each `teo` API action has its own `Version` value tied to when that specific action's contract was published — this is not a single monolithic API version.
**How to avoid:** Hardcode the `version` argument per call site exactly as documented (`2022-01-06` for `DescribeTimingL7AnalysisData`, `2022-09-01` for `DescribeDDoSAttackData`) — never share one constant across both routes.
**Warning signs:** A `teo` API call fails with an error unrelated to credentials/signature math even though the signature computation is provably correct.

### Pitfall 2: `ZoneIds` becoming a required parameter over time
**What goes wrong:** Tencent's own change notice states `ZoneIds`/`ZoneId` parameters across the `teo` API surface changed from optional to **mandatory** as of May 30, 2024 `[CITED: intl.cloud.tencent.com/document/product/1145/59980]`. Any code path that omits `ZoneIds` (e.g., relying on an "account-level default") will now fail outright rather than silently querying the wrong scope — which is actually the *safe* failure mode for this phase's tenant-isolation goal, but must be understood, not treated as a bug to work around.
**Why it happens:** Platform-wide security tightening after this API's initial release.
**How to avoid:** Always pass `ZoneIds: [account.zoneId]` explicitly (Pattern 3) — never rely on an implicit "all zones under this credential" default, which would be the opposite of what DATA-03 requires anyway.
**Warning signs:** N/A for this phase's design (already always passing `ZoneIds` explicitly) — flagged for awareness only.

### Pitfall 3: Confusing the KV binding pattern with `context.env`
**What goes wrong:** Writing `context.env.my_kv.get(...)` instead of the bare global `my_kv.get(...)`, following the (different) pattern used for secrets like `SESSION_SIGNING_KEY`.
**Why it happens:** Documented already in Phase 1/2's research as a realistic confusion risk — two different "injected global" conventions on this platform (KV = bare global, secrets = `context.env`).
**How to avoid:** `tenant-mapping.js` (Pattern 2) uses the exact same `typeof my_kv === 'undefined'` guard already proven working in `edge-functions/api/kv-check.js` (Phase 1 Plan 02) — copy that convention, don't reinvent it.
**Warning signs:** `ReferenceError: my_kv is not defined` vs. silently getting `undefined` from a wrong-shaped `context.env` access.

### Pitfall 4: Treating a successful-but-empty `teo` API response as an error (or vice versa)
**What goes wrong:** A tenant with a real, valid `zoneId` but genuinely no traffic/attacks in the queried window returns `Response.Data: []` (a *successful* empty result) — code that treats "empty array" the same as "API call failed" would incorrectly show the same D-05 "No data available" message, which is actually fine UX-wise but should not be conflated with a real failure path in error-handling logic (e.g., for future logging/alerting).
**Why it happens:** Both "genuinely no data" and "API call failed" end up rendering the same client-facing message under D-05, but they are different server-side code paths (one is `res.ok` with empty `Data`, the other is a caught exception or `Response.Error` present).
**How to avoid:** Keep the three branches distinct in code even though they converge on the same client message: (1) no KV mapping → `available:false`, (2) `fetch`/network failure → `available:false`, (3) `teoResponse.Response.Error` present → `available:false`. A successful response with `Data: []` should still return `available:true, data: []` — the client can render "no data in this window" without it being a *server* failure state.
**Warning signs:** Server-side logs (not user-visible) show no distinction between "tenant genuinely has zero traffic" and "credentials are invalid" — makes onboarding debugging harder later, though not a security issue for v1.

### Pitfall 5: Leaking account/zone identifiers through error messages (violates D-05)
**What goes wrong:** Same class of risk as Phase 2's Pitfall 5 (D-05 for access-denied) — Tencent's own API error bodies (`Response.Error.Message`) sometimes include the `ZoneId` or resource identifiers directly in human-readable text (e.g., `"ZoneId zone-xxx not found"`).
**How to avoid:** Never forward `teoResponse.Response.Error` (or any part of it) to the client response body — the generic `{ available: false }` shape (Pattern 3) is the only thing the client ever sees on any failure path.
**Warning signs:** Code review finds a `console.log`-only intent that accidentally lands in the `Response` object sent to the client, or a `catch` block that re-throws/serializes the caught error directly.

## Code Examples

### Tencent Cloud TC3-HMAC-SHA256 — canonical request format (verbatim pseudocode, official doc)
```
CanonicalRequest =
    HTTPRequestMethod + '\n' +
    CanonicalURI + '\n' +
    CanonicalQueryString + '\n' +
    CanonicalHeaders + '\n' +
    SignedHeaders + '\n' +
    HashedRequestPayload
```
`[CITED: intl.cloud.tencent.com/zh/document/product/583/31703 "1. Concatenating the CanonicalRequest String"]`

### String to sign (verbatim pseudocode, official doc)
```
StringToSign =
    Algorithm + \n +
    RequestTimestamp + \n +
    CredentialScope + \n +
    HashedCanonicalRequest
```
`[CITED: same source, "2. Concatenating the String to Be Signed"]`

### Signing key derivation chain (verbatim pseudocode, official doc)
```
SecretDate = HMAC_SHA256("TC3" + SecretKey, Date)
SecretService = HMAC_SHA256(SecretDate, Service)
SecretSigning = HMAC_SHA256(SecretService, "tc3_request")
Signature = HexEncode(HMAC_SHA256(SecretSigning, StringToSign))
```
`[CITED: same source, "3. Calculating the Signature"]`

### `DescribeTimingL7AnalysisData` — verbatim request/response shape (official doc)
```json
// Input
{
  "StartTime": "2020-09-22T00:00:00+00:00",
  "EndTime": "2020-09-22T00:00:00+00:00",
  "MetricNames": ["l7Flow_outFlux"],
  "Interval": "hour",
  "ZoneIds": ["zone-xxxxxxxx"]
}
// Output
{
  "Response": {
    "Type": "xx",
    "Interval": "xx",
    "Data": [
      { "TypeKey": "xx", "TypeValue": [ { "Max": 0, "Sum": 0, "Avg": 0, "MetricName": "xx",
        "Detail": [ { "Timestamp": 0, "Value": 0 } ] } ] }
    ],
    "RequestId": "xx"
  }
}
```
`[CITED: intl.cloud.tencent.com/document/api/1145/49235]`

### `DescribeDDoSAttackData` — verbatim request/response shape (official doc)
```json
// Input
{
  "MetricNames": ["ddos_attackBandwidth"],
  "Interval": "hour",
  "ZoneIds": ["zone-xxxxxxxx"],
  "StartTime": "2022-08-22T00:00:00+00:00",
  "EndTime": "2022-08-23T00:00:00+00:00"
}
// Output
{
  "Response": {
    "TotalCount": 1,
    "Data": [
      { "Value": [ { "Max": 100, "Metric": "ddos_attackMaxBandwidth", "Avg": 100, "Sum": 100,
        "Detail": [ { "Timestamp": 1660010100, "Value": 100 } ] } ], "Key": "ddos_attackMaxBandwidth" }
    ],
    "RequestId": "xx"
  }
}
```
`[CITED: www.tencentcloud.com/document/product/1145/49235 (DescribeDDoSAttackData variant, same shape family)]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `ZoneIds` optional (any omission queried account-wide) | `ZoneIds` mandatory on all `teo` APIs involving zone-scoped resources | May 30, 2024 platform-wide change `[CITED: intl.cloud.tencent.com/document/product/1145/59980]` | Actually *helps* this phase's tenant-isolation goal — the platform itself now refuses to run an ambiguous, unscoped query. Still always pass `ZoneIds` explicitly (Pitfall 2) regardless. |
| `DescribeOverviewL7Data` (older traffic API) | `DescribeTimingL7AnalysisData` (current) | `DescribeOverviewL7Data`'s own doc states it is "to be discarded, use `DescribeTimingL7AnalysisData`" `[CITED: intl.cloud.tencent.com/document/product/1145/50516]` | Do not follow any tutorial/example referencing `DescribeOverviewL7Data` or the older cache-analysis-specific `DescribeTimingL4AnalysisData` variants — use `DescribeTimingL7AnalysisData` as the current, non-deprecated action for this phase. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | EdgeOne Edge Functions' `crypto.subtle` supports `importKey('raw', ..., { name: 'HMAC', hash: 'SHA-256' }, ...)` and `sign('HMAC', ...)` — not just `digest()` | Standard Stack, Pattern 1 | **Low-medium.** Phase 1's platform research confirmed `crypto.subtle.digest` (SHA-256) explicitly via a verbatim EdgeOne doc example, but did not explicitly test the `HMAC` `sign`/`importKey` path. Both are part of the same standard Web Crypto API surface that any V8-isolate runtime implements, so risk is low, but not independently re-verified this session against EdgeOne's docs specifically. **Mitigated by:** the tracer task (Plan 03-01, Task 1) exercises this exact code path against the real live deployment before any expansion work — if it fails, the fallback is a Node `crypto`-compatible polyfill is NOT available at edge, so failure here would require escalating to the user for a platform-support question, not a code workaround. |
| A2 | `teo.tencentcloudapi.com` is reachable via `fetch()` from within an EdgeOne Edge Function (outbound HTTPS to a third-party API host, not just EdgeOne's own APIs) | Architecture Patterns, Pattern 3 | **Low.** Phase 2's OIDC flow already proves outbound `fetch()` to an arbitrary external HTTPS host (the customer's IdP) works from EdgeOne Edge Functions — this is the same capability, different destination. No new platform capability is being assumed. |
| A3 | `DescribeDDoSAttackData` (DDoS-specific metrics) is an acceptable v1 interpretation of REQUIREMENTS.md's broader "Security Events" (DATA-02) | User Constraints (Claude's Discretion) | **Low-medium** — this is a scope-interpretation decision, not a technical risk. DDoS attack data is the most concretely and completely documented security-analytics endpoint found in the `teo` Data Analysis API category this session; other security-adjacent APIs exist (e.g., Web Protection/Bot Management event logs) but were less completely documented in the sources reviewed. If the user wants WAF/bot-management events specifically instead of DDoS, this is a same-shaped swap (different `Action`/`MetricNames`) in `security-events.js`, not an architecture change. |

## Open Questions (RESOLVED)

1. **Does the exact KV record shape (`{ zoneId, secretId, secretKey }`) match what a real onboarding process will eventually populate?**
   - What we know: D-03 explicitly defers population design to a future onboarding phase; this phase only needs *a* well-defined read contract to build against.
   - What's unclear: Whether onboarding will eventually store one shared platform-level SecretId/SecretKey pair (with per-tenant API-level scoping via IAM/CAM policies) rather than per-tenant raw credentials. Both shapes satisfy this phase's read-path contract identically (only the *population* mechanism differs, which is out of scope).
   - RESOLVED: Build against the per-tenant-credentials shape now (simplest to seed manually for live verification per the Wave 0/checkpoint task); document the KV key/value contract clearly in code comments so a future onboarding-automation phase can populate it correctly regardless of which credential-provisioning strategy is eventually chosen.

## Environment Availability

| Dependency | Required By | Available | Fallback |
|------------|------------|-----------|----------|
| `crypto.subtle` HMAC-SHA256 signing | TC3 request signing (Pattern 1) | Assumed available (Assumption A1) — same Web Crypto surface confirmed for SHA-256 digest in Phase 1 research | None viable at edge if unavailable — would require escalating to the user; no Node-`crypto` polyfill exists in this runtime |
| EdgeOne KV (`my_kv` binding) | Tenant-mapping read (Pattern 2) | ✓ bound since Phase 1 Plan 02 | — |
| A real Tencent Cloud API SecretId/SecretKey pair with `teo` read permissions | Live verification of both data routes | **Not yet provisioned** — must be obtained by the human executing this phase (Tencent Cloud Console → API Key management) | No fallback — mocking the API response would violate this project's established "prove it live, not mocked" precedent (Phase 1/2) and directly contradicts D-03's explicit "real EdgeOne Open API calls, not mocked data" instruction |
| At least one real EdgeOne Zone ID under that account, with some CDN traffic (even minimal) to query | Live verification of DATA-01/02 returning non-empty-by-error data | **Not yet provisioned** | If no real traffic exists yet, an empty-but-successful `Data: []` response is still an acceptable verification outcome (Pitfall 4) — only a `Response.Error` would indicate a real problem |

**Missing dependencies with no fallback:**
- Real Tencent Cloud API credentials + at least one real Zone ID — required for any live verification; must be provisioned by the human before Plan 03-01's checkpoint task can be completed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none in repo (consistent with Phase 1/2 — this is an integration-verification-heavy project, not a unit-test-driven one) |
| Quick run command | `curl -sf -b "session=<jwt>" https://{live-url}/api/data/cdn-traffic` → expect `{"available":true,...}` or `{"available":false}` (never a 500 or leaked credential) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | User can select CDN Traffic Stats; a real, tenant-scoped fetch succeeds | integration | `curl -sf -b "session=<jwt>" https://{live-url}/api/data/cdn-traffic` → `available` present, `data` is an array if `true` | ❌ new this phase |
| DATA-02 | User can select Security Events; a real, tenant-scoped fetch succeeds | integration | `curl -sf -b "session=<jwt>" https://{live-url}/api/data/security-events` → same shape | ❌ new this phase |
| DATA-03 | Client-supplied scoping input has zero effect; unauthenticated request is rejected | integration + negative test | (a) `curl -sf https://{live-url}/api/data/cdn-traffic` (no cookie) → `401`; (b) `curl -sf -b "session=<jwt>" "https://{live-url}/api/data/cdn-traffic?zoneId=some-other-zone"` → confirm response is unaffected (still the session's real `zoneId`, query param ignored) | ❌ new this phase |

### Sampling Rate
- **Per task commit:** Manual `curl` against local dev (`edgeone makers dev`) where possible — note per Phase 1/2's carried-forward finding, local dev may not reach third-party HTTPS `fetch()` origins reliably; treat live-deployment verification as authoritative.
- **Phase gate:** All three ROADMAP Phase 3 success criteria verified against the live deployed URL before `/gsd-verify-work`, consistent with Phase 1/2's standard.

### Wave 0 Gaps
- [ ] Real Tencent Cloud API SecretId/SecretKey with `teo` read permissions — must be provisioned by the human (see `user_setup` in PLAN.md)
- [ ] At least one real Zone ID + one KV record (`tenant:<test-tenant-id>`) seeded manually — required before the live-verification checkpoint

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V4 Access Control | yes | Every data route re-derives `tenant_id` from `verifySession()` independently (no shared session store to consult, per Phase 2's D-06) — this phase's core purpose (DATA-03). |
| V6 Cryptography | yes | TC3-HMAC-SHA256 signing built entirely on `crypto.subtle` primitives (SHA-256 digest, HMAC-SHA256 sign) — the *primitives* are never hand-rolled, only the request-shaping around them (Don't Hand-Roll). |
| V13 API and Web Service | yes | Outbound API calls to `teo.tencentcloudapi.com` are all read-only `Describe*` actions — no write/mutation action is ever called, consistent with PROJECT.md's read-only constraint. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Cross-tenant data leakage via a client-supplied scoping parameter | Elevation of Privilege / Information Disclosure | `ZoneIds` is set exclusively from the KV-resolved value keyed by the *verified* `tenant_id`; any client-supplied query param/header is read by nothing in the data-route code path (Anti-Patterns, Pattern 3) — this is this phase's single most important control, matching PROJECT.md's stated top risk. |
| Credential leakage via API error response passthrough | Information Disclosure | `Response.Error` is never forwarded to the client; only the generic `{ available: false }` shape is ever returned on any failure branch (Pattern 3, Pitfall 5). |
| Signature replay / stale timestamp reuse | Tampering | Every signed request computes a fresh `Date.now()`-based timestamp; Tencent's own 5-minute clock-skew signature-expiry window bounds the replay blast radius even if a signed request were somehow intercepted. |
| KV record tampering (a malformed or attacker-influenced KV value) | Tampering | KV writes are entirely out of this phase's scope (D-03) — no Edge Function in this phase ever writes to the `tenant:*` KV keyspace, only reads; write access is an onboarding-tooling concern for a future phase. |

## Sources

### Primary (HIGH confidence)
- `intl.cloud.tencent.com/zh/document/product/583/31703` — TC3-HMAC-SHA256 Signature v3 algorithm, fetched in full this session, canonical-request/string-to-sign/HMAC-chain/Authorization-header steps quoted verbatim, with a worked Node.js example
- `intl.cloud.tencent.com/document/api/1145/49235` — `DescribeTimingL7AnalysisData` full request/response contract, fetched and quoted verbatim
- `intl.cloud.tencent.com/zh/document/product/1145/50524` / `www.tencentcloud.com/document/product/1145/50524` — `DescribeDDoSAttackData` full request/response contract, fetched and quoted verbatim
- `intl.cloud.tencent.com/document/product/1145/59980` — Cloud API change notification confirming `ZoneIds`/`ZoneId` became mandatory (May 30, 2024)
- `.planning/phases/01-edgeone-deployment-foundation/01-RESEARCH.md`, `.planning/phases/02-sso-authentication-tenant-mapping/02-RESEARCH.md` — this project's own prior research (Web Crypto availability, KV binding pattern, `verifySession()` contract)

### Secondary (MEDIUM confidence)
- WebSearch results confirming `DescribeTimingL7AnalysisData` supersedes the deprecated `DescribeOverviewL7Data`/legacy cache-analysis timing APIs
- `intl.cloud.tencent.com/document/product/1145/50516` — `DescribeOverviewL7Data`'s own deprecation notice pointing to `DescribeTimingL7AnalysisData`

### Tertiary (LOW confidence)
- General knowledge of `tencentcloud-sdk-nodejs`'s dependency on Node's `crypto`/`http` modules (not independently re-verified this session against the SDK's own source for edge-runtime compatibility claims — treated as "no evidence of edge compatibility found," not "confirmed incompatible")

## Metadata

**Confidence breakdown:**
- API contracts (`DescribeTimingL7AnalysisData`, `DescribeDDoSAttackData`) and TC3 signature algorithm: HIGH — sourced directly from official Tencent Cloud documentation with verbatim quotes and worked examples
- Edge-runtime applicability of `crypto.subtle` HMAC signing specifically (vs. the already-confirmed `digest`): MEDIUM — extrapolated from the same Web Crypto API surface already confirmed for SHA-256 hashing in Phase 1's research, not independently re-verified against EdgeOne's docs this session
- "Security Events" scope interpretation (DDoS vs. broader WAF/bot events): MEDIUM — a defensible, well-documented choice, but a genuine scope-interpretation judgment call (Assumption A3), not a purely technical finding

**Research date:** 2026-08-12
**Valid until:** ~30 days (2026-09-11) for the EdgeOne/`teo`-specific platform claims (actively evolving platform, same caveat as Phase 1/2's research); the TC3-HMAC-SHA256 signature algorithm itself is a stable, long-standing Tencent Cloud platform standard and not expected to change.
