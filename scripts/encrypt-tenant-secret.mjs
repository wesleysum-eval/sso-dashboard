// Local CLI helper — encrypts secretId/secretKey the SAME way
// edge-functions/lib/tenant-mapping.js will decrypt them, so the two never
// drift out of sync (imports edge-functions/lib/kv-crypto.js directly,
// no duplicated crypto logic).
//
// Run this on your own machine. Nothing here sends your secrets over the
// network — it only prints the encrypted JSON for you to paste into the
// EdgeOne Makers Console KV Storage UI yourself.
//
// Usage:
//   KV_ENCRYPTION_KEY=<value from your .env> node scripts/encrypt-tenant-secret.mjs <zoneId> <secretId> <secretKey>
//
// Prints the exact JSON string to use as the KV value for key
// `tenant:<tenant_id>`.
import { encryptSecret } from '../edge-functions/lib/kv-crypto.js';

async function main() {
  const [zoneId, secretId, secretKey] = process.argv.slice(2);

  if (!zoneId || !secretId || !secretKey) {
    console.error(
      'Usage: KV_ENCRYPTION_KEY=<key> node scripts/encrypt-tenant-secret.mjs <zoneId> <secretId> <secretKey>',
    );
    process.exit(1);
  }

  const env = { KV_ENCRYPTION_KEY: process.env.KV_ENCRYPTION_KEY };
  if (!env.KV_ENCRYPTION_KEY) {
    console.error('Missing KV_ENCRYPTION_KEY env var. Generate one with: openssl rand -base64 32');
    process.exit(1);
  }

  const encryptedSecretId = await encryptSecret(secretId, env);
  const encryptedSecretKey = await encryptSecret(secretKey, env);

  const kvValue = JSON.stringify({
    zoneId,
    secretId: encryptedSecretId,
    secretKey: encryptedSecretKey,
  });

  console.log('\nPaste this as the KV value for key `tenant:<tenant_id>`:\n');
  console.log(kvValue);
  console.log('');
}

main();
