# Phase 4: Prompt-Driven Dashboard Generation & Save - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 8 (5 new backend files, 1 new/discretionary shared lib, 2 modified frontend files)
**Analogs found:** 7 / 8 (1 partial — `metric-lookup.js` has no close structural analog, uses RESEARCH.md's own code example instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `edge-functions/api/generate.js` | route (controller) | request-response + transform (prompt→validated JSON→multi-fetch) | `edge-functions/api/data/cdn-traffic.js` (session-gate→lookup→sign→fetch chain) + `edge-functions/api/auth/callback.js` (external-provider call + strict claim/JSON handling) | role-match (composite of two analogs) |
| `edge-functions/api/dashboard.js` (POST — save) | route (controller) | CRUD (create) | `edge-functions/api/data/cdn-traffic.js` (session-gate pattern) + `edge-functions/api/kv-check.js` (KV write mechanics) | role-match |
| `edge-functions/api/dashboard/[id].js` (GET — retrieve) | route (controller), dynamic | CRUD (read) | `edge-functions/api/data/cdn-traffic.js` (session-gate + generic-failure pattern) + `edge-functions/api/kv-check.js` (KV read mechanics) | role-match (no prior dynamic `[id].js` route exists in this codebase — routing syntax itself has no analog, only the session/KV mechanics do) |
| `edge-functions/lib/generation-schema.js` | utility (validation/config) | transform (enum validation) | `edge-functions/lib/tenant-mapping.js` (fail-closed validation style: return `null`/reject rather than throw) | role-match |
| `edge-functions/lib/metric-lookup.js` | config (constant lookup table) | transform (enum → real API constant) | `edge-functions/lib/teo-signer.js`'s inline constant usage (`action`, `version` passed as literals) — no dedicated lookup-table file exists yet in this codebase | partial / no strong analog — see "No Analog Found" |
| `edge-functions/lib/polyfills.js` (discretionary, recommended by RESEARCH.md Pitfall 1) | utility | side-effect (module-load-time patch) | `edge-functions/lib/oidc-config.js` lines 17-31 (the exact polyfill snippet to extract/copy) | exact (source of the excerpt to copy, not a structural analog of a different file) |
| `index.html` (extended: prompt panel, widget-stack, save-bar, error-banner) | template/markup | UI render | existing `.card-grid`/`.source-card`/`.result-panel` blocks in the same file (lines 176-236) | exact (same file, additive) |
| `app.js` (extended: generate/save/retrieve calls, Chart.js render helpers, draft state) | client controller (event-driven + request-response) | event-driven (click handlers) + request-response (fetch) | existing `cdnTrafficCard` click handler + `/api/status` fetch block in the same file (lines 1-81) | exact (same file, additive) |

## Pattern Assignments

### `edge-functions/api/generate.js` (route, request-response/transform)

**Primary analog:** `edge-functions/api/data/cdn-traffic.js` (session-gate→KV-lookup→sign→fetch→generic-response chain)
**Secondary analog:** `edge-functions/api/auth/callback.js` (external HTTP call + strict-parse-or-reject discipline)

**Imports pattern** (`cdn-traffic.js` lines 26-28):
```javascript
import { verifySession } from '../../lib/session.js';
import { getTenantAccount } from '../../lib/tenant-mapping.js';
import { signTeoRequest } from '../../lib/teo-signer.js';
```
`generate.js` extends this with:
```javascript
import { verifySession } from '../lib/session.js';
import { getTenantAccount } from '../lib/tenant-mapping.js';
import { signTeoRequest } from '../lib/teo-signer.js';
import { COMPONENT_TYPES, validateWidget } from '../lib/generation-schema.js';
import { ACTION_BY_SOURCE } from '../lib/metric-lookup.js';
// Defensive polyfill re-declaration (Pitfall 1) — copy oidc-config.js lines 25-31 here,
// or import from a shared lib/polyfills.js if extracted.
```

**Session-first guard pattern** (`cdn-traffic.js` lines 36-48, MUST be copied verbatim as the first branch):
```javascript
export async function onRequestGet({ request, env }) {
  const cookies = new Cookies(request.headers.get('Cookie'));
  const sessionCookie = cookies.get('session');
  const payload = sessionCookie ? await verifySession(sessionCookie.value, env) : null;

  // 401 before touching KV or making any outbound call — D-02's "tenant
  // identity derives exclusively from the verified session" invariant.
  if (!payload) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
```
For `generate.js`: use `onRequestPost` (body carries `{ dataSource, prompt, previousSpec? }` per D-07), same guard, same 401 shape, same "verifySession is the very first branch" rule.

**External-call + strict-parse-or-reject pattern** (`auth/callback.js` lines 44-55, 61-74 — the "never coerce, only accept-or-reject" discipline to copy for LLM JSON parsing):
```javascript
let tokens;
try {
  tokens = await client.authorizationCodeGrant(config, new URL(request.url), { ... });
} catch {
  // Invalid/expired code, state mismatch, nonce mismatch, or any other
  // exchange failure — RFC 9700 SS4.7.1.
  return redirectToAccessDenied();
}
// ...
if (typeof tenantId !== 'string' || tenantId.length === 0) {
  console.log('...diagnostic, server-side only...');
  return redirectToAccessDenied();
}
```
Map this shape onto `generate.js`: `fetch()` the AI Gateway in a try/catch → `JSON.parse` the model's `content` in a try/catch → if either throws, retry once with a correction prompt → if still invalid, fall through to the D-08 generic failure response (never echo the raw model text, matching `callback.js`'s never-echo-claims-detail discipline).

