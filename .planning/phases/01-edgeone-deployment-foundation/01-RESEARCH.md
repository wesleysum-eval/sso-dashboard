# Phase 1: EdgeOne Deployment Foundation - Research

**Researched:** 2026-08-11
**Domain:** Tencent EdgeOne Makers (formerly EdgeOne Pages) — static hosting, Edge Functions, KV storage, secrets/env config, deployment tooling
**Confidence:** HIGH (platform mechanics, CLI, APIs — verified against official docs) / MEDIUM (exact console screenshots, some legacy naming variance)

## Summary

EdgeOne Makers (the rebranded name for EdgeOne Pages as of 2026-06-12) is Tencent's edge-native full-stack hosting platform. For Phase 1's narrow goal — a minimal live skeleton proving static hosting, one callable function, secret config, and KV read/write — the platform gives you everything needed out of the box, no third-party packages required for the runtime code itself. The only external dependency is the `edgeone` CLI (npm package `edgeone`), which is the official, actively-maintained tool for scaffolding, local dev, and deployment.

The critical architectural decision for this phase is **Edge Functions vs Cloud Functions**. They are two distinct runtimes with non-overlapping capabilities that are easy to confuse (both are called "Makers Functions" in marketing copy): Edge Functions run in a V8-isolate Serverless environment at edge nodes and are the **only** runtime with access to KV storage; Cloud Functions run in a full Node.js/Python/Go environment in a cloud region and support things Edge Functions don't (e.g. unbuffered SSE streaming, most npm packages with native bindings). Since Phase 1's success criteria explicitly require KV read/write from a Function, **the KV-touching function must be an Edge Function**, placed in `edge-functions/`, not `cloud-functions/`. Secrets/env config is readable from either runtime via `context.env.KEY` (Edge) or `process.env`-style access via the same `env` field on `context` (Cloud) — but the KV binding itself is a **global variable** (the console-configured "variable name"), not `context.env.KV_NAME` — a common point of confusion carried over from Cloudflare Workers experience.

Deployment has three independent paths: **(1) Git-based** (push to GitHub/GitLab, auto-builds on the platform), **(2) CLI-based** (`edgeone makers deploy`, builds/uploads directly from local machine, no git required), and **(3) Direct Upload via console** (drag a pre-built folder/zip, no build step runs server-side). Since this repo currently has **no git remote configured** (verified: `git remote -v` returns empty), and the CLI is already installed and authenticated-capable locally, **CLI-based deploy (`edgeone makers deploy`) is the fastest path to a live public URL for Phase 1** — it requires no GitHub setup and handles build + deploy in one command. Git-based deploy remains a good option later but adds a setup step (create remote, push, link Makers project to it) that isn't required to satisfy Phase 1's success criteria.

**Primary recommendation:** Scaffold a minimal static site (`index.html` + a small JS file) at the project root, with a `edge-functions/api/` directory containing one Edge Function that (a) reads a config value via `context.env`, (b) writes and reads back a value via the KV global binding, and (c) returns JSON. Deploy via `edgeone makers deploy` (direct/local deploy path) to get a live public `*.edgeone.app`-style URL, after first running `edgeone makers link` to bind KV and pull console-configured env vars locally for parity.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-01 | App is deployed and live on EdgeOne Pages (frontend) + EdgeOne Functions (backend/API glue), with persistent storage and secrets/config working end-to-end in the deployed environment (not just local dev) | Standard Stack, Architecture Patterns, Code Examples, and Common Pitfalls sections below cover: static hosting conventions, Edge Function routing/handler signature, KV binding + API, and env var configuration — all verified against official EdgeOne Makers docs as of 2026-08-11. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Static site hosting (HTML/JS/CSS) | CDN / Static | — | Files served directly from EdgeOne's global edge network; no server-side rendering needed for a skeleton page `[VERIFIED: pages.edgeone.ai/document/building-output-configuration]` (Output Location table: static resource → `assets/`) |
| Callable API/Function endpoint | API / Backend (edge-deployed) | CDN / Static (routing layer) | Edge Functions execute business logic but run *on* CDN edge nodes rather than a traditional backend region — routing is filesystem-based from `/edge-functions` `[VERIFIED: pages.edgeone.ai/document/edge-functions]` |
| Secrets / env config | API / Backend | — | Read via `context.env.KEY` inside a Function handler; configured per-environment (Production/Preview) in console or `edgeone makers env set` `[VERIFIED: pages.edgeone.ai/document/build-guide]`, `[VERIFIED: pages.edgeone.ai/document/edgeone-cli]` |
| KV persistent storage | Database / Storage | API / Backend (Edge Functions only) | KV is a managed, eventually-consistent central+edge-cached store; **only accessible from Edge Functions**, not Cloud Functions `[VERIFIED: pages.edgeone.ai/document/kv-storage]` — "Currently, it is only supported for use within Edge Functions." |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `edgeone` (CLI) | 1.6.23 (latest; 1.6.8 currently installed locally) | Scaffold, local dev (`makers dev`), env management, and deploy (`makers deploy`) | It is the platform's own official tool — there is no alternative CLI. `[VERIFIED: pages.edgeone.ai/document/edgeone-cli]`, version confirmed via `npm view edgeone version` → `1.6.23`, published `2026-08-11`. |

