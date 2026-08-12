// GET/POST /api/tenant/connect
//
// Self-service replacement for manually pasting encrypted JSON into the
// EdgeOne Makers Console KV Storage UI (scripts/encrypt-tenant-secret.mjs
// remains available as a manual fallback). A logged-in user submits their
// own Zone ID / SecretId / SecretKey once via the dashboard form; this
// route encrypts the secret fields and writes them to the exact same KV
// shape edge-functions/lib/tenant-mapping.js already reads:
// `tenant:${tenantId}` -> { zoneId, secretId, secretKey } (secretId/
// secretKey ciphertext, via edge-functions/lib/kv-crypto.js).
//
// Critical invariant (same pattern as edge-functions/api/data/cdn-traffic.js
// DATA-03): the KV key is always `tenant:${payload.tenant_id}`, where
// `payload` comes exclusively from verifySession(). Nothing in this file
// ever reads a tenant/account scoping value from the request body, a query
// parameter, or any header other than Cookie — a user can only ever read or
// write their OWN tenant's record.
//
// GET: status check only — returns whether a connection exists and its
// zoneId. Never includes secretId/secretKey (encrypted or not) in this
// response, even though the stored ciphertext alone would not be directly
// usable — same "never echo secrets" convention as every other route in
// this codebase.
//
// POST: validates the three fields are non-empty strings under a length
// cap, encrypts secretId/secretKey, writes to KV, and returns only
// { saved: true, zoneId } — never echoes back any secret value.
import { verifySession } from '../../lib/session.js';
import { encryptSecret } from '../../lib/kv-crypto.js';

const MAX_FIELD_LENGTH = 512;

function isValidField(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_FIELD_LENGTH;
}

async function getVerifiedPayload(request, env) {
  const cookies = new Cookies(request.headers.get('Cookie'));
  const sessionCookie = cookies.get('session');
  return sessionCookie ? await verifySession(sessionCookie.value, env) : null;
}

export async function onRequestGet({ request, env }) {
  const payload = await getVerifiedPayload(request, env);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof my_kv === 'undefined') {
    return new Response(JSON.stringify({ connected: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const raw = await my_kv.get(`tenant:${payload.tenant_id}`);
  if (!raw) {
    return new Response(JSON.stringify({ connected: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.zoneId) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ connected: true, zoneId: parsed.zoneId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ connected: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPost({ request, env }) {
  const payload = await getVerifiedPayload(request, env);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof my_kv === 'undefined') {
    return new Response(JSON.stringify({ error: 'save_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json().catch(() => null);
  const zoneId = body && body.zoneId;
  const secretId = body && body.secretId;
  const secretKey = body && body.secretKey;

  if (!isValidField(zoneId) || !isValidField(secretId) || !isValidField(secretKey)) {
    return new Response(JSON.stringify({ error: 'invalid_input' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const encryptedSecretId = await encryptSecret(secretId, env);
    const encryptedSecretKey = await encryptSecret(secretKey, env);

    await my_kv.put(
      `tenant:${payload.tenant_id}`,
      JSON.stringify({ zoneId, secretId: encryptedSecretId, secretKey: encryptedSecretKey }),
    );

    return new Response(JSON.stringify({ saved: true, zoneId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'save_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
