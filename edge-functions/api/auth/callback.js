// GET /api/auth/callback
//
// Completes the OIDC authorization-code flow: exchanges the code for tokens
// (openid-client validates PKCE + state internally), extracts the
// signature-verified ID token claims, and issues this app's own session
// JWT. Every failure branch (missing transaction cookie, invalid code/state,
// exchange error) redirects to /access-denied.html via the identical
// 302-with-fixed-Location response shape — no distinguishing detail is ever
// returned to the client (D-05, RESEARCH.md Pitfall 5).
//
// AUTH-03: `claims.tenant_id` (from tokens.claims(), only available AFTER
// openid-client's internal ID-token signature/issuer/audience verification
// inside authorizationCodeGrant) is the ONLY source ever read for the
// tenant identity. Nothing is read from request.url, URL.searchParams,
// headers, or the request body for this purpose anywhere in this file.
import * as client from 'openid-client';
import { getOidcConfig } from '../../lib/oidc-config.js';
import { signSession } from '../../lib/session.js';

function redirectToAccessDenied() {
  return new Response(null, {
    status: 302,
    headers: { Location: '/access-denied.html' },
  });
}

export async function onRequestGet({ request, env }) {
  const config = await getOidcConfig(env);

  const cookies = new Cookies(request.headers.get('Cookie'));
  const txnCookie = cookies.get('oidc_txn');
  if (!txnCookie) return redirectToAccessDenied();

  let code_verifier;
  let state;
  let nonce;
  try {
    ({ code_verifier, state, nonce } = JSON.parse(txnCookie.value));
  } catch {
    return redirectToAccessDenied();
  }

  let tokens;
  try {
    tokens = await client.authorizationCodeGrant(config, new URL(request.url), {
      pkceCodeVerifier: code_verifier,
      expectedState: state,
      expectedNonce: nonce,
    });
  } catch {
    // Invalid/expired code, state mismatch, nonce mismatch, or any other
    // exchange failure — RFC 9700 SS4.7.1.
    return redirectToAccessDenied();
  }

  // Signature/issuer/audience already verified internally by
  // authorizationCodeGrant. This is the ONLY read of the tenant claim.
  const claims = tokens.claims();
  const tenantId = claims?.tenant_id;

  const sessionJwt = await signSession(
    { tenantId, sub: claims?.sub },
    env,
  );

  const outCookies = new Cookies();
  outCookies.set('session', sessionJwt, {
    httponly: true,
    secure: true,
    samesite: 'Lax',
    max_age: '43200',
    path: '/',
  });
  outCookies.remove('oidc_txn', { path: '/' });

  const response = new Response(null, {
    status: 302,
    headers: { Location: '/' },
  });
  response.setCookies(outCookies);

  return response;
}
