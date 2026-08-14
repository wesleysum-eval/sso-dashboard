// Tool: teo_security_ddos — DDoS attack bandwidth / packet-rate time series.
//
// teo Action DescribeDDoSAttackData, Version 2022-09-01. This Action/Version
// pair must never be interchanged with the L7 analysis pair even though both
// versions currently read '2022-09-01' (03-RESEARCH.md Pitfall 1) — hence a
// separate module with its own hardcoded constants and its own metric enum
// drawn from METRICS_BY_SOURCE['security-events'].
//
// Security invariants (registry.js numbering):
//   1. `metric` is checked against the closed security-events enum; a
//      cdn-traffic metric name is rejected here rather than silently sent to
//      the DDoS API. validateArgs() rebuilds a clean object, dropping extras.
//   2. ZoneIds and credentials come only from getTenantAccount(tenantId, env).
//   3. Neither secretId/secretKey nor Response.Error is ever returned.
//   4. Every failure path returns { ok: false } — no throw, no reason string.
import { getTenantAccount } from '../lib/tenant-mapping.js';
import { signTeoRequest, toTeoRfc3339 } from '../lib/teo-signer.js';
import { METRICS_BY_SOURCE, METRIC_LABELS } from '../lib/generation-schema.js';
import { computeFacts } from '../lib/data-facts.js';
import { computeWindow } from './time-window.js';

const ACTION = 'DescribeDDoSAttackData';
const VERSION = '2022-09-01';
const METRICS = METRICS_BY_SOURCE['security-events'];
const INTERVALS = ['hour', 'day'];
const TIME_RANGES = ['last24h', 'last7d', 'last30d'];

export default {
  name: 'teo_security_ddos',

  description:
    'Fetch DDoS attack telemetry for this tenant EdgeOne zone as a time series. Use this tool for any security question about attack volume - whether the zone was attacked, how large the attack was, when attack traffic peaked, or how attack bandwidth and packet rates changed over time. The two Max metrics report the peak observed in each interval and are the right choice for questions about the worst moment of an attack; the two non-Max metrics report the ongoing attack level and are better for shape-over-time questions. Bandwidth metrics are bits per second and packet-rate metrics are packets per second. It returns a pre-computed facts object with total, min, max, average and median values, a trend direction, an anomaly record when a spike is detected, and time-stamped points ready to chart. Note that a zone which was never attacked legitimately has no data, in which case this tool reports failure rather than returning zeroes. This tool covers attack data only - for normal traffic, request volume, or latency use teo_traffic_timing.',

  parameters: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        enum: METRICS,
        description:
          'The DDoS metric to fetch. Bandwidth metrics are bits per second; PackageRate metrics are packets per second. The Max variants report per-interval peaks.',
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

  validateArgs(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const { metric, interval, timeRange } = raw;
    if (!METRICS.includes(metric)) return null;
    if (!INTERVALS.includes(interval)) return null;
    if (!TIME_RANGES.includes(timeRange)) return null;

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

      if (teoResponse?.Response?.Error) return { ok: false };

      // computeFacts() handles the DescribeDDoSAttackData response shape
      // (Value[0].Detail) as well as the L7 shape — no separate extraction.
      const facts = computeFacts(
        teoResponse?.Response?.Data,
        args.metric,
        args.interval,
        args.timeRange,
      );
      if (!facts) return { ok: false }; // includes the common "no attacks in window" case

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
      return { ok: false };
    }
  },
};
