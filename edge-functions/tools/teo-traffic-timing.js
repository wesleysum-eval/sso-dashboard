// Tool: teo_traffic_timing — L7 traffic/request/latency time series.
//
// teo Action DescribeTimingL7AnalysisData, Version 2022-09-01. Action and
// Version are hardcoded constants in this file; the LLM never supplies them
// (metric-lookup.js's ACTION_BY_SOURCE discipline, applied per-tool).
//
// Security invariants (registry.js numbering):
//   1. `metric` is checked against METRICS_BY_SOURCE['cdn-traffic'] — the
//      verbatim teo MetricNames enum — and `interval`/`timeRange` against
//      their own closed lists. validateArgs() rebuilds a clean object, so
//      unexpected properties in the LLM's arguments are dropped, never
//      forwarded into the teo payload.
//   2. ZoneIds and credentials come only from getTenantAccount(tenantId, env).
//   3. Neither secretId/secretKey nor Response.Error ever appears in the
//      return value (03-RESEARCH.md Pitfall 5).
//   4. Every failure path returns { ok: false } — no throw, no reason string.
import { getTenantAccount } from '../lib/tenant-mapping.js';
import { signTeoRequest, toTeoRfc3339 } from '../lib/teo-signer.js';
import { METRICS_BY_SOURCE, METRIC_LABELS } from '../lib/generation-schema.js';
import { computeFacts } from '../lib/data-facts.js';
import { computeWindow } from './time-window.js';

const ACTION = 'DescribeTimingL7AnalysisData';
const VERSION = '2022-09-01';
const METRICS = METRICS_BY_SOURCE['cdn-traffic'];
const INTERVALS = ['hour', 'day'];
const TIME_RANGES = ['last24h', 'last7d', 'last30d'];

export default {
  name: 'teo_traffic_timing',

  description:
    'Fetch a single layer-7 CDN traffic, request-volume, or latency metric as a time series for this tenant EdgeOne zone. Use this tool for any question about how much traffic or bandwidth was served, how many requests arrived, or how fast responses were - for example outbound traffic over the last day, request count this week, or average response time. It returns a pre-computed facts object containing total, min, max, average and median values (both raw numbers and display-formatted strings), a trend direction of up, down or flat, an anomaly/spike record when one is detected, and the full list of time-stamped data points ready to chart. Choose the hour interval for a detailed intra-day view and day for a smoother multi-day view. Request exactly one metric here; if you need two or more metrics to compare or correlate, use teo_traffic_multi instead, and if you want a longer daily trend view use teo_traffic_summary. This tool covers traffic and performance only - for DDoS attack data use teo_security_ddos.',

  parameters: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        enum: METRICS,
        description:
          'The layer-7 metric to fetch. Flux metrics are byte totals, bandwidth metrics are bits per second, l7Flow_request is a request count, and the two Time metrics are milliseconds.',
      },
      interval: {
        type: 'string',
        enum: INTERVALS,
        description: 'Aggregation granularity of each data point.',
      },
      timeRange: {
        type: 'string',
        enum: TIME_RANGES,
        description: 'How far back the window extends from now.',
      },
    },
    required: ['metric', 'interval', 'timeRange'],
    additionalProperties: false,
  },

  // Pure, synchronous, fail-closed: any single bad field returns null. Never
  // coerce a near-miss and never substitute a default for an invalid value —
  // same contract as generation-schema.js's validateWidget().
  validateArgs(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const { metric, interval, timeRange } = raw;
    if (!METRICS.includes(metric)) return null;
    if (!INTERVALS.includes(interval)) return null;
    if (!TIME_RANGES.includes(timeRange)) return null;

    // Freshly constructed — anything else on `raw` is intentionally dropped.
    return { metric, interval, timeRange };
  },

  async execute(args, tenantId, env) {
    try {
      const account = await getTenantAccount(tenantId, env);
      if (!account) return { ok: false };

      const window = computeWindow(args.timeRange);
      if (!window) return { ok: false };
      const { startTime, endTime } = window;

      const { url, headers, body } = await signTeoRequest({
        secretId: account.secretId,
        secretKey: account.secretKey,
        action: ACTION,
        version: VERSION,
        payload: {
          StartTime: toTeoRfc3339(startTime),
          EndTime: toTeoRfc3339(endTime),
          MetricNames: [args.metric],
          Interval: args.interval,
          ZoneIds: [account.zoneId], // server-resolved only, never from LLM args
        },
        domain: env.TEO_API_DOMAIN,
      });

      const res = await fetch(url, { method: 'POST', headers, body });
      const teoResponse = await res.json();

      // Response.Error is deliberately inspected but never returned or
      // logged through this path — it can embed the ZoneId.
      if (teoResponse?.Response?.Error) return { ok: false };

      const facts = computeFacts(
        teoResponse?.Response?.Data,
        args.metric,
        args.interval,
        args.timeRange,
      );
      if (!facts) return { ok: false };

      const meta = METRIC_LABELS[args.metric] || { label: args.metric, unit: '' };
      return {
        ok: true,
        data: {
          metric: args.metric,
          label: meta.label,
          unit: meta.unit,
          interval: args.interval,
          timeRange: args.timeRange,
          facts,
        },
      };
    } catch {
      return { ok: false }; // network failure, malformed JSON, signing failure — all generic
    }
  },
};
