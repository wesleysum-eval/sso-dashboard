// GET /api/data/security-events
//
// Session-gated route proving the same tenant-scoped data-fetch path as
// Plan 03-01's cdn-traffic.js, generalized to a second, independently
// versioned teo Open API action (Phase 3 Plan 02, DATA-02/DATA-03): verify
// session -> resolve tenant -> KV-backed account lookup ->
// TC3-HMAC-SHA256-signed call to `DescribeDDoSAttackData` -> generic
// response, never a raw credential or upstream error.
//
// D-02/T-03-05 (critical, mitigate): `ZoneIds` is set exclusively from
// `getTenantAccountVerbose(payload.tenant_id)`, where `payload` comes only
// from `verifySession()`. No code path in this file reads a client-supplied
// scoping value (no `request.url` query-string parsing, no header other
// than `Cookie` is read for scoping purposes) — identical guarantee to
// cdn-traffic.js, re-verified here via Plan 03-02's explicit cross-tenant
// negative test.
//
// D-05 (high, mitigate): every failure branch — missing session, missing
// KV mapping, network/fetch failure, or a `Response.Error` from the teo
// API — returns the same generic `{ available: false }` shape. This file
// never includes `account.secretId`, `account.secretKey`, or
// `teoResponse.Response.Error` in any response it produces, at any branch,
// per 03-RESEARCH.md Pitfall 5 (Tencent's own error text sometimes embeds
// the ZoneId).
//
// T-03-04 (high, mitigate): `verifySession()` is called first, before any
// KV read or outbound call; a missing/invalid session returns 401
// immediately — this must be the very first branch.
//
// 03-RESEARCH.md Pitfall 1: `DescribeDDoSAttackData` uses its OWN
// `Version: '2022-09-01'` — this must never be shared with/copied from
// `DescribeTimingL7AnalysisData`'s version string (see cdn-traffic.js),
// even though both currently happen to resolve to the same literal value.
import { verifySession } from '../../lib/session.js';
import { getTenantAccountVerbose } from '../../lib/tenant-mapping.js';
import { signTeoRequest, toTeoRfc3339 } from '../../lib/teo-signer.js';

// TEMPORARY diagnostic, same convention as cdn-traffic.js's DATA_DEBUG —
// when env.DATA_DEBUG === 'true', includes a coarse failure category and
// (for teo API errors only) the raw Error.Message, so the live checkpoint
// can be diagnosed without EdgeOne log access. The Message can only be
// produced by hitting your OWN account's teo credentials while YOU are
// logged in — there is no cross-tenant exposure while this flag is on.
// Remove once Phase 3's live checkpoint is confirmed passing.
function noDataAvailable(env, reason, message) {
  const body = { available: false };
  if (env.DATA_DEBUG === 'true') {
    if (reason) body.debugReason = reason;
    if (message) body.debugMessage = message;
  }
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
    action: 'DescribeDDoSAttackData',
    version: '2022-09-01', // Pitfall 1: this action's own version, never DescribeTimingL7AnalysisData's
    payload: {
      StartTime: toTeoRfc3339(startTime),
      EndTime: toTeoRfc3339(endTime),
      MetricNames: ['ddos_attackBandwidth'],
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
    // Never forward Response.Error.Message in production (it can contain
    // the ZoneId, 03-RESEARCH.md Pitfall 5) — but under DATA_DEBUG=true
    // this is your own account's own error, safe for this temporary
    // diagnostic pass.
    return noDataAvailable(
      env,
      teoResponse.Response.Error.Code || 'teo_error',
      teoResponse.Response.Error.Message,
    );
  }

  return new Response(
    JSON.stringify({ available: true, data: teoResponse.Response.Data }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
