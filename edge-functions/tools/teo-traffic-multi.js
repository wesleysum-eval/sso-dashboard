// Tool: teo_traffic_multi — 2-4 L7 metrics fetched in ONE signed teo call.
//
// Same teo Action/Version as teo_traffic_timing
// (DescribeTimingL7AnalysisData, 2022-09-01), but exploiting the fact that
// MetricNames is an array parameter. One signed request instead of four keeps
// the agent's turn latency and outbound-call count bounded, which is why the
// array is hard-capped at 4 entries: an uncapped list would let the LLM turn a
// single tool call into an arbitrarily expensive fan-out.
//
// Security invariants (registry.js numbering):
//   1. `metrics` is validated element-by-element against
//      METRICS_BY_SOURCE['cdn-traffic'] before any element reaches the teo
//      payload, with length bounds (2-4) and a duplicate check. A single bad
//      element rejects the WHOLE call — invalid entries are never filtered out
//      and silently dropped, because a partially-honoured argument list is a
//      coercion, and this codebase's rule is fail-closed (validateWidget()).
//   2. ZoneIds and credentials come only from getTenantAccount(tenantId, env).
//   3. Neither secretId/secretKey nor Response.Error is ever returned.
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
const MIN_METRICS = 2;
const MAX_METRICS = 4;

// A multi-metric response carries one TypeValue/FloatTypeValue entry per
// requested metric. computeFacts() intentionally reads only the FIRST entry
// (it was written for single-metric fetches), so rather than reimplementing
// its extraction we narrow the response down to a synthetic single-metric
// shape per metric and hand each one to computeFacts() unchanged. Purely a
// reshape — no arithmetic happens here, so the fact-verifier's allowlist
// guarantee is unaffected.
function narrowToMetric(data, metric) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const matchesMetric = (entry) => entry && entry.Metric === metric;

  for (const record of data) {
    const typeValue = Array.isArray(record?.TypeValue)
      ? record.TypeValue.filter(matchesMetric)
      : [];
    const floatTypeValue = Array.isArray(record?.FloatTypeValue)
      ? record.FloatTypeValue.filter(matchesMetric)
      : [];
    if (typeValue.length > 0 || floatTypeValue.length > 0) {
      return [{ ...record, TypeValue: typeValue, FloatTypeValue: floatTypeValue }];
    }
  }

  return null;
}

export default {
  name: 'teo_traffic_multi',

  description:
    'Fetch between two and four layer-7 traffic metrics together in a single call, over the same time window and the same interval, so their series are directly comparable point for point. Use this tool whenever the question involves a relationship between metrics rather than one metric alone - for example comparing inbound against outbound traffic, checking whether response time worsened as request volume climbed, or building a dashboard that shows traffic and bandwidth side by side. Because every series shares one window and one interval, the returned points line up index for index and can be plotted on the same chart. It returns a series array with one entry per requested metric, each carrying that metric label, unit, and its own full facts object (total, min, max, average, median, trend, anomaly, points). Request at most four metrics; if you only need one, use teo_traffic_timing, and if you need a long daily trend for one metric, use teo_traffic_summary. Metrics with no data in the window are omitted from the series array, so check which entries came back before referring to them.',

  parameters: {
    type: 'object',
    properties: {
      metrics: {
        type: 'array',
        minItems: MIN_METRICS,
        maxItems: MAX_METRICS,
        uniqueItems: true,
        items: { type: 'string', enum: METRICS },
        description:
          'Two to four distinct layer-7 metrics to fetch together. No duplicates. Pick metrics that are meaningful to compare against each other.',
      },
      interval: {
        type: 'string',
        enum: INTERVALS,
        description: 'Aggregation granularity applied to every metric in this call.',
      },
      timeRange: {
        type: 'string',
        enum: TIME_RANGES,
        description: 'How far back the shared window extends from now.',
      },
    },
    required: ['metrics', 'interval', 'timeRange'],
    additionalProperties: false,
  },

  validateArgs(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const { metrics, interval, timeRange } = raw;
    if (!Array.isArray(metrics)) return null;
    if (metrics.length < MIN_METRICS || metrics.length > MAX_METRICS) return null;
    if (!metrics.every((metric) => METRICS.includes(metric))) return null;
    if (new Set(metrics).size !== metrics.length) return null; // duplicates would double-bill the same series
    if (!INTERVALS.includes(interval)) return null;
    if (!TIME_RANGES.includes(timeRange)) return null;

    return { metrics: [...metrics], interval, timeRange };
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
          MetricNames: args.metrics, // every element already enum-checked above
          Interval: args.interval,
          ZoneIds: [account.zoneId], // server-resolved only, never from LLM args
        },
        domain: env.TEO_API_DOMAIN,
      });

      const res = await fetch(url, { method: 'POST', headers, body });
      const teoResponse = await res.json();

      if (teoResponse?.Response?.Error) return { ok: false };

      const data = teoResponse?.Response?.Data;
      const series = [];
      for (const metric of args.metrics) {
        const facts = computeFacts(
          narrowToMetric(data, metric),
          metric,
          args.interval,
          args.timeRange,
        );
        if (!facts) continue; // metric absent from the response — omit rather than fabricate an empty series

        const meta = METRIC_LABELS[metric] || { label: metric, unit: '' };
        series.push({ metric, label: meta.label, unit: meta.unit, facts });
      }

      if (series.length === 0) return { ok: false };

      return {
        ok: true,
        data: { series, interval: args.interval, timeRange: args.timeRange },
      };
    } catch {
      return { ok: false };
    }
  },
};