**Per-widget real-data fetch loop** (extends `cdn-traffic.js` lines 50-87 — same trust chain, called once per validated widget instead of once per request):
```javascript
const { url, headers, body } = await signTeoRequest({
  secretId: account.secretId,
  secretKey: account.secretKey,
  action: ACTION_BY_SOURCE[dataSource].action,      // from metric-lookup.js, never LLM string
  version: ACTION_BY_SOURCE[dataSource].version,
  payload: {
    StartTime: startTime.toISOString(),
    EndTime: endTime.toISOString(),
    MetricNames: [widget.metric],                    // validated enum value, IS the real teo value
    Interval: widget.interval,
    ZoneIds: [account.zoneId],
  },
  domain: env.TEO_API_DOMAIN,
});
try {
  const res = await fetch(url, { method: 'POST', headers, body });
  teoResponse = await res.json();
} catch {
  // Pitfall 6: per-widget failure, NOT per-request — omit this widget, keep siblings
  continue;
}
if (teoResponse.Response?.Error) continue; // never forward Response.Error (Pitfall 5, carried from Phase 3)
```

**Error handling pattern** — generic no-leak response (`cdn-traffic.js` lines 30-34, the `noDataAvailable()` helper — same shape family, new failure vocabulary per D-08):
```javascript
function noDataAvailable() {
  return new Response(JSON.stringify({ available: false }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```
`generate.js` equivalent: a `generationFailed()` helper returning `{ error: 'generation_failed' }` (D-08's exact copy contract is in `04-UI-SPEC.md`'s Copywriting Contract table — server returns the error code, client maps it to the fixed string).

---

### `edge-functions/api/dashboard.js` (POST — save) (route, CRUD-create)

**Primary analog:** `edge-functions/api/data/cdn-traffic.js` (session-gate shape)
**Secondary analog:** `edge-functions/api/kv-check.js` (KV write mechanics + guard)

