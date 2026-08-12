// AES-256-GCM encrypt/decrypt for values stored in EdgeOne KV, built entirely
// on Web Crypto (`crypto.subtle`) — no npm dependency, same "hand-roll only
// the shaping, never the primitive" approach as edge-functions/lib/teo-signer.js.
//
// Why: edge-functions/lib/tenant-mapping.js stores `{ zoneId, secretId,
// secretKey }` per tenant in KV. Anyone with EdgeOne Makers Console -> KV
// Storage access could otherwise read the raw Tencent Cloud API secret in
// plaintext. This module encrypts `secretId`/`secretKey` before they're
// written to KV and decrypts them only inside the Edge Function at read
// time — `zoneId` is left as-is (not sensitive on its own).
//
// Keyed by env.KV_ENCRYPTION_KEY — a 32-byte key, base64-encoded, generated
// once (e.g. `openssl rand -base64 32`) and set as a console-managed secret,
// same pattern already established for SESSION_SIGNING_KEY.
//
// This file is imported both by edge-functions (EdgeOne's edge runtime,
// which natively provides `crypto.subtle` as a global) and by the local
// scripts/encrypt-tenant-secret.mjs Node script (Node 19+ also exposes
// `crypto.subtle` as a global; the fallback below covers older Node via
// node:crypto's webcrypto export). No top-level await — resolved lazily per
// call so this loads safely on any bundler/runtime.
async function getSubtle() {
  if (typeof crypto !== 'undefined' && crypto.subtle) return crypto.subtle;
  const { webcrypto } = await import('node:crypto');
  return webcrypto.subtle;
}

function base64Encode(bytes) {
  const bin = String.fromCharCode(...bytes);
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
}

function base64Decode(str) {
  if (typeof atob === 'function') {
    const bin = atob(str);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  return new Uint8Array(Buffer.from(str, 'base64'));
}

async function getAesKey(env) {
  const raw = env && env.KV_ENCRYPTION_KEY;
  if (!raw) throw new Error('KV_ENCRYPTION_KEY is not set');
  const subtle = await getSubtle();
  const keyBytes = base64Decode(raw);
  return subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// encryptSecret(plaintext, env) -> "base64(iv).base64(ciphertext+tag)"
export async function encryptSecret(plaintext, env) {
  const subtle = await getSubtle();
  const key = await getAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${base64Encode(iv)}.${base64Encode(new Uint8Array(ciphertext))}`;
}

// decryptSecret(ciphertext, env) -> plaintext string, or null on any failure
// (wrong key, corrupted/malformed value) — fails closed, never throws, same
// convention as the rest of edge-functions/lib/tenant-mapping.js.
export async function decryptSecret(value, env) {
  try {
    const [ivB64, dataB64] = String(value).split('.');
    if (!ivB64 || !dataB64) return null;

    const subtle = await getSubtle();
    const key = await getAesKey(env);
    const iv = base64Decode(ivB64);
    const data = base64Decode(dataB64);
    const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
