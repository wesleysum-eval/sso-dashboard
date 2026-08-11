// GET /api/auth/login
//
// Starts the OIDC authorization-code flow (AUTH-01): builds a PKCE + state +
// nonce protected authorization URL for the customer's configured IdP and
// redirects the browser there. The transaction values needed to validate
// the callback (code_verifier, state, nonce) are stashed in a short-lived
// httpOnly cookie — never trusted from anywhere else.
//
// Both PKCE and nonce are used together as defense-in-depth (RESEARCH.md
// Alternatives Considered: "implement both" since the marginal cost is
// near zero). Every redirect in this flow uses 302, never 307
// (RESEARCH.md Anti-Patterns — 307 preserves method/body and can leak
// credentials on redirect).
import * as client from 'openid-client';
import { getOidcConfig } from '../../lib/oidc-config.js';

export async function onRequestGet({ request, env }) {
  const config = await getOidcConfig(env);

  const code_verifier = client.randomPKCECodeVerifier();
  const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const parameters = {
    redirect_uri: env.OIDC_REDIRECT_URI,
    scope: 'openid profile email',
    code_challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  };

  const redirectTo = client.buildAuthorizationUrl(config, parameters);

  const cookies = new Cookies();
  cookies.set(
    'oidc_txn',
    JSON.stringify({ code_verifier, state, nonce }),
    {
      httponly: true,
      secure: true,
      samesite: 'Lax',
      max_age: '600',
      path: '/',
    },
  );

  const response = new Response(null, {
    status: 302,
    headers: { Location: redirectTo.href },
  });
  response.setCookies(cookies);

  return response;
}
