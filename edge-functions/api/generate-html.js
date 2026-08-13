// POST /api/generate-html
//
// Phase 5 (HTML-agent pipeline): the LLM writes a complete HTML dashboard
// document, tailored to the user's prompt and the pre-computed facts
// about their data. Result is rendered client-side inside a sandboxed
// iframe with a strict CSP — the LLM's HTML never touches the parent
// page's cookies, storage, or DOM.
//
// Security invariants (all preserved from the JSON pipeline):
//   1. verifySession() is the first branch. 401 before anything else.
//   2. tenant_id / zoneId come exclusively from the verified session.
//   3. account.secretId / account.secretKey never appear in any response.
//   4. Response.Error from teo is never forwarded (03-RESEARCH.md P5).
//   5. All failure branches return the same generic { error: 'html_generation_failed' }.
//
// New invariants specific to this pipeline:
//   6. LLM output goes through sanitizeHtml() before storage or return.
//      Any hit on the blocklist rejects the whole document.
//   7. LLM output goes through verifyFacts() — every visible number must
//      match a pre-computed fact within 0.5% tolerance. Hallucinated
//      numbers reject the response.
//   8. The dataSource → teo Action mapping is still the closed ACTION_BY_SOURCE
//      table — LLM never picks the teo API call.
//   9. The rendered HTML runs in an iframe with sandbox="allow-scripts"
//      (deliberately without allow-same-origin) — cross-origin isolation.

import { verifySession } from '../lib/session.js';
import { getTenantAccount } from '../lib/tenant-mapping.js';
import { signTeoRequest, toTeoRfc3339 } from '../lib/teo-signer.js';
import { METRICS_BY_SOURCE, METRIC_LABELS } from '../lib/generation-schema.js';
import { ACTION_BY_SOURCE } from '../lib/metric-lookup.js';
import { computeFacts } from '../lib/data-facts.js';
import { sanitizeHtml } from '../lib/html-sanitizer.js';
import { verifyFacts } from '../lib/fact-verifier.js';

if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = function timeout(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return controller.signal;
  };
}

const AI_GATEWAY_URL = 'https://ai-gateway.edgeone.link/v1/chat/completions';
const AI_GATEWAY_MODEL = '@makers/deepseek-v4-flash';