**KV binding guard** (`kv-check.js` lines 13-19, `tenant-mapping.js` line 22 — both fail-closed, this exact guard must appear before any `my_kv` call):
```javascript
if (typeof my_kv === 'undefined') {
  return new Response(JSON.stringify({ error: 'save_failed' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**KV write pattern** (`kv-check.js` lines 21-27 — adapt key/value shape per D-05):
```javascript
export async function onRequest({ request }) {
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const value = body && body.value !== undefined ? String(body.value) : String(Date.now());
    await my_kv.put('phase1_check', value);
    return new Response(JSON.stringify({ wrote: true, value }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
```
`dashboard.js` equivalent (per D-05/RESEARCH.md Pattern 2 — key is tenant-scoped, never client-supplied):
```javascript
const dashboardId = crypto.randomUUID(); // confirmed available on this runtime
const record = JSON.stringify({ spec, data, prompt, createdAt: Date.now() });
try {
  await my_kv.put(`dashboard:${payload.tenant_id}:${dashboardId}`, record);
} catch {
  return new Response(JSON.stringify({ error: 'save_failed' }), { headers: { 'Content-Type': 'application/json' } });
}
return new Response(JSON.stringify({ dashboardId }), { headers: { 'Content-Type': 'application/json' } });
```

**Auth/session pattern:** identical to `generate.js` above — copy `cdn-traffic.js` lines 36-48 verbatim (session-first, 401 before any KV call).

---

### `edge-functions/api/dashboard/[id].js` (GET — retrieve) (route, dynamic, CRUD-read)

**Primary analog:** `edge-functions/api/data/cdn-traffic.js` (session-gate + generic no-leak failure)
**Secondary analog:** `edge-functions/api/kv-check.js` (KV read mechanics)

**Dynamic route handler signature** — no in-repo analog for `[id].js` bracket syntax; use RESEARCH.md's cited official example verbatim as the routing contract (not a codebase file, but the authoritative source for this file's signature):
```javascript
// Source: pages.edgeone.ai/document/edge-functions (CITED in 04-RESEARCH.md)
export function onRequestGet(context) {
  return new Response(`User id is ${context.params.id}`);
}
```

**KV read pattern** (`kv-check.js` lines 29-33 — same `my_kv.get()` mechanics):
```javascript
const value = await my_kv.get('phase1_check');
return new Response(JSON.stringify({ value }), {
  headers: { 'Content-Type': 'application/json' },
});
```

**Tenant-scoped key reconstruction** (D-06's core guarantee — combine the pattern above with `cdn-traffic.js`'s "only source of scoping is the verified session" comment at lines 50-51):
```javascript
// tenant_id from the VERIFIED SESSION, id from the URL — never the reverse.
const raw = await my_kv.get(`dashboard:${payload.tenant_id}:${params.id}`);
if (!raw) return new Response(JSON.stringify({ error: 'not_found' }), { headers: { 'Content-Type': 'application/json' } });
```

**Session guard:** identical `cdn-traffic.js` lines 36-48 pattern, adapted for `onRequestGet({ request, env, params })` (note the extra `params` destructure required for dynamic routes, absent from all Phase 1-3 static routes).

---

### `edge-functions/lib/generation-schema.js` (utility, transform/validation)

**Analog:** `edge-functions/lib/tenant-mapping.js` (fail-closed validation discipline — return `null`/reject on any malformed input, never throw to caller)

**Fail-closed validation pattern** (`tenant-mapping.js` lines 21-34 — the exact discipline to replicate: validate every field, `return null`/reject rather than partial-trust or throw):
```javascript
export async function getTenantAccount(tenantId) {
  if (typeof my_kv === 'undefined') return null; // fail closed, not open
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
`generation-schema.js`'s `validateWidget()` follows the identical shape — check every field against a closed enum, `return null` for any single failure, never throw, never coerce/"best guess" (D-03 step 3). This is a pure function (no KV/async), so it's simpler than the analog but shares the exact rejection philosophy.

---

### `edge-functions/lib/metric-lookup.js` (config, no strong analog)

No file in this codebase is a dedicated "validated-enum → real-API-constant lookup table." The closest existing precedent is `teo-signer.js`'s and `cdn-traffic.js`'s inline literal usage of `action: 'DescribeTimingL7AnalysisData'` / `version: '2022-01-06'` (see `cdn-traffic.js` lines 63-64) — this phase's novelty is *extracting* those two literals into a per-`dataSource`-keyed table instead of hardcoding them once. Use RESEARCH.md's own worked example as the primary source instead of an in-repo analog:
```javascript
// edge-functions/lib/metric-lookup.js — RESEARCH.md Pattern 1
export const ACTION_BY_SOURCE = {
  'cdn-traffic': { action: 'DescribeTimingL7AnalysisData', version: '2022-01-06' },
  'security-events': { action: 'DescribeDDoSAttackData', version: '2022-09-01' },
}; // versions CITED 03-RESEARCH.md Pitfall 1 — do not share one constant across both
```

---

### `edge-functions/lib/polyfills.js` (discretionary extraction, utility)

**Source to copy from:** `edge-functions/lib/oidc-config.js` lines 17-31 (exact guarded snippet):
```javascript
// EdgeOne's Edge Function runtime does not implement the standard
// `AbortSignal.timeout(ms)` static method (confirmed via local
// `edgeone makers dev` — TypeError: AbortSignal.timeout is not a function).
// Guarded so it's a no-op on runtimes that already provide it natively.
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = function timeout(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return controller.signal;
  };
}
```
**Critical scoping note (RESEARCH.md Pitfall 1):** this is a module-load-time side effect, NOT globally auto-applied. `generate.js` does not import `oidc-config.js` and will NOT inherit this patch on a cold instance. Either paste this exact block directly into `generate.js`, or extract it into a new shared `edge-functions/lib/polyfills.js` imported by both `oidc-config.js` and `generate.js`. Do not assume import-order side effects across unrelated modules.

---

### `index.html` (extended — prompt panel, widget-stack, save-bar, error-banner)

**Analog:** same file, existing `.card-grid`/`.source-card`/`.result-panel` blocks (lines 176-236) plus the `:root` token block (lines 8-20)

**Token reuse pattern** (lines 8-20 — reuse verbatim, do not introduce new color tokens per `04-UI-SPEC.md`):
```css
:root {
  --color-primary: #0052d9;
  --color-primary-hover: #003eb3;
  --color-bg: #f5f6fa;
  --color-card: #ffffff;
  --color-border: #e4e7ed;
  --color-text: #111827;
  --color-text-muted: #6b7280;
  --color-text-subtle: #9ca3af;
  --shadow-card: 0 1px 3px rgba(16, 24, 40, 0.06), 0 8px 24px rgba(16, 24, 40, 0.06);
  --radius-lg: 16px;
  --radius-md: 10px;
}
```

**Card/panel structural pattern to copy for `.widget-card`/`.prompt-panel`** (lines 182-224 — `.source-card` and `.result-panel`):
```css
.source-card {
  text-align: left;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 20px;
  cursor: pointer;
  font-family: inherit;
  transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.source-card-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.result-panel {
  margin-top: 24px;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 16px;
  font-size: 13px;
  color: var(--color-text-muted);
  display: none;
}
.result-panel.is-visible { display: block; }
```
`04-UI-SPEC.md`'s Component & Layout Notes table explicitly directs reusing `.source-card-title`'s exact 15px/600 for `.widget-card-title`, and `.result-panel`'s card-surface treatment for `.prompt-panel`. Follow those mappings exactly rather than inventing new sizes.

**Markup structural pattern** (lines 257-269 — the existing `data-source-section` conditionally-shown block is the template for the new prompt/widget section, placed as a sibling inside `<main class="dashboard-main">`):
```html
<div id="data-source-section" style="display: none">
  <h2>Select a data source</h2>
  <p class="section-subtitle">Choose the data you'd like to build a dashboard from.</p>
  <div class="card-grid">...</div>
  <div id="data-source-result" class="result-panel"></div>
</div>
```

---

### `app.js` (extended — generate/save/retrieve calls, Chart.js render helpers, draft state)

**Analog:** same file, existing `/api/status` fetch block (lines 1-49) and `cdnTrafficCard` click handler (lines 58-81)

**Fetch + generic-failure client pattern** (lines 65-80 — the exact shape to replicate for `/api/generate`, `/api/dashboard`, `/api/dashboard/:id`):
```javascript
fetch('/api/data/cdn-traffic')
  .then((r) => r.json())
  .then((data) => {
    if (data.available) {
      resultEl.textContent = '';
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(data.data, null, 2);
      resultEl.appendChild(pre);
    } else {
      resultEl.textContent = 'No data available';
    }
  })
  .catch(() => {
    resultEl.textContent = 'No data available';
  });
```
Note the client **never inspects why `available` is false** — same discipline applies to Phase 4's `error: 'generation_failed'`/`'save_failed'`/`'not_found'` codes: map each generic code straight to its fixed D-08/UI-SPEC copy string, never branch UI logic on upstream cause.

**No-`innerHTML` DOM-write discipline** (lines 21-38 — every existing DOM write in this file uses `textContent`/`createElement`, never `innerHTML`; RESEARCH.md's Anti-Patterns section explicitly calls this out as the required pattern for rendering the LLM's `title` field):
```javascript
tenantBadgeValue.textContent = data.tenantId;
tenantBadgeValue.title = data.tenantId;
// ...
const status = document.createElement('div');
status.className = 'login-status';
status.textContent = statusLine;
el.appendChild(status);
```

**Session-gated conditional-render pattern** (lines 45-48 — the template for gating the new prompt panel behind both `authenticated` AND a selected data source, per D-UI/D-07):
```javascript
const dataSourceSection = document.getElementById('data-source-section');
if (dataSourceSection) {
  dataSourceSection.style.display = data.authenticated ? '' : 'none';
}
```

**Client-side draft-state object** — no in-repo analog (this codebase has no prior multi-step client state object); use RESEARCH.md Pattern 3 verbatim as the source:
```javascript
let draft = { dataSource: null, prompt: '', spec: null, data: null };

async function generate(promptText, isRePrompt) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataSource: draft.dataSource,
      prompt: promptText,
      previousSpec: isRePrompt ? draft.spec : undefined,
    }),
  });
  const result = await res.json();
  if (result.widgets) {
    draft.prompt = promptText;
    draft.spec = result.widgets;
    renderWidgets(result.widgets);
  } else {
    renderError("Couldn't generate a dashboard from that prompt — try rephrasing.");
  }
}
```

## Shared Patterns

### Session-first guard (verifySession as the mandatory first branch)
**Source:** `edge-functions/api/data/cdn-traffic.js` lines 36-48; also `edge-functions/api/status.js` lines 23-30
**Apply to:** `generate.js`, `dashboard.js` (POST), `dashboard/[id].js` (GET) — every new backend route this phase adds
```javascript
const cookies = new Cookies(request.headers.get('Cookie'));
const sessionCookie = cookies.get('session');
const payload = sessionCookie ? await verifySession(sessionCookie.value, env) : null;
if (!payload) {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
```
Must be the literal first branch — before any KV read, any LLM call, any `teo` call.

### KV binding guard (bare global, fail-closed)
**Source:** `edge-functions/lib/tenant-mapping.js` line 22; `edge-functions/api/kv-check.js` lines 13-19
**Apply to:** `dashboard.js` (save), `dashboard/[id].js` (retrieve)
```javascript
if (typeof my_kv === 'undefined') return null; // or the route's generic-failure Response, fail closed not open
```
`my_kv` is a bare global, never `context.env.my_kv` — this convention is load-bearing and has bitten this project before (03-RESEARCH.md Pitfall 3).

### No-leak generic error/response shape
**Source:** `edge-functions/api/data/cdn-traffic.js` lines 30-34 (`noDataAvailable()`), `edge-functions/api/auth/callback.js` lines 21-26 (`redirectToAccessDenied()`)
**Apply to:** every failure branch in `generate.js`, `dashboard.js`, `dashboard/[id].js`
```javascript
function noDataAvailable() {
  return new Response(JSON.stringify({ available: false }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```
Never forward `Response.Error`, raw LLM error bodies, stack traces, or API keys — same discipline, new failure vocabulary (`generation_failed`, `save_failed`, `not_found` per D-08).

### AbortSignal.timeout polyfill (module-scoped, not global-auto)
**Source:** `edge-functions/lib/oidc-config.js` lines 17-31
**Apply to:** `generate.js` (its `fetch()` call to the AI Gateway is the first outbound `fetch()`-with-timeout call outside `oidc-config.js`'s own import graph)
```javascript
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = function timeout(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return controller.signal;
  };
}
```
Re-declare directly in `generate.js` or extract to a shared `lib/polyfills.js` — do not assume it's already active from an unrelated module import.

### Client-side no-`innerHTML` DOM-write discipline
**Source:** `app.js` lines 18-19, 21-38, 69-72 (every existing DOM write in this file)
**Apply to:** all new widget-rendering code in `app.js`, especially the LLM-supplied `title` field
```javascript
el.textContent = someValue;      // not el.innerHTML = someValue
const node = document.createElement('div');
node.textContent = someValue;
parent.appendChild(node);
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `edge-functions/lib/metric-lookup.js` | config | transform (static lookup table) | No existing file in this codebase is a dedicated enum→constant lookup table; closest precedent is inline literals in `cdn-traffic.js`/`teo-signer.js`. Planner should use RESEARCH.md Pattern 1's worked example (`ACTION_BY_SOURCE`) directly rather than adapting an in-repo file. |
| `edge-functions/api/dashboard/[id].js` (routing syntax specifically, not its session/KV logic) | route (dynamic) | — | No prior EdgeOne bracket-dynamic-route file exists in Phases 1-3 (all prior routes are static filenames). The session/KV logic has a strong analog (`cdn-traffic.js`/`kv-check.js`), but the `[id].js` file-based routing convention itself and the resulting `context.params.id` read must be taken from RESEARCH.md's cited official EdgeOne doc example, not an in-repo file. |
| Client-side multi-step draft-state object (`app.js` `draft` variable) | store (client-side) | event-driven/transform | No prior client-side file in this codebase manages multi-step conversational/draft state (Phases 1-3's `app.js` is stateless between requests, always re-fetching `/api/status`). Use RESEARCH.md Pattern 3 verbatim. |

## Metadata

**Analog search scope:** `edge-functions/` (all `api/` and `lib/` files), `index.html`, `app.js` — entire backend + frontend codebase (8 files total, project has no `src/`, `controllers/`, `services/` directory structure; it is a flat Edge-Functions-plus-static-site layout)
**Files scanned:** 12 (7 existing edge-functions files, `index.html`, `app.js`, plus `04-CONTEXT.md`, `04-RESEARCH.md`, `04-UI-SPEC.md` for cross-reference)
**Pattern extraction date:** 2026-08-12
