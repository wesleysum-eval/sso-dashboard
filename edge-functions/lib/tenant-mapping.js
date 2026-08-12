// KV-backed tenant_id -> EdgeOne account credential lookup (D-03).
//
// Read-only this phase — population (writing `tenant:*` KV records) is an
// onboarding-time concern explicitly out of this phase's build scope. This
// module only reads.
//
// KV binding is the bare global `my_kv` (console-configured, NOT
// `context.env.my_kv`) — same convention already proven in
// edge-functions/api/kv-check.js (Phase 1 Plan 02), guarded against the
// two-different-injected-global confusion documented in 03-RESEARCH.md
// Pitfall 3.
//
// KV key convention: `tenant:${tenantId}` -> JSON string
// { zoneId, secretId, secretKey }. secretId/secretKey are stored ENCRYPTED
// (AES-256-GCM via edge-functions/lib/kv-crypto.js) — see
// scripts/encrypt-tenant-secret.mjs for how to produce this value. zoneId
// stays plaintext (not sensitive on its own).
//
// Fails closed on every error path (missing binding, missing record,
// malformed JSON, missing required field, decryption failure) by returning
// `null` rather than throwing — callers treat `null` as "no mapping" and
// fall through to the generic D-05 "no data" response, never an unhandled
// exception that could leak a stack trace to the client.
import { decryptSecret } from './kv-crypto.js';

export async function getTenantAccount(tenantId, env) {
  if (typeof my_kv === 'undefined') return null; // KV not bound — fail closed, not open

  const raw = await my_kv.get(`tenant:${tenantId}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.zoneId || !parsed.secretId || !parsed.secretKey) return null;

    const secretId = await decryptSecret(parsed.secretId, env);
    const secretKey = await decryptSecret(parsed.secretKey, env);
    if (!secretId || !secretKey) return null; // decryption failure -> fail closed, never fall back to raw value

    return { zoneId: parsed.zoneId, secretId, secretKey };
  } catch {
    return null; // malformed record -> treat as no mapping, never throw raw parse errors to caller
  }
}
