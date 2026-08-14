// Pre-computed facts for the HTML-generating LLM (Phase 5).
//
// The LLM in generate-html.js has one job: compose a beautiful HTML
// dashboard from the FACTS supplied by this module. It must never
// perform arithmetic on the raw data array — every number that appears
// on screen should be a value this module has already computed, with a
// stable key it can reference.
//
// The fact-verifier (fact-verifier.js) enforces this: every numeric
// substring the LLM emits is cross-checked against the fact table
// produced here. Numbers not in the table are treated as hallucinations
// and the response is rejected.
//
// This module is a pure function of the incoming series — no fetch,
// no async, no side effects. Same discipline as generation-schema.js's
// validateWidget().

import { METRIC_LABELS } from './generation-schema.js';

// Extract a flat [{ label, value, ts }] series from teo's response shape.
// Mirrors app.js's extractSeries() but simpler — this runs on the edge
// and only handles the two shapes generate-html.js actually fetches.
function extractSeries(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];

  // DescribeTimingL7AnalysisData shape.
  const typeValues = [
    ...(Array.isArray(first?.TypeValue) ? first.TypeValue : []),
    ...(Array.isArray(first?.FloatTypeValue) ? first.FloatTypeValue : []),
  ];
  const detail = typeValues[0]?.Detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((point) => ({
        ts: Number(point.Timestamp ?? point.Time ?? point.time),
        value: Number(point.Value ?? point.value),
      }))
      .filter((p) => !Number.isNaN(p.value) && !Number.isNaN(p.ts));
  }

  // DescribeDDoSAttackData shape.
  const ddosDetail = Array.isArray(first?.Value) ? first.Value[0]?.Detail : undefined;
  if (Array.isArray(ddosDetail) && ddosDetail.length > 0) {
    return ddosDetail
      .map((point) => ({
        ts: Number(point.Timestamp ?? point.Time ?? point.time),
        value: Number(point.Value ?? point.value),
      }))
      .filter((p) => !Number.isNaN(p.value) && !Number.isNaN(p.ts));
  }

  return null;
}

// Human-readable value formatter — mirrors app.js's formatMetricValue().
// Kept in sync by hand (same duplication policy as METRIC_LABELS itself).
function formatValue(n, formatRule, unit) {
  const v = Number(n) || 0;
  if (formatRule === 'bytes-binary') {
    if (v < 1024) return `${v} B`;
    if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
    if (v < 1024 ** 4) return `${(v / 1024 ** 3).toFixed(1)} GB`;
    return `${(v / 1024 ** 4).toFixed(2)} TB`;
  }
  if (formatRule === 'bandwidth-decimal') {
    if (v < 1000) return `${v} bps`;
    if (v < 1e6) return `${(v / 1000).toFixed(1)} Kbps`;
    if (v < 1e9) return `${(v / 1e6).toFixed(1)} Mbps`;
    return `${(v / 1e9).toFixed(1)} Gbps`;
  }
  if (formatRule === 'integer-grouped') {
    return `${Math.round(v).toLocaleString('en-US')} ${unit}`;
  }
  if (formatRule === 'ms-rounded') return `${Math.round(v)} ${unit}`;
  if (formatRule === 'rate-1dp') return `${v.toFixed(1)} ${unit}`;
  return `${v} ${unit}`;
}

// Median + MAD-based robust outlier detection. Same algorithm as the
// client-side detectSpike() fixed in the 2026-08-13 patch; duplicated
// here so the fact table can include the anomaly without waiting on
// the client to compute it.
function detectAnomaly(values) {
  if (!Array.isArray(values) || values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];
  const max = Math.max(...values);

  if (mad > 0 && max > median + 3 * mad) {
    return { max, median, mad, multiplier: median > 0 ? +(max / median).toFixed(1) : 0 };
  }
  if (mad === 0 && median > 0 && max > median * 2) {
    return { max, median, mad: 0, multiplier: +(max / median).toFixed(1) };
  }
  return null;
}

// Trend: split into first-half / second-half, compare averages.
function detectTrend(values) {
  if (values.length < 2) return 'flat';
  const mid = Math.floor(values.length / 2);
  const firstAvg = values.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
  const secondAvg =
    values.slice(mid).reduce((s, v) => s + v, 0) / (values.length - mid);
  if (firstAvg === 0) return secondAvg === 0 ? 'flat' : 'up';
  const pct = (secondAvg - firstAvg) / firstAvg;
  if (pct > 0.05) return 'up';
  if (pct < -0.05) return 'down';
  return 'flat';
}