// Single generic failure response. No distinguishing signal between:
//   - session missing / invalid
//   - tenant not connected
//   - teo API failure
//   - LLM call failure
//   - LLM output failed sanitization
//   - LLM output failed fact verification
// (Session missing is still a 401 status; every other failure is 200 +
// this body, matching the existing generate.js convention.)
function htmlGenerationFailed() {
  return new Response(JSON.stringify({ error: 'html_generation_failed' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildSystemPrompt(userPrompt, facts, meta) {
  return [
    'You are a data visualization designer. You produce ONE complete, self-contained HTML5 document that renders a beautiful, insight-rich dashboard for the user.',
    '',
    '== Absolute rules (any violation = your response is rejected) ==',
    '1. Return ONLY the HTML document. No markdown fences. No commentary. Start with <!DOCTYPE html>.',
    '2. NO <form>, <input>, <button>, <iframe>, <object>, <embed>, <link>, <meta>, <audio>, <video>. The dashboard is read-only display.',
    '3. NO on* event handlers. NO javascript: URIs. NO eval, Function, setTimeout, setInterval, XMLHttpRequest, WebSocket, fetch, postMessage, localStorage, sessionStorage, document.cookie, parent.*, top.*, opener.',
    '4. Scripts may ONLY load from https://cdn.jsdelivr.net (specifically Chart.js). All other <script src=""> is forbidden.',
    '5. Every visible number in your output MUST come from the FACTS block below. Do NOT compute new numbers. Do NOT round differently. Do NOT invent totals or averages the FACTS block did not provide.',
    '6. If FACTS.trend is "up", say things like "trending upward" — do not invent a percentage.',
    '7. Use inline <style> — no external stylesheets.',
    '',
    '== Design guidelines (make it beautiful) ==',
    '- Modern, clean, editorial. Generous whitespace. Rounded corners (12-20px).',
    '- Palette: neutral background (#f8fafc or #ffffff), primary accent #378ADD, text #0f172a, muted text #64748b.',
    "- Typography: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif.",
    '- Hero metric (largest number) at the top. Supporting charts below. Insight sentence beside each chart.',
    '- Use Chart.js 4.5.1 from https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',
    '- Charts: subtle grid, no legend when only one series, correct axis labels, right y-axis unit.',
    '- End the body with a small footer: "Snapshot as of {FACTS.metadata.lastTimestamp}" in muted text.',
    '',
    '== User prompt ==',
    userPrompt,
    '',
    '== Metric ==',
    JSON.stringify({
      metric: meta.metric,
      label: meta.label,
      unit: meta.unit,
      interval: meta.interval,
      timeRange: meta.timeRange,
    }),
    '',
    '== FACTS (the ONLY numeric values you may use, other than small structural integers 0-100) ==',
    JSON.stringify(facts.numbers, null, 2),
    '',
    '== TREND ==',
    facts.trend,
    '',
    '== ANOMALY (or null if none) ==',
    JSON.stringify(facts.anomaly),
    '',
    '== TIME SERIES for charts (each `raw` value is pre-approved; use `formatted` for display, `ts_local` for x-axis labels) ==',
    JSON.stringify(facts.points),
  ].join('\n');
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
    signal: AbortSignal.timeout(45_000), // HTML generation is slower than JSON
  });

  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('missing message content');

  // Strip markdown fences if the model wrapped its HTML.
  return content
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/, '');
}

export async function onRequestPost({ request, env }) {
  const cookies = new Cookies(request.headers.get('Cookie'));
  const sessionCookie = cookies.get('session');
  const payload = sessionCookie ? await verifySession(sessionCookie.value, env) : null;

  if (!payload) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.dataSource !== 'string' ||
    typeof body.prompt !== 'string' ||
    typeof body.metric !== 'string'
  ) {
    return htmlGenerationFailed();
  }

  const { dataSource, prompt, metric } = body;
  const interval = typeof body.interval === 'string' ? body.interval : 'hour';
  const timeRange = typeof body.timeRange === 'string' ? body.timeRange : 'last24h';

  // Data source must be in the closed vocabulary.
  if (!ACTION_BY_SOURCE[dataSource] || !METRICS_BY_SOURCE[dataSource]) {
    return htmlGenerationFailed();
  }
  // Metric must be in the closed enum for this source.
  if (!METRICS_BY_SOURCE[dataSource].includes(metric)) {
    return htmlGenerationFailed();
  }
  if (!['hour', 'day'].includes(interval)) return htmlGenerationFailed();
  if (!['last24h', 'last7d', 'last30d'].includes(timeRange)) return htmlGenerationFailed();

  const account = await getTenantAccount(payload.tenant_id, env);
  if (!account) return htmlGenerationFailed();

  // Compute the time window.
  const endTime = new Date();
  const rangeMs = {
    last24h: 24 * 60 * 60 * 1000,
    last7d: 7 * 24 * 60 * 60 * 1000,
    last30d: 30 * 24 * 60 * 60 * 1000,
  }[timeRange];
  const startTime = new Date(endTime.getTime() - rangeMs);

  const { action, version } = ACTION_BY_SOURCE[dataSource];
  const { url, headers, body: signedBody } = await signTeoRequest({
    secretId: account.secretId,
    secretKey: account.secretKey,
    action,
    version,
    payload: {
      StartTime: toTeoRfc3339(startTime),
      EndTime: toTeoRfc3339(endTime),
      MetricNames: [metric],
      Interval: interval,
      ZoneIds: [account.zoneId],
    },
    domain: env.TEO_API_DOMAIN,
  });

  let teoResponse;
  try {
    const res = await fetch(url, { method: 'POST', headers, body: signedBody });
    teoResponse = await res.json();
  } catch {
    return htmlGenerationFailed();
  }
  if (teoResponse?.Response?.Error) {
    return htmlGenerationFailed();
  }

  const facts = computeFacts(teoResponse?.Response?.Data, metric, interval, timeRange);
  if (!facts) return htmlGenerationFailed();

  const meta = {
    metric,
    label: METRIC_LABELS[metric]?.label || metric,
    unit: METRIC_LABELS[metric]?.unit || '',
    interval,
    timeRange,
  };

  const systemPrompt = buildSystemPrompt(prompt, facts, meta);

  let rawHtml;
  try {
    rawHtml = await callAiGateway(env, systemPrompt, prompt);
  } catch {
    // One retry with a stricter correction message.
    try {
      rawHtml = await callAiGateway(
        env,
        systemPrompt +
          '\n\nYour previous response was invalid. Return ONLY the raw HTML document, starting with <!DOCTYPE html>, with no other text.',
        prompt,
      );
    } catch {
      return htmlGenerationFailed();
    }
  }

  const sanitized = sanitizeHtml(rawHtml);
  if (!sanitized.ok) {
    return htmlGenerationFailed();
  }

  const verified = verifyFacts(sanitized.html, [facts]);
  if (!verified.ok) {
    return htmlGenerationFailed();
  }

  // Return the HTML string. The client embeds it in an iframe srcdoc
  // with sandbox="allow-scripts" and a strict CSP — that isolation
  // happens client-side, so the HTML itself remains a plain string
  // in this response.
  return new Response(
    JSON.stringify({ html: sanitized.html, generatedAt: Date.now() }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
