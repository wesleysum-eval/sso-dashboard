// POST /api/generate
//
// Session-gated route proving the full "prompt -> validated widgets -> real
// teo data" pipeline end-to-end (Phase 4 tracer, GEN-01/02/03): verify
// session -> call EdgeOne Makers' AI Gateway -> parse/retry-once ->
// per-widget closed-enum validation (generation-schema.js) -> per-widget
// real, signed teo API fetch (reusing Phase 3's tenant-mapping.js/
// teo-signer.js unchanged) -> assembled generic response.
//
// T-04-01 (critical, mitigate): every candidate widget the LLM proposes
// must pass validateWidget() before its componentType/metric/interval/
// timeRange is used for anything; Action/Version always come from
// metric-lookup.js's server-owned constant table, never the LLM's raw
// string and never a client-supplied value.
//
// T-04-02 (high, mitigate): every failure branch — LLM call failure,
// malformed JSON after one retry, zero valid widgets, per-widget teo
// failure — returns the same generic generationFailed() shape. This file
// never includes account.secretId/secretKey, env.MAKERS_MODELS_KEY, raw
// LLM error text, or teoResponse.Response.Error in any response it
// produces, at any branch.
//
// T-04-03 (high, mitigate): verifySession() is called first, before the
// LLM call, KV read, or teo call — a missing/invalid session returns 401
// immediately.
//
// T-04-04 (critical, mitigate): the LLM's response is always treated as
// pure data (JSON), never code — no eval, new Function(), or dynamic
// import() of any part of it anywhere in this file.
import { verifySession } from '../lib/session.js';
import { getTenantAccount } from '../lib/tenant-mapping.js';
import { signTeoRequest, toTeoRfc3339 } from '../lib/teo-signer.js';
import {
  COMPONENT_TYPES,
  INTERVALS,
  TIME_RANGES,
  METRICS_BY_SOURCE,
  validateWidget,
  validateDashboardTitle,
} from '../lib/generation-schema.js';
import { ACTION_BY_SOURCE } from '../lib/metric-lookup.js';

// EdgeOne's Edge Function runtime does not implement the standard
// `AbortSignal.timeout(ms)` static method (04-RESEARCH.md Pitfall 1, first
// diagnosed in oidc-config.js). That polyfill is a module-load-time side
// effect scoped to whatever module graph actually imports oidc-config.js —
// this route does not import it, so a cold instance that never touched the
// OIDC flow would NOT inherit the patch. Re-declare the exact same guarded
// snippet here rather than assuming it's already active.
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = function timeout(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return controller.signal;
  };
}

const AI_GATEWAY_URL = 'https://ai-gateway.edgeone.link/v1/chat/completions';
const AI_GATEWAY_MODEL = '@makers/deepseek-v4-flash';

