// POST /api/dashboard
//
// Session-gated route saving a generated dashboard (SAVE-01) to the existing
// `my_kv` namespace (bound since Phase 1 Plan 02, same bare-global
// convention — D-05: no new storage binding is provisioned this phase).
//
// T-04-07 (high, mitigate): verifySession() is the first branch, before any
// KV call — identical pattern to every other route in this codebase
// (generate.js, cdn-traffic.js).
//
// T-04-05/T-04-06 (critical/high, mitigate): the KV key's tenant_id segment
// comes exclusively from verifySession() — never from the request body.
// This is what makes the cross-tenant negative test in dashboard/[id].js
// structurally true, not just policy.
import { verifySession } from '../lib/session.js';

// D-08: this route's single failure shape — never a stack trace, never a
// raw KV error message, at any branch.
function saveFailed() {
  return new Response(JSON.stringify({ error: 'save_failed' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
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

  // Fail-closed on a missing KV binding, same guard as kv-check.js/
  // tenant-mapping.js — never silently no-op.
  if (typeof my_kv === 'undefined') {
    return saveFailed();
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.spec) {
    return saveFailed();
  }

  const { spec, data, prompt } = body;

  // crypto.randomUUID() confirmed available on this edge runtime per
  // 04-RESEARCH.md (Web Crypto API docs list it alongside crypto.subtle).
  const dashboardId = crypto.randomUUID();

  // Stored value shape is exactly D-05's: the validated widget spec, the
  // fetched data snapshot (generated-once, not live-refreshing), the
  // original prompt text, and a createdAt timestamp. tenant_id in the KEY
  // always comes from verifySession() above, never from the request body.
  const record = JSON.stringify({ spec, data, prompt, createdAt: Date.now() });

  try {
    await my_kv.put(`dashboard:${payload.tenant_id}:${dashboardId}`, record);
  } catch {
    // Never forward the raw KV error — D-08's no-leak convention.
    return saveFailed();
  }

  return new Response(JSON.stringify({ dashboardId }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
