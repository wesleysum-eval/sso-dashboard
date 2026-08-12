// Generic, standards-compliant OIDC client configuration (D-02).
//
// getOidcConfig(env) discovers the customer's IdP via its standard OIDC
// discovery document (env.OIDC_ISSUER_URL) and returns an openid-client
// `Configuration` object used by both /api/auth/login and
// /api/auth/callback. There is zero vendor-specific branching here — the
// exact same code path works for any IdP that exposes a standard discovery
// document (Auth0, Okta, Keycloak, etc.).
//
// The result is memoized in a module-scope variable as a best-effort cache
// for the lifetime of a warm Edge Function instance. This is NOT a durable
// cache (no KV involved, per D-06) — a cold start will always re-run
// discovery. See 02-RESEARCH.md Open Question 2 (resolved): cache-hit
// behavior is never assumed or depended upon by any verification step.
import * as client from 'openid-client';

// EdgeOne's Edge Function runtime does not implement the standard
// `AbortSignal.timeout(ms)` static method (confirmed via local
// `edgeone makers dev` — TypeError: AbortSignal.timeout is not a function),
// which `openid-client`/`oauth4webapi` call internally for fetch timeouts
// during discovery and token exchange. Polyfill it with the standard,
// spec-equivalent behavior (an AbortSignal that fires after `ms`) before
// getOidcConfig() is ever called. Guarded so it's a no-op on runtimes that
// already provide it natively.
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = function timeout(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return controller.signal;
  };
}

async function edgeOneCompatibleFetch(input, init = {}) {
  if (init.body instanceof URLSearchParams) {
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
    }

    return fetch(input, {
      ...init,
      headers,
      body: init.body.toString(),
    });
  }

  return fetch(input, init);
}

let cachedConfig;

export async function getOidcConfig(env) {
  if (cachedConfig) return cachedConfig;

  const server = new URL(env.OIDC_ISSUER_URL);
  cachedConfig = await client.discovery(
    server,
    env.OIDC_CLIENT_ID,
    env.OIDC_CLIENT_SECRET,
  );
  cachedConfig[client.customFetch] = edgeOneCompatibleFetch;

  return cachedConfig;
}