// D-08: every failure branch in this file returns this exact generic shape
// — never the raw LLM error, never a teo Response.Error, never any secret.
function generationFailed() {
  return new Response(JSON.stringify({ error: 'generation_failed' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildSystemPrompt(dataSource, previousSpec) {
  const metrics = METRICS_BY_SOURCE[dataSource] || [];

  const lines = [
    'You generate dashboard widget specifications as JSON only.',
    'You must return ONLY a JSON object shaped { "dashboardTitle": string, "widgets": [...] } — no markdown code fences, no explanation text, nothing before or after the object.',
    'Each widget object in the widgets array must have exactly these fields: componentType, metric, interval, timeRange, title.',
    `componentType must be one of: ${COMPONENT_TYPES.join(', ')}.`,
    `metric must be one of: ${metrics.join(', ')}.`,
    `interval must be one of: ${INTERVALS.join(', ')}.`,
    `timeRange must be one of: ${TIME_RANGES.join(', ')}.`,
    'title is a short, free-text, human-readable label for the widget (not used for anything else).',
    'dashboardTitle is a short, free-text, human-readable title for the whole dashboard (not used for anything else).',
    'Never use any value outside these exact lists — any other value will be silently rejected.',
    'Return between 1 and 4 widgets that best answer the user prompt.',
  ];

  if (previousSpec) {
    lines.push(
      'The user is refining a previous dashboard. Here is the previous widget specification as context (JSON):',
      JSON.stringify(previousSpec),
      'Adjust it according to the new prompt below rather than starting from nothing, unless the new prompt clearly asks for something unrelated.',
    );
  }

  return lines.join('\n');
}

async function callAiGateway(env, systemPrompt, userPrompt) {
  const res = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.MAKERS_MODELS_KEY}`,
    },
    body: JSON.stringify({
      model: AI_GATEWAY_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });

  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('missing message content');

  // Strip markdown code fences defensively, in case the model wraps its
  // JSON in ```json ... ``` despite the system prompt's instruction not to
  // — this is normalization of the model's own formatting, not "rescuing"
  // malformed JSON structure (04-RESEARCH.md Don't Hand-Roll).
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  return JSON.parse(trimmed);
}

function computeTimeRangeWindow(timeRange) {
  const endTime = new Date();
  const rangeMs = {
    last24h: 24 * 60 * 60 * 1000,
    last7d: 7 * 24 * 60 * 60 * 1000,
    last30d: 30 * 24 * 60 * 60 * 1000,
  }[timeRange];
  const startTime = new Date(endTime.getTime() - rangeMs);
  return { startTime, endTime };
}

export async function onRequestPost({ request, env }) {
  const cookies = new Cookies(request.headers.get('Cookie'));
  const sessionCookie = cookies.get('session');
  const payload = sessionCookie ? await verifySession(sessionCookie.value, env) : null;

  // 401 before touching the LLM, KV, or any outbound call — same
  // "verifySession is the very first branch" rule as every other route.
  if (!payload) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.dataSource !== 'string' || typeof body.prompt !== 'string') {
    return generationFailed();
  }

  const { dataSource, prompt, previousSpec } = body;
  if (!METRICS_BY_SOURCE[dataSource]) {
    // Unknown data source — never in the closed vocabulary, generic failure.
    return generationFailed();
  }

  const systemPrompt = buildSystemPrompt(dataSource, previousSpec);

  let candidates;
  try {
    candidates = await callAiGateway(env, systemPrompt, prompt);
  } catch {
    // Malformed JSON, missing content, network/timeout failure, or any
    // other parse/fetch error — retry once with an explicit correction
    // message before falling through to the generic failure response
    // (D-03 step 4).
    try {
      candidates = await callAiGateway(
        env,
        `${systemPrompt}\nYour previous response was not valid JSON matching the schema. Return ONLY the JSON object with dashboardTitle and widgets fields, nothing else.`,
        prompt,
      );
    } catch {
      return generationFailed();
    }
  }

  // 04.1-01 (D-05): the LLM's top-level response is now a { dashboardTitle,
  // widgets } object, not a bare array. If the parsed JSON isn't an object
  // or its widgets field isn't an array, treat this identically to the
  // existing "not an Array" failure branch — same generic failure, no new
  // error shape.
  if (!candidates || typeof candidates !== 'object' || !Array.isArray(candidates.widgets)) {
    return generationFailed();
  }

  // dashboardTitle is dashboard-level, not per-widget — validated once,
  // independent of the per-widget validation loop below. A missing/invalid
  // dashboardTitle never triggers generationFailed() on its own (D-08).
  const dashboardTitle = validateDashboardTitle(candidates.dashboardTitle);

  // Pitfall 2: partial success, not all-or-nothing — filter out invalid
  // widgets individually; only fail the whole request if NOTHING survives
  // filtering.
  const validWidgets = candidates.widgets
    .map((candidate) => validateWidget(candidate, dataSource))
    .filter((widget) => widget !== null);

  if (validWidgets.length === 0) {
    return generationFailed();
  }

  const account = await getTenantAccount(payload.tenant_id, env);
  if (!account) {
    // No tenant mapping — generic failure, never a distinct error (D-08).
    return generationFailed();
  }

  const { action, version } = ACTION_BY_SOURCE[dataSource];

  const widgets = [];
  for (const widget of validWidgets) {
    const { startTime, endTime } = computeTimeRangeWindow(widget.timeRange);

    const { url, headers, body: signedBody } = await signTeoRequest({
      secretId: account.secretId,
      secretKey: account.secretKey,
      action,
      version,
      payload: {
        StartTime: toTeoRfc3339(startTime),
        EndTime: toTeoRfc3339(endTime),
        MetricNames: [widget.metric],
        Interval: widget.interval,
        ZoneIds: [account.zoneId], // D-03: server-resolved only, never LLM/client-supplied
      },
      domain: env.TEO_API_DOMAIN,
    });

    let teoResponse;
    try {
      const res = await fetch(url, { method: 'POST', headers, body: signedBody });
      teoResponse = await res.json();
    } catch {
      // Pitfall 6: per-widget failure, not per-request — omit this widget,
      // keep siblings.
      continue;
    }

    if (teoResponse?.Response?.Error) {
      // Never forward Response.Error — it can contain the ZoneId
      // (03-RESEARCH.md Pitfall 5, carried forward).
      continue;
    }

    widgets.push({
      componentType: widget.componentType,
      title: widget.title,
      metric: widget.metric,
      interval: widget.interval,
      timeRange: widget.timeRange,
      data: teoResponse?.Response?.Data,
    });
  }

  if (widgets.length === 0) {
    return generationFailed();
  }

  // dashboardTitle is included only when it validated successfully — never
  // send an empty string or a distinct error for a missing/invalid title
  // (D-08); the client falls back to "Your Dashboard" when the field is
  // absent.
  const responseBody = { widgets, prompt };
  if (dashboardTitle !== null) {
    responseBody.dashboardTitle = dashboardTitle;
  }

  return new Response(JSON.stringify(responseBody), {
    headers: { 'Content-Type': 'application/json' },
  });
}
