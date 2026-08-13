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

// METRIC_LABELS: display-only lookup (metric code -> { label, unit, format })
// for every value in METRICS_BY_SOURCE (04.1-UI-SPEC.md's Metric Label and
// Unit Contract). Same "flat object, code string -> fixed metadata object,
// never LLM-writable" shape as ACTION_BY_SOURCE (metric-lookup.js) — this is
// the third instance of that pattern in this codebase. `format` selects one
// of the Numeric Formatting Rules implemented client-side by app.js's
// formatMetricValue(). This fixes 04.1-CONTEXT.md's D-01 root cause: the
// absence of any human-readable label/unit lookup, which previously forced
// widgetCardShell()'s title fallback to show the raw teo metric code.
//
// app.js maintains its own client-side copy of this exact object (it has no
// module system and cannot import from edge-functions/) — keep both in sync
// by hand if this table ever changes.
export const METRIC_LABELS = {
  'l7Flow_outFlux': { label: 'Outbound Traffic', unit: 'Bytes', format: 'bytes-binary' },
  'l7Flow_inFlux': { label: 'Inbound Traffic', unit: 'Bytes', format: 'bytes-binary' },
  'l7Flow_flux': { label: 'Total Traffic', unit: 'Bytes', format: 'bytes-binary' },
  'l7Flow_outBandwidth': { label: 'Outbound Bandwidth', unit: 'bps', format: 'bandwidth-decimal' },
  'l7Flow_inBandwidth': { label: 'Inbound Bandwidth', unit: 'bps', format: 'bandwidth-decimal' },
  'l7Flow_bandwidth': { label: 'Total Bandwidth', unit: 'bps', format: 'bandwidth-decimal' },
  'l7Flow_request': { label: 'Request Count', unit: 'requests', format: 'integer-grouped' },
  'l7Flow_avgResponseTime': { label: 'Avg Response Time', unit: 'ms', format: 'ms-rounded' },
  'l7Flow_avgFirstByteResponseTime': {
    label: 'Avg First-Byte Time',
    unit: 'ms',
    format: 'ms-rounded',
  },
  'l7Flow_requestRate': { label: 'Request Rate', unit: 'req per s', format: 'rate-1dp' },
  'ddos_attackMaxBandwidth': {
    label: 'Peak Attack Bandwidth',
    unit: 'bps',
    format: 'bandwidth-decimal',
  },
  'ddos_attackMaxPackageRate': {
    label: 'Peak Attack Packet Rate',
    unit: 'pps',
    format: 'integer-grouped',
  },
  'ddos_attackBandwidth': { label: 'Attack Bandwidth', unit: 'bps', format: 'bandwidth-decimal' },
  'ddos_attackPackageRate': {
    label: 'Attack Packet Rate',
    unit: 'pps',
    format: 'integer-grouped',
  },
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

// validateDashboardTitle(raw) -> capped string, or null.
//
// Mirrors validateWidget's title field treatment (free-text, capped at 120
// chars, never used to construct a query or executed) but returns null
// instead of an empty string when raw is not a usable value (undefined,
// not a string, or empty after trimming) — matching this file's
// return-null-never-throw discipline (D-03 step 3). dashboardTitle is
// dashboard-level, not per-widget, so it is validated once here,
// independent of the per-widget validateWidget() loop (04.1-CONTEXT.md
// D-05). The caller (generate.js/app.js) decides the fallback display text
// ("Your Dashboard" per 04.1-UI-SPEC.md's Copywriting Contract) rather than
// this function inventing one.
export function validateDashboardTitle(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 120);
}
