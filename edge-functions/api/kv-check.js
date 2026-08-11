// POST/GET /api/kv-check
// Proves EdgeOne KV write-then-read across separate HTTP requests (Phase 1
// success criterion 4). KV binding is a bare global variable named `my_kv`
// (console-configured, NOT context.env.KV_NAME) — see RESEARCH.md Pattern 3.
//
// POST: writes the client-supplied `value` (coerced to String) to the
//       hardcoded key `phase1_check` and confirms the write.
// GET (or any other method): reads back the same key.
//
// Both branches guard on `typeof my_kv !== 'undefined'` and fail loudly with
// a 503 if the KV namespace isn't bound yet, instead of silently no-op'ing
// (RESEARCH.md Pitfall 1).
export async function onRequest({ request }) {
  if (typeof my_kv === 'undefined') {
    return new Response(JSON.stringify({ error: 'kv not bound' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const value = body && body.value !== undefined ? String(body.value) : String(Date.now());
    await my_kv.put('phase1_check', value);
    return new Response(JSON.stringify({ wrote: true, value }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const value = await my_kv.get('phase1_check');
  return new Response(JSON.stringify({ value }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
