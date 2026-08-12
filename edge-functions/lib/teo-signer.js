// TC3-HMAC-SHA256 request signing for the Tencent Cloud `teo` (EdgeOne) Open
// API, built entirely on `crypto.subtle` — no SDK/npm dependency (no
// edge-runtime-compatible official SDK exists, per 03-RESEARCH.md Standard
// Stack). Only the request-shaping (canonical request concatenation, string
// to sign, HMAC chain order) is hand-rolled here; the cryptographic
// primitives themselves (SHA-256 digest, HMAC-SHA256 sign) are always the
// platform-native `crypto.subtle` calls, never a custom JS implementation
// (03-RESEARCH.md "Don't Hand-Roll").
//
// Algorithm source (quoted/adapted verbatim from Tencent's own spec):
// intl.cloud.tencent.com/zh/document/product/583/31703
// "TC3-HMAC-SHA256 Signature Algorithm"
const enc = new TextEncoder();

async function sha256Hex(message) {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(message));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, enc.encode(message));
}

async function hmacHex(keyBytes, message) {
  const sig = await hmac(keyBytes, message);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// signTeoRequest({ secretId, secretKey, action, version, payload, domain })
// -> { url, headers, body } ready for fetch().
//
// The request timestamp is always computed fresh via
// Math.floor(Date.now() / 1000) inside this call — never cache or reuse a
// signed request across invocations (03-RESEARCH.md Anti-Patterns; Tencent's
// signature expires after a 5-minute clock-skew window).
export async function signTeoRequest({ secretId, secretKey, action, version, payload, domain }) {
  const host = domain || 'teo.tencentcloudapi.com';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const payloadStr = JSON.stringify(payload);

  // Step 1: canonical request.
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const hashedPayload = await sha256Hex(payloadStr);
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join(
    '\n',
  );

  // Step 2: string to sign.
  const service = 'teo';
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, hashedCanonicalRequest].join(
    '\n',
  );

  // Step 3: signing key derivation chain — SecretDate -> SecretService ->
  // SecretSigning. Intermediate results stay as raw bytes through the whole
  // chain; only the final signature is hex-encoded.
  const secretDate = await hmac(enc.encode('TC3' + secretKey), date);
  const secretService = await hmac(new Uint8Array(secretDate), service);
  const secretSigning = await hmac(new Uint8Array(secretService), 'tc3_request');
  const signature = await hmacHex(new Uint8Array(secretSigning), stringToSign);

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${host}/`,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
    },
    body: payloadStr,
  };
}
