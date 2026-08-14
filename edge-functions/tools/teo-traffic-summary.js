// Tool: teo_traffic_summary — the long view of one L7 metric, always daily.
//
// Same teo Action/Version as teo_traffic_timing
// (DescribeTimingL7AnalysisData, 2022-09-01), deliberately exposed as a
// SEPARATE tool rather than as an interval argument on the timing tool: the
// agent LLM reliably picks a distinctly-named tool for "compare this week to
// last month" questions, whereas it under-uses a non-default enum value on a
// shared tool. The narrower surface is also safer — `interval` is not an LLM
// argument here at all, it is the hardcoded constant 'day'.
//
// Security invariants (registry.js numbering):
//   1. `timeRange` is checked against this tool's own closed two-value list
//      (last7d / last30d — last24h is meaningless at daily granularity).
//      `interval` is never read from `raw`; a stray interval property in the
//      LLM's arguments is an unexpected extra and is ignored, so it cannot
//      turn this tool into an hourly call.
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
const INTERVAL = 'day'; // fixed, not an LLM argument
const TIME_RANGES = ['last7d', 'last30d'];

export default {
  name: 'teo_traffic_summary',

  description:
    'Fetch one layer-7 traffic metric aggregated into DAILY totals across either the last 7 days or the last 30 days. This is the long-view companion to teo_traffic_timing: use it whenever the question is about a trend, a growth or decline pattern, a week-over-week or month-long comparison, a busiest-day question, or an executive summary covering more than a single day. Daily aggregation smooths out hourly noise, so the trend direction and any anomalous day stand out clearly. It returns the same facts object structure as teo_traffic_timing - total, min, max, average and median in both raw and formatted form, a trend direction, an anomaly record when one day stands out, and one time-stamped point per day. Interval is always daily for this tool, so do not ask for hourly data here; use teo_traffic_timing when you need intra-day detail, and teo_traffic_multi when you need several metrics side by side.',

  parameters: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        enum: METRICS,
        description:
          'The layer-7 metric to summarize. Flux metrics are byte totals, bandwidth metrics are bits per second, l7Flow_request is a request count, and the two Time metrics are milliseconds.',
      },
      timeRange: {
        type: 'string',
        enum: TIME_RANGES,
        description:
          'Length of the daily window: last7d gives 7 daily points, last30d gives 30.',
      },
    },
    required: ['metric', 'timeRange'],
    additionalProperties: false,
  },

  validateArgs(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const { metric, timeRange } = raw;
    if (!METRICS.includes(metric)) return null;
    if (!TIME_RANGES.includes(timeRange)) return null;

    // interval is supplied by this module, never by the caller.
    return { metric, interval: INTERVAL, timeRange };
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
          Interval: INTERVAL,
          ZoneIds: [account.zoneId], // server-resolved only, never from LLM args
        },
        domain: env.TEO_API_DOMAIN,
      });

      const res = await fetch(url, { method: 'POST', headers, body });
      const teoResponse = await res.json();

      if (teoResponse?.Response?.Error) return { ok: false };

      const facts = computeFacts(
        teoResponse?.Response?.Data,
        args.metric,
        INTERVAL,
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
          interval: INTERVAL,
          timeRange: args.timeRange,
          facts,
        },
      };
    } catch {
      return { ok: false };
    }
  },
};
