// Single source of truth for GEN-03's closed generation vocabulary (D-01/D-02,
// 04-CONTEXT.md). These exact enum arrays are used both to build the LLM
// system-prompt's schema description (edge-functions/api/generate.js) AND to
// validate its response here — never let the two use sites drift apart.
//
// COMPONENT_TYPES: the entire rendering vocabulary (D-01) — there is no
// fifth "custom"/"code" type, ever.
//
// METRICS_BY_SOURCE: the full, real `teo` MetricNames enum per data source,
// CITED against official Tencent Cloud docs (04-RESEARCH.md Standard
// Stack) — these values ARE the real teo values verbatim; post-validation,
// no further mapping is needed for `metric` itself (only Action/Version
// need the fixed lookup table in metric-lookup.js).
export const COMPONENT_TYPES = ['line-chart', 'bar-chart', 'stat-card', 'table'];
export const INTERVALS = ['hour', 'day'];
export const TIME_RANGES = ['last24h', 'last7d', 'last30d'];

export const METRICS_BY_SOURCE = {
  'cdn-traffic': [
    'l7Flow_outFlux',
    'l7Flow_inFlux',
    'l7Flow_flux',
    'l7Flow_outBandwidth',
    'l7Flow_inBandwidth',
    'l7Flow_bandwidth',
    'l7Flow_request',
    'l7Flow_avgResponseTime',
    'l7Flow_avgFirstByteResponseTime',
    'l7Flow_requestRate',
  ], // full DescribeTimingL7AnalysisData MetricNames enum, CITED cloud.tencent.com/document/product/1552/80648
  'security-events': [
    'ddos_attackMaxBandwidth',
    'ddos_attackMaxPackageRate',
    'ddos_attackBandwidth',
    'ddos_attackPackageRate',
  ], // full DescribeDDoSAttackData MetricNames enum, CITED cloud.tencent.com/document/product/1552/80660
};

// validateWidget(widget, dataSource) -> validated widget, or null.
//
// Fail-closed discipline (matches tenant-mapping.js's getTenantAccount()):
// check every field against its closed enum, return null on ANY single
// failure — never coerce, never "best guess" substitute, never throw
// (D-03 step 3). This is a pure function — no KV, no async.
//
// `title` is free-text, display-only, and never used to construct a query
// or executed (D-03) — capped at 120 chars per 04-UI-SPEC.md's long-text
// row; the client additionally ellipsis-truncates for display.
export function validateWidget(widget, dataSource) {
  if (!widget || typeof widget !== 'object') return null;

  const { componentType, metric, interval, timeRange, title } = widget;

  if (!COMPONENT_TYPES.includes(componentType)) return null;
  if (!METRICS_BY_SOURCE[dataSource] || !METRICS_BY_SOURCE[dataSource].includes(metric)) {
    return null;
  }
  if (!INTERVALS.includes(interval)) return null;
  if (!TIME_RANGES.includes(timeRange)) return null;

  return {
    componentType,
    metric,
    interval,
    timeRange,
    title: String(title || '').slice(0, 120),
  };
}
