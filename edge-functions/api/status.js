// GET /api/status
// Reads a platform-managed secret (never echoes the raw value) and reports
// whether a KV namespace is bound. KV binding lands in Plan 02 (console-only
// step) — kvBound is expected to be false until then.
export function onRequestGet(context) {
  const { env } = context;

  const hasConfig = Boolean(env && env.PLACEHOLDER_OIDC_CLIENT_ID);
  const kvBound = typeof my_kv !== 'undefined';

  const body = {
    hasConfig,
    kvBound,
    ts: Date.now(),
  };

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}
