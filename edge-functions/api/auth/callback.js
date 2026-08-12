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
import { serializeCookie, serializeCookieRemoval } from '../../lib/cookie-header.js';

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
  if (!txnCookie) {
    // Server-side-only diagnostic (never in the HTTP response, D-05) — the
    // oidc_txn cookie is missing entirely. Common causes: the browser
    // dropped it during a multi-hop SSO chain (SameSite=Lax should survive
    // a top-level redirect, but an intermediate IdP hop that lands via
    // fetch/iframe rather than a full top-level navigation can lose it),
    // the 600s max-age expired, or the user opened /api/auth/callback in a
    // different browser context than /api/auth/login was started in.
    console.log('auth callback: no oidc_txn cookie present on callback request');
    return redirectToAccessDenied();
  }

  let code_verifier;
  let state;
  let nonce;
  try {
    ({ code_verifier, state, nonce } = JSON.parse(decodeURIComponent(txnCookie.value)));
  } catch {
    console.log('auth callback: oidc_txn cookie present but failed to parse');
    return redirectToAccessDenied();
  }

  let tokens;
  try {
    tokens = await client.authorizationCodeGrant(config, new URL(request.url), {
      pkceCodeVerifier: code_verifier,
      expectedState: state,
      expectedNonce: nonce,
    });
  } catch (err) {
    // Invalid/expired code, state mismatch, nonce mismatch, or any other
    // exchange failure — RFC 9700 SS4.7.1. Server-side-only diagnostic
    // (never in the HTTP response, D-05) — error name/message only, never
    // the raw code/state/tokens.
    console.log('auth callback: authorizationCodeGrant failed:', err?.name, err?.message);
    return redirectToAccessDenied();
  }

  // Signature/issuer/audience already verified internally by
  // authorizationCodeGrant. This is the ONLY read of the tenant claim —
  // never from request.url, URL.searchParams, headers, or the request
  // body (AUTH-03).
  const claims = tokens.claims();
  const tenantId = claims?.tenant_id;

  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    // Server-side-only diagnostic for Wave 0 IdP setup debugging
    // (RESEARCH.md Pitfall 3). Never included in the HTTP response —
    // the client only ever sees the generic 302 to /access-denied.html
    // below, identical to every other failure branch in this file (D-05).
    console.log(
      'auth callback: missing/invalid tenant_id claim. Expected key: tenant_id. Present claim keys:',
      claims ? Object.keys(claims) : [],
    );
    return redirectToAccessDenied();
  }

  const sessionJwt = await signSession(
    { tenantId, sub: claims.sub },
    env,
  );

  const response = new Response(null, {
    status: 302,
    headers: { Location: '/' },
  });
  response.headers.append(
    'Set-Cookie',
    serializeCookie('session', sessionJwt, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 43200,
      path: '/',
    }),
  );
  response.headers.append(
    'Set-Cookie',
    serializeCookieRemoval('oidc_txn', { path: '/' }),
  );

  return response;
}
