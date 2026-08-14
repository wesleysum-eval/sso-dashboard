// POST /api/generate-agent
//
// Phase 6: tool-calling agent. Instead of one fixed teo call followed by
// HTML generation (Phase 5's /api/generate-html), the LLM decides which
// tools to call, reads their results, decides whether it needs more, and
// only then composes the final HTML report.
//
// Async by design: the loop takes 30-90s. This route creates a job record,
// runs the loop, and updates the record as it goes. The client polls
// GET /api/jobs/:id and renders a progress view. The response to THIS
// request is just { jobId } — returned before the loop finishes.
//
// Security invariants (all carried forward, none relaxed):
//   1. verifySession() is the very first branch. 401 before anything else.
//   2. tenantId comes exclusively from the verified session and is the only
//      value used to resolve credentials and to key the job record.
//   3. The LLM never supplies a teo Action/Version/ZoneId. It supplies a
//      tool name resolved through the closed TOOLS array plus arguments
//      each tool validates against its own closed enum (tools/registry.js).
//   4. No secret and no teo Response.Error ever reaches LLM context or a
//      client response — enforced at the tool boundary.
//   5. The final HTML passes html-sanitizer.js (fail-closed content scan)
//      and fact-verifier.js (every displayed number must trace to a
//      pre-computed fact) before it is stored or served.
//   6. LLM output is never executed server-side. It is stored as a string
//      and rendered client-side inside a sandboxed iframe.
//   7. Hard bounds: MAX_STEPS turn limit, MAX_TOOL_CALLS total tool budget,
//      and a wall-clock deadline. An agent cannot loop indefinitely.

import { verifySession } from '../lib/session.js';
import { getToolSchemas, executeTool } from '../tools/registry.js';
import { sanitizeHtml } from '../lib/html-sanitizer.js';
import { verifyFacts } from '../lib/fact-verifier.js';
import { EDITORIAL_DARK_BRIEF } from '../briefs/editorial-dark.js';
import { createJob, updateJob, JOB_STATUS } from '../lib/job-store.js';

if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = function timeout(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return controller.signal;
  };
}

const AI_GATEWAY_URL = 'https://ai-gateway.edgeone.link/v1/chat/completions';
const AI_GATEWAY_MODEL = '@makers/deepseek-v4-flash';

// Hard bounds. An agent that misbehaves burns budget, not the platform.
//
// Calibrated against a real end-to-end run (2026-08-13): the planning turn
// completed in ~8s and returned 3 tool calls; the compose turn took 211s
// and emitted 34,927 completion tokens for a 17KB document. The original
// 60s compose budget aborted every single run. Values below give the
// compose turn real headroom while keeping a hard ceiling.
//
// MAX_TOOL_CALLS is 4 rather than 6 because the observed planner reliably
// asks for 3 in its first turn, and each extra tool inflates the compose
// prompt (and therefore compose latency) more than it improves the report.
const MAX_STEPS = 3; // LLM planning turns (each turn = one gateway call)
const MAX_TOOL_CALLS = 4; // total tool executions across all turns
const WALL_CLOCK_MS = 330_000; // overall deadline for the loop
const PLAN_TIMEOUT_MS = 45_000; // per-turn timeout while planning
const COMPOSE_TIMEOUT_MS = 270_000; // the compose turn is the expensive one