No frontend framework or backend runtime library is required for Phase 1 — the success criteria only need plain static files + one Edge Function using Web-standard APIs (`Request`/`Response`/`fetch`) that are injected globally by the runtime. Introducing a framework (React/Vite/Next.js) is optional polish for later phases, not a Phase 1 requirement.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none required | — | — | A minimal skeleton needs zero npm runtime dependencies. If Phase 2+ needs a frontend framework (per ROADMAP's later phases), reconsider then — don't add one now just to "look complete." |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Edge Functions for the KV-touching endpoint | Cloud Functions | Cloud Functions **cannot** access KV at all (`[VERIFIED: pages.edgeone.ai/document/kv-storage]`) — not a viable alternative for the storage success criterion, only relevant later if streaming/heavy npm deps are needed. |
| CLI-based deploy | Git-based deploy (GitHub/GitLab auto-build) | Git deploy gives auto-deploy-on-push and a Preview/Production environment split for free, but requires creating and pushing to a remote first (this repo currently has none) — extra setup not needed to satisfy Phase 1. |
| CLI-based deploy | Direct Upload via console (drag-and-drop) | Direct Upload skips the build step entirely (you must upload pre-built artifacts) and needs manual re-upload for every change — worse iteration loop than `edgeone makers deploy`, which builds automatically. |

**Installation:**
```bash
npm install -g edgeone
edgeone -v      # confirm install
edgeone login   # opens browser; choose "Global (International)"
```

**Version verification:** Confirmed via `npm view edgeone version` → `1.6.23` (latest), package created 2024-12-11, most recent publish 2026-08-11 (203 total published versions — actively maintained). Locally installed version is `1.6.8` (CLI itself reports "update available 1.6.23" — recommend upgrading before use: `npm install -g edgeone@latest`).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `edgeone` | npm | ~2 years (created 2024-12-11) | ~10,460/week | none listed in npm metadata (`repository.url` empty) | SUS (automated gate: "too-new", "no-repository") | **Kept, flagged.** See note below. |

**Note on the SUS verdict:** The automated legitimacy gate flags `edgeone` because npm's `repository` field is empty and its "publishedAt" signal (most recent version timestamp) looks recent — but this is an artifact of the package being actively released (203 versions since Dec 2024, latest push today), not evidence of a slopsquat. The package is the **only** distribution channel for the EdgeOne CLI per official documentation (`npm install -g edgeone`, cited at `pages.edgeone.ai/document/edgeone-cli`), and it is **already installed and functional** in this environment (`edgeone --version` → `1.6.8`, matches the documented install path). Per protocol this is tagged `[ASSUMED]` at the package-identity level despite registry existence, and the planner **must** add a `checkpoint:human-verify` task before any (re-)install step, even though the tool is already present locally — to guard against a future `npm install -g edgeone@latest` silently resolving to a different/compromised package if the registry were ever compromised.

**Packages removed due to `[SLOP]` verdict:** none
**Packages flagged as suspicious `[SUS]`:** `edgeone` (see note above — checkpoint required before any CLI install/upgrade step)

## Architecture Patterns

### System Architecture Diagram

```
Browser (client)
   │
   │  GET /              GET /index.html, app.js, styles.css
   ▼
┌─────────────────────────────────────────────┐
│  EdgeOne CDN / Static tier (assets/)         │
│  - serves static files from global edge      │
│  - routes non-static paths onward if no      │
│    matching static resource exists           │
└───────────────┬───────────────────────────────┘
                │  GET /api/hello  (no static file matches)
                ▼
┌─────────────────────────────────────────────┐
│  Edge Functions runtime (edge-functions/)    │
│  - file-based routing: edge-functions/api/   │
│    hello.js → /api/hello                     │
│  - onRequest(context) handler                │
│  - context.env.MY_SECRET  (env/secrets)      │
│  - my_kv.get()/put()      (KV global binding)│
└───────────────┬───────────────────────────────┘
                │  await my_kv.put(key, value)
                ▼
┌─────────────────────────────────────────────┐
│  KV Storage (namespace, bound to project)    │
│  - centralized store + edge cache            │
│  - eventual consistency (≤60s cross-node)    │
└─────────────────────────────────────────────┘
                │
                ▼
        Response (JSON) ──────────────► back to Browser
```

A request first tries to match a static file; if none matches, it's routed to the Edge Functions layer based on the `/edge-functions` directory structure; the function handler can read secrets from `context.env` and read/write KV via a globally-bound variable, then returns a `Response`. `[VERIFIED: pages.edgeone.ai/document/edge-functions]` (Routing + Function Handlers + EventContext sections), `[VERIFIED: pages.edgeone.ai/document/kv-storage]` (API section)

### Recommended Project Structure

```
enterprise-sso-dashboard/
├── index.html              # static entry point (served from project root / assets/)
├── app.js                  # minimal client JS (optional for Phase 1 skeleton)
├── edgeone.json             # optional: only needed for redirects/rewrites/headers/schedules
├── package.json             # only if you add npm deps to a Cloud Function; not required for Edge-only skeleton
└── edge-functions/
    └── api/
        ├── hello.js         # GET /api/hello — proves "Function callable from live site"
        ├── config-check.js  # GET /api/config-check — reads context.env, proves secrets work
        └── kv-check.js      # GET/POST /api/kv-check — proves KV write-then-read
```

Static resources build to `assets/`, Edge Functions build to `edge-functions/` at the *output* level — but as **source**, you place static files at the project root (or wherever `outputDirectory` in `edgeone.json`/console settings points) and Function source files under `edge-functions/`. `[VERIFIED: pages.edgeone.ai/document/building-output-configuration]` (Output Location table)

### Pattern 1: Minimal Edge Function Handler
**What:** A file under `edge-functions/` exporting `onRequest` (or method-specific `onRequestGet`/`onRequestPost`, etc.), receiving a single `context` argument, returning a `Response`.
**When to use:** Any Phase 1 API endpoint — this is the only handler shape Edge Functions support.
**Example:**
```javascript
// Source: pages.edgeone.ai/document/edge-functions (Quick Start + Function Handlers sections)
// ./edge-functions/api/hello.js
export default function onRequest(context) {
  return new Response('Hello from Edge Functions!');
}
```

### Pattern 2: Reading secrets/env config in a Function
**What:** `context.env.SOME_KEY` — populated from console-configured (or CLI-set) environment variables, scoped per deployment environment (Production/Preview).
**When to use:** Any placeholder credential (e.g. OIDC client ID for a future phase) that must not be hardcoded.
**Example:**
```javascript
// Source: pages.edgeone.ai/document/edge-functions (EventContext object description)
export function onRequestGet(context) {
  const { env } = context;
  return new Response(JSON.stringify({ hasConfig: Boolean(env.PLACEHOLDER_OIDC_CLIENT_ID) }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Pattern 3: KV write-then-read proof
**What:** KV binding is a **global variable** named exactly as configured in the console/namespace-binding step (not `context.env.KV_NAME`). Keys must match `^[A-Za-z0-9_]+$` (letters, digits, underscore only — no colons).
**When to use:** Phase 1 success criterion #4 (write in one request, read back in a later request).
**Example:**
```javascript
// Source: pages.edgeone.ai/document/kv-storage (API + Example sections)
// ./edge-functions/api/kv-check.js
// Assumes namespace bound to project with variable name "my_kv" (configured in console)
export async function onRequest({ request }) {
  if (request.method === 'POST') {
    const body = await request.json();
    await my_kv.put('phase1_check', String(body.value ?? Date.now()));
    return new Response(JSON.stringify({ wrote: true }), { headers: { 'Content-Type': 'application/json' } });
  }
  const value = await my_kv.get('phase1_check');
  return new Response(JSON.stringify({ value }), { headers: { 'Content-Type': 'application/json' } });
}
```

### Anti-Patterns to Avoid
- **Using `context.env.KV_NAME` for KV access (Cloudflare Workers habit):** EdgeOne's KV binding is a bare global variable named after the console-configured "variable name" — not nested under `env`. Using the Cloudflare pattern silently resolves to `undefined` and fails without throwing, unless you explicitly check `typeof my_kv !== 'undefined'`. `[CITED: raw.githubusercontent.com/SunIsAlex/deepessay EDGEONE-GUIDE.md]`
- **Putting KV calls in a Cloud Function:** KV is Edge-Functions-only. A Cloud Function referencing the KV global will see `undefined` and — if wrapped in an overly defensive try/catch — will fail *silently* (no thrown error, just a no-op). `[VERIFIED: pages.edgeone.ai/document/kv-storage]`
- **Using `:` (colon) in KV keys:** Only letters, digits, and underscore are legal in keys (≤512 bytes) — a common `namespace:id` convention from other KV systems will fail. `[VERIFIED: pages.edgeone.ai/document/kv-storage]` (PUT parameter description)
- **Confusing "Direct Upload" with CLI/git deploy:** Direct Upload (console drag-and-drop) runs **no build step** server-side — you must upload already-built static output, with `index.html` at the outermost level of the archive/folder (not nested in a `dist/` subfolder), or the homepage 404s. `[VERIFIED: pages.edgeone.ai/document/direct-upload]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key-value persistent storage | A custom file-based or third-party DB-backed store for a simple config/counter use case | EdgeOne KV (`my_kv.put/get/delete/list`) | Built-in, free (1 GB), globally edge-cached, already the platform's own primitive — exactly what Phase 1's success criterion #4 asks for. `[VERIFIED: pages.edgeone.ai/document/kv-storage]` |
| Env/secret injection at request time | A custom `.env` loader shipped in the function bundle | `context.env.KEY`, configured via console Environment Management or `edgeone makers env set` | Platform handles per-environment (Production/Preview) scoping and keeps secrets out of the deployed code bundle. `[VERIFIED: pages.edgeone.ai/document/build-guide]` |
| HTTP routing for API paths | A custom router/dispatcher inside one big function file | File-based routing under `edge-functions/` (including `[id].js` and `[[default]].js` dynamic segments) | Routing is a build-time concern handled by the platform from directory structure — no runtime router needed for simple cases. `[VERIFIED: pages.edgeone.ai/document/edge-functions]` |

**Key insight:** Phase 1 is explicitly about proving *platform primitives* work end-to-end — every one of the four success criteria maps directly onto a built-in EdgeOne Makers feature (static hosting, Edge Functions, env vars, KV). There is no legitimate reason to hand-roll any of this in a phase whose entire purpose is validating the platform's own primitives.

## Common Pitfalls

### Pitfall 1: KV accessed from the wrong Function type
**What goes wrong:** Code that calls the KV global variable inside a Cloud Function (`cloud-functions/` or historically-named `node-functions/`) silently gets `undefined` — no thrown error if wrapped in `typeof x !== 'undefined'` guards, which is a natural defensive pattern.
**Why it happens:** EdgeOne Makers has two separate Function runtimes (Edge vs Cloud) with different capability sets, and both are colloquially called "Functions" in marketing material and templates.
**How to avoid:** Put every KV-touching handler under `edge-functions/`. If a later phase needs SSE/streaming (not needed in Phase 1), that logic must go in `cloud-functions/` instead, and the two concerns must be split into separate endpoints.
**Warning signs:** A feature that depends on a previous KV write "just doesn't work" with zero error output; `console.log(typeof my_kv)` printing `"undefined"` in that function's logs.
`[CITED: raw.githubusercontent.com/SunIsAlex/deepessay EDGEONE-GUIDE.md]`, corroborated by `[VERIFIED: pages.edgeone.ai/document/kv-storage]` ("Currently, it is only supported for use within Edge Functions.")

### Pitfall 2: KV eventual consistency mistaken for a bug
**What goes wrong:** A value written by one request isn't immediately visible when read from a *different* edge node — appears as "sometimes works, sometimes doesn't."
**Why it happens:** KV writes go to the nearest edge node + central store in parallel; the writing node can read its own write immediately, but other edge nodes' caches take up to 60 seconds to refresh.
**How to avoid:** For Phase 1's write-then-read proof, issue both requests close together and don't assume strict global consistency; if the read must be from a different geography/session immediately, note this limitation rather than treating it as a deploy bug. For anything needing true strong consistency later, the docs point to Blob storage instead.
**Warning signs:** Read-after-write works locally/in one test but fails intermittently from a different location or a few seconds later from another node.
`[VERIFIED: pages.edgeone.ai/document/kv-storage]` ("How It Works" table)

### Pitfall 3: No git remote — git-based auto-deploy isn't available yet
**What goes wrong:** Assuming `git push` will trigger a Makers deployment, when no remote/Git integration has been configured for this project.
**Why it happens:** This repo (`enterprise-sso-dashboard`) currently has zero git remotes configured (`git remote -v` returns empty) — Git auto-deploy requires a Makers project explicitly linked to a GitHub/GitLab repo.
**How to avoid:** For Phase 1, use `edgeone makers deploy` (CLI, no git required) or Direct Upload via console. If a later phase wants git-based CI/CD, that requires first creating a remote and linking it in the Makers console/CLI (`edgeone makers link` links to an *existing* Makers project for KV/env access, it does not itself establish git auto-deploy).
**Warning signs:** Pushing commits and waiting for a deployment that never triggers.
`[VERIFIED: bash `git remote -v` executed in project directory, returned empty]`, `[VERIFIED: pages.edgeone.ai/document/build-guide]` (Git Auto-Trigger Deployment requires an associated repository)

### Pitfall 4: Direct Upload does not run a build
**What goes wrong:** Uploading unbuilt source (e.g. a `package.json` + `src/` folder) via console Direct Upload and expecting `npm run build` to execute server-side.
**Why it happens:** Direct Upload is explicitly a "pre-built artifacts only" path — "no build process is executed on the platform side."
**How to avoid:** Either build locally first and upload the output directory contents (with `index.html` at the top level), or use `edgeone makers deploy`/git-based deploy instead, both of which do run a build.
**Warning signs:** 404 on the homepage after a Direct Upload, or the uploaded content is literally your source files instead of built output.
`[VERIFIED: pages.edgeone.ai/document/direct-upload]`

### Pitfall 5: CPU time limit on Edge Functions is very small (200ms)
**What goes wrong:** An Edge Function that does anything CPU-heavy (e.g. synchronous JSON transforms on large payloads, crypto-heavy work) times out or is throttled.
**Why it happens:** Edge Functions get a 200ms CPU time slice per execution (excluding I/O wait) — this is intentionally small since they're meant for lightweight edge logic, not heavy compute.
**How to avoid:** Keep Edge Function logic for Phase 1 trivial (env read, KV read/write, JSON response). Push anything compute-heavy to Cloud Functions in later phases.
**Warning signs:** Intermittent 5xx or truncated responses under any non-trivial workload from an Edge Function.
`[VERIFIED: pages.edgeone.ai/document/edge-functions]` (Use Limits table: "CPU time: 200 ms")

## Code Examples

### Minimal static entry point
```html
<!-- Source: pages.edgeone.ai/document/direct-upload (entry file requirement: index.html at outermost level) -->
<!-- ./index.html -->
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Enterprise SSO Dashboard — Phase 1 Skeleton</title></head>
  <body>
    <h1>Deployment Foundation Live</h1>
    <div id="result">loading...</div>
    <script src="/app.js"></script>
  </body>
</html>
```

### Calling the deployed function from the static page
```javascript
// Source: pages.edgeone.ai/document/edgeone-cli (Local Development section — fetch pattern is identical in production)
// ./app.js
fetch('/api/hello')
  .then((r) => r.text())
  .then((text) => { document.getElementById('result').textContent = text; });
```

### CLI deploy commands (no git required)
```bash
# Source: pages.edgeone.ai/document/edgeone-cli (Quick Start + Local Deployment sections)
npm install -g edgeone
edgeone login                 # choose "Global" for accurate routing/data
edgeone makers init            # generates edge-functions/ scaffold in an existing project
edgeone makers link            # binds project to an existing/new Makers project (needed for KV + env pull)
edgeone makers env set PLACEHOLDER_OIDC_CLIENT_ID demo-value   # set a secret/config value
edgeone makers dev             # local dev server on :8088 (frontend + functions same port)
edgeone makers deploy          # builds + deploys to Production; add -e preview for a preview deploy
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| "EdgeOne Pages" branding, `edgeone pages <command>` CLI namespace | "EdgeOne Makers" branding, `edgeone makers <command>` recommended namespace (new features like `create` only ship here) | 2026-06-12 rebrand | Prefer `edgeone makers ...` in all new scripts/docs; `edgeone pages ...` still works during a transition period but shows a deprecation notice. `[VERIFIED: pages.edgeone.ai/document/edgeone-cli]` |
| Single `functions/` directory (older "Pages Functions" era templates, e.g. some GitHub examples still show `functions/kv-list`, `functions/visit`) | Split into `edge-functions/` (edge runtime, KV) and `cloud-functions/` (Node/Python/Go runtime, no KV) | Documented in current official docs; some community write-ups also mention a `node-functions/` naming variant for Cloud Functions | Verify the actual recognized directory name in the console after first deploy — naming has had documented drift between "Cloud Functions" being called `cloud-functions/` (official docs, Building Output Configuration) vs `node-functions/` (a community post). Use `edge-functions/` for anything touching KV; treat the Cloud Functions directory name as needing a post-deploy console confirmation. `[CITED: raw.githubusercontent.com/SunIsAlex/deepessay EDGEONE-GUIDE.md]` vs `[VERIFIED: pages.edgeone.ai/document/building-output-configuration]` |

**Deprecated/outdated:**
- `edgeone pages <command>` CLI namespace: still functional but will be "gradually phased out after the transition period," per official docs — new scripts should use `edgeone makers <command>`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Cloud Functions source directory is named `cloud-functions/` (per official Building Output Configuration doc) rather than `node-functions/` (per a third-party community guide) | State of the Art, Pitfall 1 | Low — Phase 1 doesn't need a Cloud Function at all (KV requires Edge Functions only), so this only matters if the plan later adds a Cloud Function; verify directory naming against the console after the first deploy before relying on it. |
| A2 | The default auto-assigned public domain for a new Makers project follows an `*.edgeone.app`-style pattern | Summary | Low — exact domain format wasn't confirmed via an authoritative fetch this session (page 404'd); the actual URL will be visible directly in the console/CLI output after first deploy, so this doesn't block execution, just don't hardcode an assumed domain format into any script. |
| A3 | `edgeone makers create [project-name] --template <slug>` templates are the correct way to scaffold if starting from zero (vs. `edgeone makers init` on an existing repo) | Standard Stack / Recommended Project Structure | Low — since this repo already exists with `.planning/` content, `edgeone makers init` (adds Makers config to an existing project) is the more likely correct command per docs, not `create` (which scaffolds a brand-new directory) — planner should default to `init`, not `create`. |

## Open Questions

1. **Exact console steps for KV namespace creation and binding (UI-only, not CLI-scriptable)**
   - What we know: Namespace creation and project-binding happen in the Makers console (Storage → KV), and the account must be "activated" first (`Apply Now` in console). There is no documented CLI command to create a KV namespace or bind it to a project — `edgeone makers link` only pulls existing bindings/env vars into the local dev environment.
   - What's unclear: Whether KV account activation + namespace creation + binding can be scripted/automated at all, or must always be done manually via console click-through the first time.
   - Recommendation: Treat KV namespace creation + binding as a manual, one-time console step in the plan (likely a `checkpoint:human-verify` or explicit manual task), distinct from the code that then reads/writes to it.

2. **Default public domain format for a freshly created Makers project**
   - What we know: Every deployment gets "a new and unique URL" automatically; a temporary 3-hour preview link can also be generated from the project list.
   - What's unclear: The exact domain suffix pattern (some evidence points to `*.edgeone.app`, seen in template preview URLs like `https://functions-kv.edgeone.app`, but this wasn't confirmed for newly created *user* projects specifically, as opposed to official template demos).
   - Recommendation: Don't hardcode a domain pattern in verification scripts — capture the actual URL from `edgeone makers deploy` CLI output or the console after first successful deploy, and use that value directly in Phase 1's success-criteria verification.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Local dev, CLI itself | ✓ | v25.6.1 | — |
| npm | Installing/updating `edgeone` CLI | ✓ | 11.9.0 | — |
| `edgeone` CLI | Scaffolding, local dev, deploy | ✓ (installed, but outdated) | 1.6.8 installed / 1.6.23 latest | Run `npm install -g edgeone@latest` before starting Phase 1 work — no functional fallback needed, upgrade is trivial |
| git | Only needed if choosing git-based deploy later | ✓ | 2.50.1 | Not required for Phase 1 — CLI-based (`edgeone makers deploy`) or Direct Upload work without git |
| git remote (GitHub/GitLab) | Git-based auto-deploy path | ✗ (none configured) | — | Not needed for Phase 1 — use CLI deploy instead; add a remote later only if git-based CI/CD becomes a requirement |
| EdgeOne Makers account + login | All deploy paths | Unknown (not verifiable via CLI probe without interactive login) | — | `edgeone login` must be run interactively once; if the executor lacks interactive browser access, Direct Upload via console or an API Token (`-t/--token` flag) are the non-interactive fallbacks documented for CLI/CI use |

**Missing dependencies with no fallback:**
- None — every required tool is either present or has a documented, low-friction path to obtain it (CLI upgrade, one-time `edgeone login`).

**Missing dependencies with fallback:**
- Git remote: absent, but not required for this phase's chosen deploy path (CLI-based).

## Validation Architecture

This phase has no traditional unit-test surface — its four success criteria are all "prove a live, deployed platform primitive works," which is inherently an integration/smoke-test concern against the real deployed environment, not something a local test runner can substitute for.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none (infrastructure verification via HTTP smoke checks, not a unit-test framework) |
| Config file | none — see Wave 0 |
| Quick run command | `curl -sf https://<deployed-domain>/api/hello` |
| Full suite command | Sequential curl checks against all four success criteria (see map below) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-01 (criterion 1) | Static site publicly reachable | smoke | `curl -sf -o /dev/null -w "%{http_code}" https://<deployed-domain>/` → expect `200` | ❌ Wave 0 (needs deployed URL) |
| DEPLOY-01 (criterion 2) | Edge Function callable, returns real response | smoke | `curl -sf https://<deployed-domain>/api/hello` → expect non-empty, non-mocked body | ❌ Wave 0 |
| DEPLOY-01 (criterion 3) | Secrets/env readable by deployed Function | smoke | `curl -sf https://<deployed-domain>/api/config-check` → expect JSON showing config value present | ❌ Wave 0 |
| DEPLOY-01 (criterion 4) | KV write-then-read across requests | smoke (2-step) | `curl -sf -X POST -d '{"value":"phase1-ok"}' https://<deployed-domain>/api/kv-check` then `curl -sf https://<deployed-domain>/api/kv-check` → expect the same value round-trips | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Local dev check via `edgeone makers dev` (note: KV/env pulled via `edgeone makers link` for local parity; note also that CLI docs state `fetch` cannot reach EdgeOne node cache/origin from the local debug environment — local checks validate code paths, not full edge behavior)
- **Per wave merge:** Full curl-based smoke suite above, run against the actual live deployed URL
- **Phase gate:** All four smoke checks must pass against the live deployment (not local dev) before `/gsd-verify-work` — this is a hard requirement since the phase goal is explicitly "not just local dev only"

### Wave 0 Gaps
- [ ] `edge-functions/api/hello.js` — covers criterion 2
- [ ] `edge-functions/api/config-check.js` — covers criterion 3
- [ ] `edge-functions/api/kv-check.js` — covers criterion 4
- [ ] KV namespace created + bound to project (manual console step, see Open Question 1) — blocks criterion 4 test
- [ ] At least one env var set via console or `edgeone makers env set` (e.g. `PLACEHOLDER_OIDC_CLIENT_ID`) — blocks criterion 3 test
- [ ] CLI upgraded to 1.6.23 (`npm install -g edgeone@latest`) — recommended before first deploy attempt

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Out of scope for Phase 1 (deferred to Phase 2 — SSO) |
| V3 Session Management | no | Out of scope for Phase 1 |
| V4 Access Control | no | Out of scope for Phase 1 — no tenant/user model exists yet |
| V5 Input Validation | partial | The KV-check function accepts a POST body; validate/sanitize before use as a KV key or value (reject non-string/oversized input) even in this throwaway skeleton, to establish the pattern early |
| V6 Cryptography | no | No crypto operations in this phase's scope |
| V14 Configuration | yes | Secrets (placeholder OIDC client credentials) must be stored via EdgeOne's env var mechanism (`context.env`), never hardcoded in source or committed to git; env values are also capped at 500 bytes per the platform (`[VERIFIED: pages.edgeone.ai/document/limits]` — Configuration File Limitations table: "Variable value length: 500 bytes") |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leakage via git commit | Information Disclosure | Never place secret values in `edgeone.json`, code, or `.env` files committed to git — use console Environment Management or `edgeone makers env set`, which stores values server-side and injects at runtime only |
| KV key injection from unsanitized client input | Tampering | Validate that any client-supplied string used to build a KV key matches the platform's allowed charset (`^[A-Za-z0-9_]+$`) before use — reject rather than silently strip illegal characters, to avoid unintended key collisions |
| Webhook deploy-trigger URL leakage | Information Disclosure / Denial of Service | If a Deploy Webhook is set up later (not needed for Phase 1), the docs explicitly warn these URLs require no additional authentication — treat as a secret and rotate if leaked `[VERIFIED: pages.edgeone.ai/document/create-deploys]` |

## Sources

### Primary (HIGH confidence)
- `pages.edgeone.ai/document/edge-functions` — Edge Functions overview, routing, Function Handlers, EventContext, Runtime APIs, Use Limits, sample templates
- `pages.edgeone.ai/document/kv-storage` — KV concepts, quick start, full API (put/get/delete/list), example code
- `pages.edgeone.ai/document/edgeone-cli` — full CLI command reference, quick start, CI/CD integration, env var management commands
- `pages.edgeone.ai/document/edgeone-json` — full `edgeone.json` config reference (buildCommand, outputDirectory, cloudFunctions, schedules, agents)
- `pages.edgeone.ai/document/building-output-configuration` — Build Output API, directory-to-output mapping for static/edge/cloud functions
- `pages.edgeone.ai/document/build-guide` — build settings, environment management (Production/Preview), environment variable configuration
- `pages.edgeone.ai/document/direct-upload` — direct upload steps, entry-file requirements, functions support via direct upload
- `pages.edgeone.ai/document/create-deploys` — deploy triggers (git auto-trigger, manual, webhook)
- `edgeone.ai/document/211893332490612736` — EdgeOne Makers Free Edition Limits (project, build, functions, KV, security limits)
- `cloud.tencent.com/document/product/1552/127416` — Edge Functions (Chinese-language mirror, cross-checked against English doc, consistent content)
- `npm view edgeone` (executed directly) — version 1.6.23, publish history, description, no repository field
- Local shell probes (`node --version`, `npm --version`, `edgeone --version`, `git --version`, `git remote -v`) — executed directly this session

### Secondary (MEDIUM confidence)
- `github.com/SunIsAlex/deepessay/blob/main/EDGEONE-GUIDE.md` — community field-notes on KV-vs-Cloud-Function gotchas, global KV variable binding pattern, cross-checked against and consistent with official KV docs on the "Edge Functions only" restriction
- `github.com/TencentEdgeOne/pages-templates` (examples directory listing) — confirms `functions-kv`, `functions-geolocation` official example template names

### Tertiary (LOW confidence)
- WebSearch results on default domain format and console screenshots — not independently confirmed via an authoritative fetch this session; flagged in Open Questions and Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — CLI version/existence directly verified via `npm view`; no other runtime packages needed
- Architecture (Edge vs Cloud Functions, routing, KV binding): HIGH — all drawn from official `pages.edgeone.ai/document/*` pages fetched directly this session, cross-checked against a Chinese-language official mirror and a consistent third-party field report
- Pitfalls: HIGH for KV/Edge-vs-Cloud confusion and eventual consistency (directly stated in official docs + corroborated); MEDIUM for the `node-functions/` vs `cloud-functions/` directory naming variance (one source says each) — flagged as Assumption A1
- Deployment path recommendation (CLI over git): HIGH — directly verified this repo has no git remote, and CLI deploy is documented as git-independent

**Research date:** 2026-08-11
**Valid until:** ~30 days (2026-09-10) — platform is under active rebranding (Pages→Makers transition still in progress per docs) and CLI ships frequent releases (203 versions since Dec 2024); re-verify CLI namespace/command names and directory-naming conventions if this research is consumed after that window.