// computeFacts(teoData, metric, interval, timeRange) -> facts object.
// The keys of facts.numbers are the ONLY numeric values the LLM is
// allowed to render. Any other number in its output is rejected.
export function computeFacts(teoData, metric, interval, timeRange) {
  const series = extractSeries(teoData);
  if (!series || series.length === 0) return null;

  const meta = METRIC_LABELS[metric] || { label: metric, unit: '', format: 'integer-grouped' };
  const values = series.map((p) => p.value);
  const total = values.reduce((s, v) => s + v, 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = total / values.length;
  const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

  const trend = detectTrend(values);
  const anomaly = detectAnomaly(values);

  // Build a series-labeled point list the LLM can drop straight into a
  // Chart.js `data.datasets[0].data` array. Timestamps are ISO strings
  // so the LLM never needs to do date math.
  const points = series.map((p) => ({
    ts_iso: new Date(p.ts * 1000).toISOString(),
    ts_local: new Date(p.ts * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    raw: p.value,
    formatted: formatValue(p.value, meta.format, meta.unit),
  }));

  // The `numbers` set is the fact-verifier's allowlist. Every number
  // in the LLM's HTML output must match one of these (or be inside a
  // small tolerance around one). We include both raw and formatted
  // representations so the LLM can quote either form.
  const numberAllowlist = new Set();
  const addNumber = (n) => {
    if (typeof n === 'number' && Number.isFinite(n)) {
      numberAllowlist.add(String(Math.round(n)));
      numberAllowlist.add(String(+n.toFixed(1)));
      numberAllowlist.add(String(+n.toFixed(2)));
    }
  };

  // Live-run finding (2026-08-13): the first end-to-end agent run failed
  // verification on ["708.8", "36.4", "29.3", ...] — every one the MANTISSA
  // of a correctly formatted value ("708.8 MB" from a raw 743,242,342 bytes).
  // The allowlist held only raw values, so the verifier could not recognise
  // the very strings formatValue() produces.
  //
  // addFormatted() parses the leading number back out of a formatted string
  // and allowlists it. This is not a relaxation: the string was produced by
  // this module from an approved raw value, so its mantissa is by definition
  // an approved display form.
  const addFormatted = (formatted) => {
    if (typeof formatted !== 'string') return;
    const m = formatted.match(/-?\d+(?:\.\d+)?/);
    if (!m) return;
    numberAllowlist.add(m[0]);
    const asNum = Number(m[0]);
    if (Number.isFinite(asNum)) {
      numberAllowlist.add(String(Math.round(asNum)));
      numberAllowlist.add(String(+asNum.toFixed(1)));
      numberAllowlist.add(String(+asNum.toFixed(2)));
    }
  };

  addNumber(total);
  addNumber(min);
  addNumber(max);
  addNumber(avg);
  addNumber(median);
  values.forEach(addNumber);

  // Allowlist the formatted display form of every aggregate AND every
  // individual point, since the LLM renders `formatted` strings in tables
  // and tooltips, not the raw byte counts.
  addFormatted(formatValue(total, meta.format, meta.unit));
  addFormatted(formatValue(min, meta.format, meta.unit));
  addFormatted(formatValue(max, meta.format, meta.unit));
  addFormatted(formatValue(avg, meta.format, meta.unit));
  addFormatted(formatValue(median, meta.format, meta.unit));
  values.forEach((v) => addFormatted(formatValue(v, meta.format, meta.unit)));

  if (anomaly) {
    addNumber(anomaly.multiplier);
    addNumber(anomaly.median);
    addNumber(anomaly.mad);
    addFormatted(formatValue(anomaly.max, meta.format, meta.unit));
    addFormatted(formatValue(anomaly.median, meta.format, meta.unit));
  }
  // Also allow small integers that are structural (index/count/time)
  // without being data — the LLM might legitimately write "3 widgets"
  // or "8:00 PM" or "24 hours".
  for (let i = 0; i <= 60; i += 1) numberAllowlist.add(String(i));
  // Hours in a 24h window.
  ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
   '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'].forEach(
    (h) => numberAllowlist.add(h),
  );

  return {
    metadata: {
      metric,
      label: meta.label,
      unit: meta.unit,
      format: meta.format,
      interval,
      timeRange,
      pointCount: series.length,
      firstTimestamp: points[0].ts_local,
      lastTimestamp: points[points.length - 1].ts_local,
    },
    numbers: {
      total: { raw: total, formatted: formatValue(total, meta.format, meta.unit) },
      min: { raw: min, formatted: formatValue(min, meta.format, meta.unit) },
      max: { raw: max, formatted: formatValue(max, meta.format, meta.unit) },
      avg: { raw: avg, formatted: formatValue(avg, meta.format, meta.unit) },
      median: { raw: median, formatted: formatValue(median, meta.format, meta.unit) },
    },
    trend,
    anomaly: anomaly
      ? {
          multiplier: anomaly.multiplier,
          formatted_value: formatValue(anomaly.max, meta.format, meta.unit),
        }
      : null,
    points,
    // Exposed to fact-verifier only, not to the LLM.
    _numberAllowlist: numberAllowlist,
  };
}
