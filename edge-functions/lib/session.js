// JWT session cookie helpers (D-06: signed JWT in an httpOnly cookie, no
// server-side/KV-backed session store).
//
// signSession({ tenantId, sub }, env) issues a session token. The payload is
// intentionally minimal — only tenant_id and sub — per 02-RESEARCH.md
// Pitfall 2 (EdgeOne's Cookies API caps a single cookie's encoded size at
// 1KB; never grow this payload with IdP group/role lists or other bulky
// claims).
//
// Expiry is a fixed 12h (RESEARCH.md Pitfall 4) — this is a session-cookie
// lifetime, not an OAuth access-token lifetime; there is no refresh
// mechanism because D-06 has no revocation/server-side store.
//
// verifySession(jwtString, env) wraps jose's jwtVerify and normalizes every
// failure mode (expired, tampered, malformed) to a single `null` return —
// callers never need to distinguish *why* verification failed.
import { SignJWT, jwtVerify } from 'jose';

const ALG = 'HS256';
const EXPIRY = '12h';

function getSigningKey(env) {
  return new TextEncoder().encode(env.SESSION_SIGNING_KEY);
}

export async function signSession({ tenantId, sub }, env) {
  const secret = getSigningKey(env);

  return new SignJWT({ tenant_id: tenantId, sub })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret);
}

export async function verifySession(jwtString, env) {
  try {
    const secret = getSigningKey(env);
    const { payload } = await jwtVerify(jwtString, secret);
    return payload;
  } catch {
    return null;
  }
}
