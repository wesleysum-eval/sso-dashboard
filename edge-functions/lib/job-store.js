// Job store for the async agent pipeline (Phase 6).
//
// The agent's plan -> call tool -> read -> plan again loop takes 30-90s,
// far longer than a comfortable blocking HTTP request. POST
// /api/generate-agent therefore creates a job record here, runs the loop,
// and updates the record as it progresses; the client polls
// GET /api/jobs/:id every ~2s and renders a progress view.
//
// Storage: the existing `my_kv` namespace (same bare-global convention as
// api/dashboard.js). No new binding is provisioned.
//
// Key shape: `job:${tenantId}:${jobId}`
//
// The tenantId segment always comes from the caller's verified session —
// never from the request body or URL. This is what makes cross-tenant job
// reads structurally impossible, exactly as in api/dashboard/[id].js:
// a different session resolves a different prefix, so a guessed jobId can
// never match another tenant's record.
//
// Records expire via an explicit `expiresAt` field checked on read rather
// than relying on a KV TTL, so behaviour is identical whether or not the
// runtime honours a ttl option.

const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Job status vocabulary. Closed set — the client switches on these exact
// strings, so never introduce a status without updating app.js too.
export const JOB_STATUS = {
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
};

function jobKey(tenantId, jobId) {
  return `job:${tenantId}:${jobId}`;
}

// createJob(tenantId, prompt, env) -> jobId | null
export async function createJob(tenantId, prompt, env) {
  if (typeof my_kv === 'undefined') return null;
  const jobId = crypto.randomUUID();
  const record = {
    status: JOB_STATUS.RUNNING,
    step: 0,
    maxSteps: 0,
    note: 'Starting analysis',
    toolsUsed: [],
    prompt: typeof prompt === 'string' ? prompt.slice(0, 500) : '',
    createdAt: Date.now(),
    expiresAt: Date.now() + JOB_TTL_MS,
  };
  try {
    await my_kv.put(jobKey(tenantId, jobId), JSON.stringify(record));
  } catch {
    return null;
  }
  return jobId;
}

// updateJob(tenantId, jobId, patch, env) -> boolean
//
// Read-modify-write. KV is eventually consistent, so a concurrent update
// could be lost — acceptable here because only the single orchestrator
// invocation writes to a given job, and the client only reads.
export async function updateJob(tenantId, jobId, patch) {
  if (typeof my_kv === 'undefined') return false;
  try {
    const raw = await my_kv.get(jobKey(tenantId, jobId));
    if (!raw) return false;
    const record = JSON.parse(raw);
    const next = { ...record, ...patch };
    await my_kv.put(jobKey(tenantId, jobId), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

// readJob(tenantId, jobId) -> record | null
//
// Returns null for a missing key, an expired record, or a parse failure —
// the caller renders the same "not found" state for all three, so there
// is no distinguishing signal (same D-06 discipline as dashboard/[id].js).
export async function readJob(tenantId, jobId) {
  if (typeof my_kv === 'undefined') return null;
  try {
    const raw = await my_kv.get(jobKey(tenantId, jobId));
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (typeof record.expiresAt === 'number' && Date.now() > record.expiresAt) {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}
