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

let cachedConfig;

export async function getOidcConfig(env) {
  if (cachedConfig) return cachedConfig;

  const server = new URL(env.OIDC_ISSUER_URL);
  cachedConfig = await client.discovery(
    server,
    env.OIDC_CLIENT_ID,
    env.OIDC_CLIENT_SECRET,
  );

  return cachedConfig;
}
