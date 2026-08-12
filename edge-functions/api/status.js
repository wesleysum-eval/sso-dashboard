// GET /api/status
// Reads a platform-managed secret (never echoes the raw value) and reports
// whether a KV namespace is bound. KV binding lands in Plan 02 (console-only
// step) — kvBound is expected to be false until then.
//
// Phase 2 Plan 02 (AUTH-02): additionally reports session state by reading
// the `session` cookie (if present) and verifying it via `verifySession`
// (edge-functions/lib/session.js, established in Plan 02-01). `authenticated`
// is true only when verification succeeds; `tenantId` is read exclusively
// from the verified JWT payload — never from a client-supplied query
// parameter (AUTH-03, re-verified here at the read side per T-02-07). The
// raw JWT string and SESSION_SIGNING_KEY are never included in the response
// body, consistent with this file's existing never-echo-secrets pattern
// (T-02-08).
import { verifySession } from '../lib/session.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  const hasConfig = Boolean(env && env.PLACEHOLDER_OIDC_CLIENT_ID);
  const kvBound = typeof my_kv !== 'undefined';

  const cookies = new Cookies(request.headers.get('Cookie'));
  const sessionCookie = cookies.get('session');
  const payload = sessionCookie
    ? await verifySession(sessionCookie.value, env)
    : null;

  const authenticated = Boolean(payload);
  const tenantId = authenticated ? payload.tenant_id : null;

  const body = {
    hasConfig,
    kvBound,
    authenticated,
    tenantId,
    ts: Date.now(),
  };

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}
