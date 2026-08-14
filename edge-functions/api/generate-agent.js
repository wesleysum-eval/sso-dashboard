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
import {
  assembleDocument,
  validateBodyContent,
  stripFence,
} from '../lib/document-assembler.js';
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

// Hard bounds, recalibrated for the EdgeOne Edge Functions runtime.
//
// The platform, not this code, is the binding constraint. EdgeOne Edge
// Functions are documented for lightweight work (200ms CPU budget); even the
// heavier Node Functions runtime caps a request at 120s. The first live run's
// compose turn took 211s and was killed by the platform at ~38s, which is why
// raising COMPOSE_TIMEOUT_MS from 60s to 270s changed nothing — the knob was
// not connected to the thing that was failing.
//
// Option A removes the cause instead of raising the limit: the stylesheet is
// injected server-side (document-assembler.js) so the model writes only body
// content, and COMPOSE_MAX_TOKENS puts a hard ceiling on how long it can run.
// Target compose is 30-45s, comfortably inside the platform budget.
const MAX_STEPS = 2; // LLM planning turns
const MAX_TOOL_CALLS = 3; // total tool executions; each one inflates the compose prompt
const WALL_CLOCK_MS = 100_000; // must stay well under the platform request cap
const PLAN_TIMEOUT_MS = 25_000;
const COMPOSE_TIMEOUT_MS = 55_000;
const COMPOSE_MAX_TOKENS = 7000; // physically bounds compose duration



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

// The compose-phase system prompt. Injects the (now CSS-free) design brief
// plus every fact the tools collected. This is the only turn that produces
// markup, and it produces BODY CONTENT ONLY — document-assembler.js supplies
// the doctype, head, stylesheet, and Chart.js defaults.
function buildComposerPrompt(collected) {
  return [
    EDITORIAL_DARK_BRIEF,
    '',
    '================ COLLECTED DATA ================',
    'Every number below is pre-approved. Use these verbatim. Do NOT compute new values.',
    'Use the `formatted` strings for anything a reader sees, and the `raw` values for chart data arrays.',
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
    'Write the body content now. Start with <div class="ribbon">. Exactly 3 sections. No <!DOCTYPE>, no <html>, no <head>, no <body>, no <style>, no <link>, no <meta>, no <script src>. No CSS.',
  ].join('\n');
}

async function callGateway(env, messages, tools, timeoutMs, maxTokens) {
  const requestBody = {
    model: AI_GATEWAY_MODEL,
    messages,
  };
  if (tools) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }
  // A hard token ceiling is the only reliable way to bound how long a
  // generation runs. Without it the compose turn ran to 34,927 tokens and
  // outlived every available request timeout.
  if (maxTokens) {
    requestBody.max_tokens = maxTokens;
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

  // Compose turn. No tools offered — the agent must return body content.
  const composeMessages = [
    { role: 'system', content: buildComposerPrompt(collected) },
    { role: 'user', content: userPrompt },
  ];

  const composed = await callGateway(
    env,
    composeMessages,
    null,
    COMPOSE_TIMEOUT_MS,
    COMPOSE_MAX_TOKENS,
  );

  // The model returns body content only. Validate that shape BEFORE assembly
  // so a model that ignored the instruction and emitted a whole document is
  // rejected while the cause is still obvious, rather than producing a
  // nested-document mess that only fails later in sanitizeHtml().
  const bodyCheck = validateBodyContent(stripFence(composed.content));
  if (!bodyCheck.ok) throw new Error('body_invalid_' + bodyCheck.reason);

  // Server-authored head + injected stylesheet + Chart.js defaults.
  const html = assembleDocument(bodyCheck.content, { title: 'Traffic Report' });

  // The assembled document still goes through the full sanitizer: the model's
  // inline <script> blocks (chart initialisation) have not been checked
  // against the forbidden-API list yet, and defence in depth is cheap.
  const sanitized = sanitizeHtml(html);
  if (!sanitized.ok) throw new Error('sanitize_failed_' + sanitized.reason);

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
