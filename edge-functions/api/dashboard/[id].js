// GET /api/dashboard/:id
//
// Session-gated route retrieving a previously saved dashboard (SAVE-01),
// using EdgeOne's bracket dynamic-routing convention (`[id].js` ->
// `context.params.id`, confirmed via 04-RESEARCH.md's cited official
// example).
//
// T-04-05 (critical, mitigate): the KV key requires BOTH the
// session-derived tenant_id AND the URL's dashboard_id to match. A
// guessed/enumerated dashboard_id from a different tenant's session can
// never retrieve this tenant's record, because that different session
// resolves a different tenant_id prefix — never the URL's id alone.
//
// T-04-06 (high, mitigate): "missing key" and "wrong tenant" return the
// byte-identical { error: 'not_found' } response — no distinguishing
// signal between the two causes (D-06).
//
// T-04-07 (high, mitigate): verifySession() is the first branch, before any
// KV read.
import { verifySession } from '../../lib/session.js';

// D-08/D-06: this route's single failure shape for both a missing key and a
// cross-tenant retrieval attempt — never a stack trace, never a distinct
// signal for "doesn't exist" vs "belongs to another tenant".
function notFound() {
  return new Response(JSON.stringify({ error: 'not_found' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet({ request, env, params }) {
  const cookies = new Cookies(request.headers.get('Cookie'));
  const sessionCookie = cookies.get('session');
  const payload = sessionCookie ? await verifySession(sessionCookie.value, env) : null;

  // 401 before touching KV at all — same "verifySession is the very first
  // branch" rule as every other route in this codebase.
  if (!payload) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fail-closed on a missing KV binding — same guard as kv-check.js/
  // tenant-mapping.js.
  if (typeof my_kv === 'undefined') {
    return notFound();
  }

  // D-06's core guarantee: tenant_id comes exclusively from the verified
  // session, id comes from the URL. The KV key requires BOTH the correct
  // tenant prefix AND the correct id to match — a guessed/enumerated
  // dashboard_id from a different tenant's session can never retrieve this
  // tenant's record, because the different session resolves a different
  // tenant_id prefix.
  const raw = await my_kv.get(`dashboard:${payload.tenant_id}:${params.id}`);

  // Missing key OR a different tenant's session correctly failing to
  // match — identical response either way (D-06, never distinguish cause).
  if (!raw) {
    return notFound();
  }

  // The stored value is already the exact { spec, data, prompt, createdAt }
  // shape the client needs — no re-wrapping needed. Return it directly.
  return new Response(raw, {
    headers: { 'Content-Type': 'application/json' },
  });
}
