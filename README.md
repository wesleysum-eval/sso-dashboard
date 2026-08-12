# Enterprise SSO Dashboard

EdgeOne Makers dashboard that authenticates users with an external OIDC provider
and scopes tenant data from a verified app session.

## SSO Flow

1. `/api/auth/login` starts the OIDC authorization-code flow.
   - Generates PKCE verifier/challenge.
   - Generates `state` and `nonce`.
   - Stores the transaction values in the short-lived `oidc_txn` httpOnly cookie.
   - Redirects the browser to the configured OIDC issuer.
2. The identity provider authenticates the user and redirects to
   `/api/auth/callback`.
3. `/api/auth/callback` validates the transaction and token response.
   - Requires the `oidc_txn` cookie to be present and parseable.
   - Exchanges the authorization code through `openid-client`.
   - Verifies the returned ID token through the OIDC client flow.
   - Reads the tenant identifier from the configured tenant claim.
   - Issues the app `session` cookie after validation succeeds.
4. `/api/status` verifies the signed app session and reports authenticated state
   to the frontend.

An Auth0 "Successful login" event only confirms the user authenticated with
Auth0. This app can still deny the callback if the OIDC transaction fails or if
the ID token does not contain the expected tenant claim.

## Required Environment

```text
OIDC_ISSUER_URL=https://your-tenant.auth0.com/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URI=https://your-app.example.com/api/auth/callback
SESSION_SIGNING_KEY=...
KV_ENCRYPTION_KEY=...
```

Optional SSO troubleshooting/configuration:

```text
OIDC_TENANT_CLAIM=tenant_id
AUTH_DEBUG_CALLBACK=false
```

`OIDC_TENANT_CLAIM` defaults to `tenant_id`. Set it when Auth0 uses a
namespaced custom claim, for example:

```text
OIDC_TENANT_CLAIM=https://your-domain.example/tenant_id
```

## Auth0 Tenant Claim

The callback reads the tenant ID only from the verified ID token claims. For
Auth0, create a Post Login Action that adds the claim to the ID token. Auth0
commonly uses namespaced custom claims, so the claim name in EdgeOne must match
the exact key Auth0 emits.

Example shape:

```js
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://your-domain.example';
  api.idToken.setCustomClaim(`${namespace}/tenant_id`, 'tenant_123');
};
```

Then configure:

```text
OIDC_TENANT_CLAIM=https://your-domain.example/tenant_id
```

## Callback Debugging

If EdgeOne logs are unavailable, temporarily enable:

```text
AUTH_DEBUG_CALLBACK=true
```

With this flag enabled, `/access-denied.html` displays a non-token diagnostic
from the callback redirect.

Possible reasons:

```text
missing_oidc_txn_cookie
```

The callback did not receive the login transaction cookie.

```text
invalid_oidc_txn_cookie
```

The transaction cookie was present but could not be parsed.

```text
authorization_code_grant_failed
```

The code exchange failed. Check redirect URI, client secret, code expiry, state,
and nonce.

If the message is:

```text
Failed to construct Request: only String/ArrayBuffer/ArrayBufferView/Blob/ReadableStream/FormData is allowed as the body initializer
```

EdgeOne rejected the `URLSearchParams` request body used by the OIDC client for
the token exchange. The app installs a custom OIDC fetch wrapper that converts
that body to a form-encoded string before calling EdgeOne's fetch runtime.

```text
missing_tenant_claim
```

The ID token did not contain the configured tenant claim. Check
`OIDC_TENANT_CLAIM` against the exact claim key emitted by Auth0.

Turn the flag off after debugging:

```text
AUTH_DEBUG_CALLBACK=false
```