function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// The agent's planning-phase system prompt. Deliberately does NOT include
// the design brief — that is injected only for the final compose turn, so
// the (large) brief is not re-sent on every planning turn.
function buildPlannerPrompt() {
  return [
    'You are a CDN data analyst agent. Your job is to investigate a user question about their EdgeOne (CDN) zone by calling the available tools, then produce a written report.',
    '',
    'Process:',
    '1. Read the user question.',
    '2. Call the tools you need to answer it. Prefer 2-4 tool calls — enough to build a real narrative, not so many that the report becomes a data dump.',
    '3. When you have enough material, stop calling tools and reply with the final HTML report.',
    '',
    'Guidance on tool selection:',
    '- Start with teo_zone_info if the report would benefit from zone context in its header.',
    '- Use teo_traffic_timing for a detailed hourly view of one metric.',
    '- Use teo_traffic_summary for a multi-day trend at daily granularity.',
    '- Use teo_traffic_multi when the question implies comparing or correlating 2-4 metrics.',
    '- Use teo_security_ddos for any attack, threat, or security question.',
    '- Do not call the same tool twice with identical arguments.',
    '',
    'Every tool returns a FACTS object containing pre-computed numbers (total, min, max, avg, median), a trend label, an anomaly record if one exists, and a time-series point list. You must use those numbers verbatim in your report. Never compute a new number, never invent a percentage.',
    '',
    'If a tool returns ok:false, that data is simply unavailable — work with what you have, or try a different tool. Do not retry the same failing call more than once.',
  ].join('\n');
}

// The compose-phase system prompt. Injects the design brief plus every
// fact the tools collected. This is the only turn that produces HTML.
function buildComposerPrompt(collected) {
  return [
    EDITORIAL_DARK_BRIEF,
    '',
    '================ COLLECTED DATA ================',
    'Every number below is pre-approved. Use these verbatim. Do NOT compute new values.',
    '',
    JSON.stringify(
      collected.map((entry) => ({
        tool: entry.tool,
        args: entry.args,
        data: entry.data,
      })),
      null,
      1,
    ),
    '',
    '================ YOUR TASK ================',
    'Compose the complete HTML report now. Follow the design brief exactly. Return ONLY the HTML document starting with <!DOCTYPE html>.',
  ].join('\n');
}

