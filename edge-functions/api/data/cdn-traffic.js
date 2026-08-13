// GET /api/data/cdn-traffic
//
// Session-gated route proving the full tenant-scoped data-fetch path
// end-to-end (Phase 3 tracer, DATA-01/DATA-03): verify session -> resolve
// tenant -> KV-backed account lookup -> TC3-HMAC-SHA256-signed call to the
// real teo Open API (`DescribeTimingL7AnalysisData`) -> generic response,
// never a raw credential or upstream error.
//
// D-02/T-03-01 (critical, mitigate): `ZoneIds` is set exclusively from
// `getTenantAccount(payload.tenant_id)`, where `payload` comes only from
// `verifySession()`. No code path in this file reads a client-supplied
// scoping value (no `request.url` query-string parsing, no header other
// than `Cookie` is read for scoping purposes).
//
// D-05/T-03-02 (high, mitigate): every failure branch — missing session,
// missing KV mapping, network/fetch failure, or a `Response.Error` from the
// teo API — returns the same generic `{ available: false }` shape. This
// file never includes `account.secretId`, `account.secretKey`, or
// `teoResponse.Response.Error` in any response it produces, at any branch,
// per 03-RESEARCH.md Pitfall 5 (Tencent's own error text sometimes embeds
// the ZoneId).
//
// T-03-04 (high, mitigate): `verifySession()` is called first, before any
// KV read or outbound call; a missing/invalid session returns 401
// immediately — this must be the very first branch.
import { verifySession } from '../../lib/session.js';
import { getTenantAccountVerbose } from '../../lib/tenant-mapping.js';
import { signTeoRequest } from '../../lib/teo-signer.js';

// TEMPORARY diagnostic, same convention as auth/callback.js's
// AUTH_DEBUG_CALLBACK — when env.DATA_DEBUG === 'true', includes a coarse
// failure category (never a secret, never raw upstream error text) so the
// live "no data available" checkpoint can be diagnosed without EdgeOne log
// access. Remove once Phase 3/4 live checkpoints are confirmed passing.
function noDataAvailable(env, reason) {
  const body = { available: false };
  if (env.DATA_DEBUG === 'true' && reason) body.debugReason = reason;
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

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

  // Only source of ZoneId/credentials in this file — never a query
  // parameter, header, or body field (DATA-03's core guarantee).
  const { account, reason: lookupReason } = await getTenantAccountVerbose(payload.tenant_id, env);
  if (!account) {
    return noDataAvailable(env, lookupReason); // D-05: no mapping is a generic no-data state, not a distinct error
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
    return noDataAvailable(env, 'network_failure'); // D-05: network/fetch failure -> generic no-data
  }

  if (teoResponse.Response && teoResponse.Response.Error) {
    // Never forward Response.Error.Message — it can contain the ZoneId
    // (03-RESEARCH.md Pitfall 5). Error.Code alone (e.g.
    // "AuthFailure.SecretIdNotFound", "InvalidParameter") is safe — it's a
    // fixed Tencent enum, not free text, and never embeds the ZoneId/secret.
    return noDataAvailable(env, teoResponse.Response.Error.Code || 'teo_error');
  }

  return new Response(
    JSON.stringify({ available: true, data: teoResponse.Response.Data }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
