// GET /api/jobs/:id
//
// Polling endpoint for the async agent pipeline (Phase 6). The client polls
// this every ~2s while a job is running and renders a progress view, then
// swaps in the finished HTML report.
//
// Uses EdgeOne's bracket dynamic-routing convention (`[id].js` ->
// context.params.id), same as api/dashboard/[id].js.
//
// Security invariants:
//   1. verifySession() is the first branch — 401 before any KV read.
//   2. The KV key requires BOTH the session-derived tenant_id AND the URL's
//      job id. A guessed job id from another tenant's session resolves a
//      different prefix and can never match — cross-tenant read is
//      structurally impossible, not merely policy.
//   3. "missing job", "expired job", and "another tenant's job" all return
//      the byte-identical { error: 'not_found' } response. No distinguishing
//      signal (same D-06 discipline as api/dashboard/[id].js).
//   4. The response never includes a diagnostic reason for a failed job —
//      only the user-facing `note` written by the orchestrator.

import { verifySession } from '../../lib/session.js';
import { readJob, JOB_STATUS } from '../../lib/job-store.js';

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      // Polling must never be served from cache.
      'Cache-Control': 'no-store',
    },
  });
}

function notFound() {
  return jsonResponse({ error: 'not_found' });
}

export async function onRequestGet({ request, env, params }) {
  const cookies = new Cookies(request.headers.get('Cookie'));
  const sessionCookie = cookies.get('session');
  const payload = sessionCookie ? await verifySession(sessionCookie.value, env) : null;

  if (!payload) return jsonResponse({ error: 'unauthorized' }, 401);

  if (typeof params?.id !== 'string' || params.id.length === 0) return notFound();

  const record = await readJob(payload.tenant_id, params.id);
  if (!record) return notFound();

  // Shape the response explicitly rather than echoing the stored record —
  // prevents any future internal field from leaking to the client by
  // accident.
  const response = {
    status: record.status,
    step: typeof record.step === 'number' ? record.step : 0,
    maxSteps: typeof record.maxSteps === 'number' ? record.maxSteps : 0,
    note: typeof record.note === 'string' ? record.note : '',
    toolsUsed: Array.isArray(record.toolsUsed) ? record.toolsUsed : [],
  };

  // Only a completed job carries the HTML payload.
  if (record.status === JOB_STATUS.DONE && typeof record.html === 'string') {
    response.html = record.html;
    response.finishedAt = typeof record.finishedAt === 'number' ? record.finishedAt : null;
  }

  return jsonResponse(response);
}