async function callGateway(env, messages, tools, timeoutMs) {
  const requestBody = {
    model: AI_GATEWAY_MODEL,
    messages,
  };
  if (tools) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }

  const res = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.MAKERS_MODELS_KEY}`,
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const body = await res.json();
  const choice = body?.choices?.[0];
  if (!choice) throw new Error('no choice in gateway response');
  return choice.message || {};
}

// Collect every facts object the tools produced, for fact-verifier.
// Handles both single-metric tools ({ facts }) and the multi tool
// ({ series: [{ facts }] }).
function collectFactsList(collected) {
  const list = [];
  for (const entry of collected) {
    const d = entry.data;
    if (!d) continue;
    if (d.facts) list.push(d.facts);
    if (Array.isArray(d.series)) {
      for (const s of d.series) {
        if (s && s.facts) list.push(s.facts);
      }
    }
  }
  return list;
}

// Strip the internal _numberAllowlist Set before the data goes into LLM
// context — a Set does not survive JSON.stringify anyway, but being
// explicit keeps the prompt payload small and predictable.
function stripAllowlist(data) {
  if (!data || typeof data !== 'object') return data;
  const clone = JSON.parse(
    JSON.stringify(data, (key, value) => (key === '_numberAllowlist' ? undefined : value)),
  );
  return clone;
}

// The orchestrator loop. Returns { html } on success, throws on failure.
async function runAgentLoop(userPrompt, tenantId, jobId, env) {
  const deadline = Date.now() + WALL_CLOCK_MS;
  const tools = getToolSchemas();
  const collected = [];
  const toolsUsed = [];
  let toolCallCount = 0;

  const messages = [
    { role: 'system', content: buildPlannerPrompt() },
    { role: 'user', content: userPrompt },
  ];

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    if (Date.now() > deadline) throw new Error('wall_clock_exceeded');

    await updateJob(tenantId, jobId, {
      step,
      maxSteps: MAX_STEPS,
      note: step === 1 ? 'Planning the investigation' : 'Reviewing results, deciding next step',
      toolsUsed,
    });

    const message = await callGateway(env, messages, tools, PLAN_TIMEOUT_MS);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (toolCalls.length === 0) {
      // The agent is done gathering. Break out and compose.
      break;
    }

    // Record the assistant's tool-call turn so the conversation stays
    // well-formed for the next gateway call.
    messages.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      if (toolCallCount >= MAX_TOOL_CALLS) break;
      if (Date.now() > deadline) throw new Error('wall_clock_exceeded');
      toolCallCount += 1;

      const fnName = call?.function?.name;
      let fnArgs = {};
      try {
        fnArgs = JSON.parse(call?.function?.arguments || '{}');
      } catch {
        fnArgs = {};
      }

      await updateJob(tenantId, jobId, {
        step,
        maxSteps: MAX_STEPS,
        note: `Querying ${typeof fnName === 'string' ? fnName.replace(/^teo_/, '').replace(/_/g, ' ') : 'data'}`,
        toolsUsed,
      });

      // executeTool applies the closed-vocabulary + closed-enum checks.
      const result = await executeTool(fnName, fnArgs, tenantId, env);

      if (result && result.ok) {
        const safeData = stripAllowlist(result.data);
        collected.push({ tool: fnName, args: fnArgs, data: result.data });
        if (typeof fnName === 'string' && !toolsUsed.includes(fnName)) toolsUsed.push(fnName);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: true, data: safeData }),
        });
      } else {
        // Generic failure into LLM context — never a reason string that
        // could carry upstream detail.
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false }),
        });
      }
    }

    if (toolCallCount >= MAX_TOOL_CALLS) break;
  }

  if (collected.length === 0) throw new Error('no_data_collected');

  await updateJob(tenantId, jobId, {
    step: MAX_STEPS,
    maxSteps: MAX_STEPS,
    note: 'Composing the report',
    toolsUsed,
  });

  // Compose turn. No tools offered — the agent must return HTML.
  const composeMessages = [
    { role: 'system', content: buildComposerPrompt(collected) },
    { role: 'user', content: userPrompt },
  ];

  const composed = await callGateway(env, composeMessages, null, COMPOSE_TIMEOUT_MS);
  let html = typeof composed.content === 'string' ? composed.content : '';
  html = html
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/, '');

  const sanitized = sanitizeHtml(html);
  if (!sanitized.ok) throw new Error('sanitize_failed');

  const factsList = collectFactsList(collected);
  const verified = verifyFacts(sanitized.html, factsList);
  if (!verified.ok) throw new Error('fact_verify_failed');

  return { html: sanitized.html, toolsUsed };
}

export async function onRequestPost({ request, env }) {
  const cookies = new Cookies(request.headers.get('Cookie'));
  const sessionCookie = cookies.get('session');
  const payload = sessionCookie ? await verifySession(sessionCookie.value, env) : null;

  if (!payload) return jsonResponse({ error: 'unauthorized' }, 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    return jsonResponse({ error: 'agent_failed' });
  }

  const userPrompt = body.prompt.trim().slice(0, 2000);
  const tenantId = payload.tenant_id;

  const jobId = await createJob(tenantId, userPrompt, env);
  if (!jobId) return jsonResponse({ error: 'agent_failed' });

  // Run the loop, then finalize the job record. EdgeOne edge functions do
  // not expose a durable waitUntil for work that outlives the response, so
  // we await the loop here and return the terminal state alongside the
  // jobId. The client still polls: it gets the finished record on its very
  // first poll, which keeps one code path for both fast and slow runs and
  // means a client-side timeout/reload can still recover the result.
  try {
    const { html, toolsUsed } = await runAgentLoop(userPrompt, tenantId, jobId, env);
    await updateJob(tenantId, jobId, {
      status: JOB_STATUS.DONE,
      note: 'Report ready',
      html,
      toolsUsed,
      finishedAt: Date.now(),
    });
  } catch {
    // Single generic failure state. No reason string reaches the client
    // (D-08) — the note is deliberately user-facing and non-diagnostic.
    await updateJob(tenantId, jobId, {
      status: JOB_STATUS.FAILED,
      note: 'Could not complete the analysis',
      finishedAt: Date.now(),
    });
  }

  return jsonResponse({ jobId });
}
