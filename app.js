// Phase 4 (GEN-01..04, SAVE-01): client-side draft state for the currently
// selected data source and the last-generated widget spec — kept purely
// in-memory (D-07), never persisted to a cookie/KV. `data` mirrors the
// generic { spec, data, prompt } save contract (edge-functions/api/
// dashboard.js) — the real per-widget fetched data already travels inside
// each entry of `spec` (unchanged from Plan 04-01), so this field exists
// for shape-compatibility with the save payload rather than being read by
// any renderer. The selected data source is also reflected into the URL's
// `?source=` query param (Phase 3's D-04 passthrough state) so a page
// refresh mid-flow doesn't silently lose which source was picked, without
// introducing any server-side session growth.
const draft = { dataSource: null, prompt: '', spec: null, data: null, dashboardTitle: null };

function getSourceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('source');
  // Phase 3 Plan 02 (D-01): closed vocabulary of exactly the two data
  // sources this app supports — any other value is treated as absent.
  return value === 'cdn-traffic' || value === 'security-events' ? value : null;
}

function setSourceInUrl(source) {
  const url = new URL(window.location.href);
  url.searchParams.set('source', source);
  window.history.replaceState({}, '', url);
}

// Phase 4 (SAVE-01): a bookmarked `/?dashboard=<id>` link — read-only
// retrieval of a previously saved dashboard, never mixed with the
// generation flow's own state.
function getDashboardIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('dashboard');
}

// Read once at script-load time. renderRetrievalView() (defined further
// below — function declarations are hoisted, so calling it from inside the
// /api/status callback here is safe) is the single call site that actually
// invokes it, gated on `data.authenticated` so an unauthenticated visitor
// sees the normal login screen instead.
const retrievalDashboardId = getDashboardIdFromUrl();

fetch('/api/status')
  .then((r) => r.json())
  .then((data) => {
    const el = document.getElementById('result');
    const statusLine =
      `hasConfig: ${data.hasConfig} | kvBound: ${data.kvBound} | ts: ${data.ts}`;

    const loginScreen = document.getElementById('login-screen');
    const navbar = document.getElementById('navbar');
    const tenantBadgeValue = document.getElementById('tenant-badge-value');

    if (data.authenticated) {
      // Logged in: hide the login card, show the top nav with tenant badge.
      loginScreen.classList.add('is-hidden');
      navbar.classList.add('is-visible');
      // 02-UI-SPEC.md long-text backstop: ellipsis-truncate via CSS, full
      // value still available on hover via the title attribute.
      tenantBadgeValue.textContent = data.tenantId;
      tenantBadgeValue.title = data.tenantId;

      el.textContent = '';
      const status = document.createElement('div');
      status.className = 'login-status';
      status.textContent = statusLine;
      el.appendChild(status);
    } else {
      el.textContent = '';

      const loginLink = document.createElement('a');
      loginLink.href = '/api/auth/login';
      loginLink.textContent = 'Log in with SSO';
      loginLink.className = 'btn-primary';
      el.appendChild(loginLink);

      const status = document.createElement('div');
      status.className = 'login-status';
      status.textContent = statusLine;
      el.appendChild(status);
    }

    // Phase 3 (DATA-01/D-01): the "CDN Traffic Stats" picker card only
    // renders for authenticated users. Reuses this same /api/status fetch
    // and its `authenticated` field — no duplicate client-side session
    // check is introduced.
    //
    // Phase 4 (SAVE-01): when a `?dashboard=<id>` retrieval link is open,
    // skip all of the normal generation-flow gating below entirely —
    // renderRetrievalView() owns dashboard-main/prompt-section visibility
    // in that mode, and running both would race (whichever resolves last
    // wins), undoing the read-only view's hidden controls (D-UI-07).
    if (retrievalDashboardId) {
      if (data.authenticated) {
        renderRetrievalView(retrievalDashboardId);
      }
      // Not authenticated: the existing login-screen branch above already
      // handles this — the retrieval fetch itself is session-gated and
      // would 401 anyway, so no separate messaging is needed here.
      return;
    }

    const dataSourceSection = document.getElementById('data-source-section');
    if (dataSourceSection) {
      // Phase 6: agent mode picks its own tools, so the manual source
      // picker is not part of that flow — hide it rather than leaving a
      // control that does nothing useful.
      const showPicker = data.authenticated && !isAgentEnabled();
      dataSourceSection.style.display = showPicker ? '' : 'none';
    }

    // Phase 4 (GEN-01): the prompt panel is gated behind BOTH authenticated
    // AND a selected data source (Phase 3's D-04 `?source=` passthrough) —
    // reuses this same `authenticated` field, no duplicate session check.
    //
    // Phase 6 exception: in agent mode (?agent=1) the agent selects its own
    // tools, so no data source needs to be picked first — the prompt panel
    // is gated on `authenticated` alone. Both the picker cards and the
    // ?source= passthrough remain functional and simply go unused.
    const promptSection = document.getElementById('prompt-section');
    if (promptSection) {
      const existingSource = data.authenticated ? getSourceFromUrl() : null;
      if (existingSource) draft.dataSource = existingSource;
      const agentMode = isAgentEnabled();
      promptSection.style.display =
        data.authenticated && (agentMode || draft.dataSource) ? '' : 'none';
      if (existingSource && !agentMode) {
        loadDefaultDataSourceDashboard(existingSource);
      }
      if (agentMode) {
        // Agent mode replaces the widget-picking language with report
        // language, and hides the data-source picker since it is not part
        // of this flow.
        //
        // Note: the Generate button element is looked up locally here
        // rather than using the module-level `generateBtn` const, which is
        // declared far below this /api/status callback. `const` is not
        // hoisted, so referencing it here would throw a
        // ReferenceError at runtime even though the callback fires later.
        const heading = document.getElementById('prompt-panel-heading');
        if (heading) heading.textContent = 'Ask a question about your traffic';
        const promptTextarea = document.getElementById('prompt-textarea');
        if (promptTextarea) {
          promptTextarea.placeholder =
            'e.g. How did traffic behave over the last 24 hours? Any anomalies I should know about?';
        }
        const btn = document.getElementById('generate-btn');
        if (btn) btn.textContent = 'Generate Report';
      }
    }

    // Self-service tenant connection: only fetched/rendered for
    // authenticated users, same gating as the data source picker above.
    const tenantConnectSection = document.getElementById('tenant-connect-section');
    if (tenantConnectSection) {
      tenantConnectSection.style.display = data.authenticated ? '' : 'none';
      if (data.authenticated) {
        loadConnectStatus();
      }
    }
  })
  .catch((err) => {
    document.getElementById('result').textContent = `Error: ${err.message}`;
  });

const DEFAULT_DATA_SOURCE_DASHBOARDS = {
  'cdn-traffic': {
    apiPath: '/api/data/cdn-traffic',
    title: 'CDN Traffic Snapshot',
    caption: 'Last 24 hours · Real EdgeOne traffic data',
    widgets: [
      {
        componentType: 'stat-card',
        title: 'Total Outbound Traffic',
        metric: 'l7Flow_outFlux',
        interval: 'hour',
      },
      {
        componentType: 'line-chart',
        title: 'Hourly Outbound Traffic',
        metric: 'l7Flow_outFlux',
        interval: 'hour',
      },
      {
        componentType: 'table',
        title: 'Hourly Traffic Detail',
        metric: 'l7Flow_outFlux',
        interval: 'hour',
      },
    ],
  },
  'security-events': {
    apiPath: '/api/data/security-events',
    title: 'Security Events Snapshot',
    caption: 'Last 24 hours · DDoS attack bandwidth',
    widgets: [
      {
        componentType: 'stat-card',
        title: 'Total Attack Bandwidth',
        metric: 'ddos_attackBandwidth',
        interval: 'hour',
      },
      {
        componentType: 'line-chart',
        title: 'Attack Bandwidth Trend',
        metric: 'ddos_attackBandwidth',
        interval: 'hour',
      },
      {
        componentType: 'table',
        title: 'Security Event Detail',
        metric: 'ddos_attackBandwidth',
        interval: 'hour',
      },
    ],
  },
};

function revealPromptForSource(source) {
  draft.dataSource = source;
  setSourceInUrl(source);
  const promptSection = document.getElementById('prompt-section');
  if (promptSection) promptSection.style.display = '';
}

function renderDefaultDataSourceDashboard(resultEl, config, data) {
  resultEl.textContent = '';

  const header = document.createElement('div');
  header.className = 'default-dashboard-header';

  const title = document.createElement('div');
  title.className = 'default-dashboard-title';
  title.textContent = config.title;
  header.appendChild(title);

  const caption = document.createElement('div');
  caption.className = 'default-dashboard-caption';
  caption.textContent = `${config.caption} · as of ${new Date().toLocaleString()}`;
  header.appendChild(caption);

  resultEl.appendChild(header);

  const stack = document.createElement('div');
  stack.className = 'default-dashboard-stack';

  const hydratedWidgets = config.widgets.map((widget) => ({ ...widget, data }));
  const heroIndex = hydratedWidgets.findIndex((widget) => widget.componentType === 'stat-card');
  hydratedWidgets.forEach((widget, index) => {
    stack.appendChild(renderWidget(widget, index === heroIndex));
  });

  resultEl.appendChild(stack);
}

function loadDefaultDataSourceDashboard(source) {
  const config = DEFAULT_DATA_SOURCE_DASHBOARDS[source];
  if (!config) return;

  const resultEl = document.getElementById('data-source-result');
  if (!resultEl) return;

  resultEl.classList.add('is-visible');
  resultEl.textContent = 'Loading…';

  revealPromptForSource(source);

  fetch(config.apiPath)
    .then((r) => r.json())
    .then((data) => {
      if (data.available) {
        renderDefaultDataSourceDashboard(resultEl, config, data.data);
      } else {
        resultEl.textContent = 'No data available';
      }
    })
    .catch(() => {
      resultEl.textContent = 'No data available';
    });
}

// Phase 3 (DATA-01): clicking the data-source cards fetches the
// session-gated, tenant-scoped routes and renders a default dashboard
// snapshot. The client still never inspects *why* `available` is false.
const cdnTrafficCard = document.getElementById('card-cdn-traffic');
if (cdnTrafficCard) {
  cdnTrafficCard.addEventListener('click', () => {
    loadDefaultDataSourceDashboard('cdn-traffic');
  });
}

// WR-03 fix: completes the security-events UI entry point that
// getSourceFromUrl() already widened to accept (this phase, commit
// e52f2cc) but never gained a picker card for — the only way to reach
// this flow was previously hand-editing ?source=security-events into the
// URL. Mirrors the CDN Traffic Stats card above exactly; safe to enable
// now that CR-01 fixed extractSeries()'s DescribeDDoSAttackData shape
// handling, so this data source actually renders instead of always
// showing "Data unavailable".
const securityEventsCard = document.getElementById('card-security-events');
if (securityEventsCard) {
  securityEventsCard.addEventListener('click', () => {
    loadDefaultDataSourceDashboard('security-events');
  });
}

// Self-service tenant connection form — lets a logged-in user paste their
// own Zone ID / SecretId / SecretKey instead of the credentials being
// pasted manually into the EdgeOne KV console. Backend
// (edge-functions/api/tenant/connect.js) always resolves the KV key from
// the verified session's tenant_id — the client never sends or influences
// which tenant record is written.
function renderConnectedStatus(zoneId) {
  const card = document.getElementById('connect-card');
  card.textContent = '';

  const row = document.createElement('div');
  row.className = 'connect-status-row';

  const text = document.createElement('span');
  text.className = 'connect-status-text';
  text.textContent = `Connected — Zone: ${zoneId}`;
  row.appendChild(text);

  const updateBtn = document.createElement('button');
  updateBtn.type = 'button';
  updateBtn.className = 'btn-secondary';
  updateBtn.textContent = 'Update connection';
  updateBtn.addEventListener('click', () => renderConnectForm());
  row.appendChild(updateBtn);

  card.appendChild(row);
}

function renderConnectForm() {
  const card = document.getElementById('connect-card');
  card.textContent = '';

  const heading = document.createElement('h3');
  heading.textContent = 'Connect your EdgeOne account';
  card.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'connect-desc';
  desc.textContent =
    'Paste your Zone ID and a read-only Tencent Cloud API key. Secrets are encrypted before storage.';
  card.appendChild(desc);

  const form = document.createElement('form');
  form.className = 'connect-form';

  const fields = [
    { id: 'connect-zone-id', label: 'Zone ID', type: 'text' },
    { id: 'connect-secret-id', label: 'Secret ID', type: 'password' },
    { id: 'connect-secret-key', label: 'Secret Key', type: 'password' },
  ];

  fields.forEach(({ id, label, type }) => {
    const field = document.createElement('div');
    field.className = 'field';

    const labelEl = document.createElement('label');
    labelEl.setAttribute('for', id);
    labelEl.textContent = label;
    field.appendChild(labelEl);

    const input = document.createElement('input');
    input.id = id;
    input.type = type;
    input.required = true;
    input.autocomplete = 'off';
    field.appendChild(input);

    form.appendChild(field);
  });

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn-primary';
  submitBtn.textContent = 'Save';
  form.appendChild(submitBtn);

  const message = document.createElement('div');
  message.className = 'connect-form-message';
  form.appendChild(message);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    message.textContent = 'Saving…';
    message.className = 'connect-form-message';

    const zoneId = document.getElementById('connect-zone-id').value;
    const secretId = document.getElementById('connect-secret-id').value;
    const secretKey = document.getElementById('connect-secret-key').value;

    fetch('/api/tenant/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId, secretId, secretKey }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (ok && body.saved) {
          renderConnectedStatus(body.zoneId);
        } else {
          message.textContent = 'Could not save — check your values and try again.';
          message.className = 'connect-form-message is-error';
        }
      })
      .catch(() => {
        message.textContent = 'Could not save — check your values and try again.';
        message.className = 'connect-form-message is-error';
      });
  });

  card.appendChild(form);
}

function loadConnectStatus() {
  fetch('/api/tenant/connect')
    .then((r) => r.json())
    .then((data) => {
      if (data.connected) {
        renderConnectedStatus(data.zoneId);
      } else {
        renderConnectForm();
      }
    })
    .catch(() => {
      renderConnectForm();
    });
}

// ---------- Phase 4 (GEN-01..03): prompt-driven dashboard generation ----------
//
// D-08/T-04-02: the client never inspects *why* generation failed — every
// failure the server can produce (`{ error: 'generation_failed' }`, a
// non-2xx status, or a thrown fetch error) maps to the exact same D-08
// copy string.
//
// Anti-Patterns/XSS (04-RESEARCH.md): every widget field rendered here,
// especially the LLM-supplied `title`, uses textContent/createElement —
// never innerHTML.

// METRIC_LABELS: client-side mirror of edge-functions/lib/generation-
// schema.js's export, verbatim. app.js has no module system and cannot
// import from edge-functions/ (this project's existing plain-script
// convention) — this is a deliberate content duplication of a small closed
// constant table, not a new architecture. Must be kept in sync with
// edge-functions/lib/generation-schema.js's METRIC_LABELS by hand.
const METRIC_LABELS = {
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

// formatMetricValue(value, formatRule, unit) implements 04.1-UI-SPEC.md's
// Numeric Formatting Rules exactly. Reads the unit string from the caller
// (looked up via METRIC_LABELS at each call site) rather than hardcoding
// "requests" vs "pps" here. Zero values render as "0 {unit}" (never blank)
// for every rule.
function formatMetricValue(value, formatRule, unit) {
  const n = Number(value) || 0;

  if (formatRule === 'bytes-binary') {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${(n / 1024 ** 3).toFixed(1)} GB`;
  }

  if (formatRule === 'bandwidth-decimal') {
    if (n < 1000) return `${n} bps`;
    if (n < 1e6) return `${(n / 1000).toFixed(1)} Kbps`;
    if (n < 1e9) return `${(n / 1e6).toFixed(1)} Mbps`;
    return `${(n / 1e9).toFixed(1)} Gbps`;
  }

  if (formatRule === 'integer-grouped') {
    return `${Math.round(n).toLocaleString()} ${unit}`;
  }

  if (formatRule === 'ms-rounded') {
    return `${Math.round(n)} ${unit}`;
  }

  if (formatRule === 'rate-1dp') {
    return `${n.toFixed(1)} ${unit}`;
  }

  // Unknown format rule: fall back to a plain unit-suffixed number rather
  // than throwing (D-08 lineage — fail-soft-to-default).
  return `${n} ${unit}`;
}

// formatTimestamp(rawValue, interval) implements 04.1-UI-SPEC.md's
// Timestamp Format Contract: one formatting function shared by chart
// x-axis labels, table "Time" column, and the spike-callout's timestamp
// substitution — never three divergent formats for the same underlying
// point. Accepts both a Unix-seconds number (multiplied by 1000 before
// constructing a Date) and a pre-existing Date-parseable string.
function formatTimestamp(rawValue, interval) {
  const date =
    typeof rawValue === 'number' ? new Date(rawValue * 1000) : new Date(rawValue);

  if (Number.isNaN(date.getTime())) return String(rawValue ?? '');

  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();

  if (interval === 'day') {
    return `${month} ${day}`;
  }

  // Default to 'hour' format if interval is missing/unrecognized.
  const time = date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${month} ${day}, ${time}`;
}

// ---------- Phase 4.1 (D-03/D-04): computed-only insight helpers ----------
//
// All three functions below operate purely on an already-extracted series
// (04.1-UI-SPEC.md's Insight Computation Contract) — no new fetch, no new
// LLM call. Never LLM-invented: these compute deterministic statistics over
// data the server already fetched and validated (Phase 4).

// computeStats(series) -> { min, max, avg } over the series' value fields.
function computeStats(series) {
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return { min, max, avg };
}

// computeTrend(series) -> 'up' | 'down' | 'flat'. Splits the series into a
// first half and second half by index (floor of half the length as the
// split point); compares the average of each half. >5% higher -> 'up',
// >5% lower -> 'down', otherwise 'flat'.
function computeTrend(series) {
  const mid = Math.floor(series.length / 2);
  const firstHalf = series.slice(0, mid);
  const secondHalf = series.slice(mid);
  if (firstHalf.length === 0 || secondHalf.length === 0) return 'flat';

  const avg = (arr) => arr.reduce((sum, p) => sum + p.value, 0) / arr.length;
  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);

  if (firstAvg === 0) return secondAvg === 0 ? 'flat' : 'up';

  const pctChange = (secondAvg - firstAvg) / firstAvg;
  if (pctChange > 0.05) return 'up';
  if (pctChange < -0.05) return 'down';
  return 'flat';
}

// Returns { point, multiplier } if the series' single highest point is a
// robust statistical outlier, else null. Only ever flags the single
// highest point per call — never a list of multiple points.
//
// Fix (2026-08-13): the previous implementation used a mean-based
// `max > mean * 2` heuristic, which is fragile on flat traffic curves
// (any small transient can drag the mean and trigger a false spike, and
// the reported "N.N× average" multiplier is unstable). This version uses
// the median + 3× MAD (Median Absolute Deviation) rule — the same robust
// outlier test used in most anomaly-detection literature. Falls back
// gracefully to the old mean-based rule when MAD is zero (identical
// values across the series), so behaviour on a genuinely flat series is
// unchanged. Requires at least 4 points to compute a stable median;
// shorter series never spike (avoids single-point false alarms during
// backfill).
function detectSpike(series) {
  if (!Array.isArray(series) || series.length < 4) return null;

  const values = series.map((p) => p.value).slice().sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];

  const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];

  let maxPoint = series[0];
  for (const point of series) {
    if (point.value > maxPoint.value) maxPoint = point;
  }

  // Robust rule: exceed median + 3× MAD (≈ 3σ under a normal-ish
  // distribution). Only flags true outliers, not routine variance.
  if (mad > 0 && maxPoint.value > median + 3 * mad) {
    const multiplier = median > 0
      ? Math.round((maxPoint.value / median) * 10) / 10
      : 0;
    return { point: maxPoint, multiplier };
  }

  // MAD-zero fallback: series is constant except for the max. Use a
  // conservative 2× median threshold so we don't false-alarm on tiny
  // discrete jitter in an otherwise-flat curve.
  if (mad === 0 && median > 0 && maxPoint.value > median * 2) {
    const multiplier = Math.round((maxPoint.value / median) * 10) / 10;
    return { point: maxPoint, multiplier };
  }

  return null;
}

// extractSeries(data) normalizes the real teo `DescribeTimingL7AnalysisData`/
// `DescribeDDoSAttackData` response shape into a flat [{ label, value }]
// series: `data[0].TypeValue[].Detail[].{ Timestamp, Value }` for
// integer-valued metrics, or `data[0].FloatTypeValue[].Detail[].{ Timestamp,
// Value }` for float-valued metrics (e.g. l7Flow_requestRate) — see
// EdgeOne_API_Knowledge_Base.md's Output Parameters for
// DescribeTimingL7AnalysisData. `Timestamp` is a Unix seconds integer, not
// an ISO string. Returns null if the shape doesn't match anything
// recognized — callers must render a `.widget-placeholder` in that case
// rather than throwing, so one malformed widget never breaks its siblings
// (D-UI-03/Pitfall 6).
function extractSeries(data, interval) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0];
  const typeValues = [
    ...(Array.isArray(first?.TypeValue) ? first.TypeValue : []),
    ...(Array.isArray(first?.FloatTypeValue) ? first.FloatTypeValue : []),
  ];
  const detail = typeValues[0]?.Detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const series = detail
      .map((point) => {
        const rawTimestamp = point.Timestamp ?? point.Time ?? point.time;
        const label = formatTimestamp(rawTimestamp, interval);
        const value = Number(point.Value ?? point.value);
        return { label: String(label), value, rawTimestamp };
      })
      .filter((point) => !Number.isNaN(point.value));
    return series.length > 0 ? series : null;
  }

  // DescribeDDoSAttackData (security-events) shape:
  // data[0].Value[].Detail[].{ Timestamp, Value } — note `Value` here is an
  // array (plural shape), distinct from the CDN-traffic TypeValue/FloatTypeValue
  // branch above. See 03-RESEARCH.md for the verbatim response shape.
  const ddosDetail = Array.isArray(first?.Value) ? first.Value[0]?.Detail : undefined;
  if (Array.isArray(ddosDetail) && ddosDetail.length > 0) {
    const series = ddosDetail
      .map((point) => {
        const rawTimestamp = point.Timestamp ?? point.Time ?? point.time;
        const label = formatTimestamp(rawTimestamp, interval);
        const value = Number(point.Value ?? point.value);
        return { label: String(label), value, rawTimestamp };
      })
      .filter((point) => !Number.isNaN(point.value));
    return series.length > 0 ? series : null;
  }

  // Flat array of { Time/time, Value/value } points directly.
  if (first && (first.Time !== undefined || first.time !== undefined)) {
    const series = data
      .map((point) => {
        const rawTimestamp = point.Timestamp ?? point.Time ?? point.time;
        const label = formatTimestamp(rawTimestamp, interval);
        const value = Number(point.Value ?? point.value);
        return { label: String(label), value, rawTimestamp };
      })
      .filter((point) => !Number.isNaN(point.value));
    return series.length > 0 ? series : null;
  }

  return null;
}

function widgetCardShell(widget) {
  const card = document.createElement('div');
  card.className = 'widget-card';

  // D-01 root-cause fix: fall back to METRIC_LABELS' human-readable label
  // instead of the bare raw teo metric code, falling back to the metric
  // code itself only if the lookup misses (D-UI-09 graceful degradation).
  const fallbackTitle = METRIC_LABELS[widget.metric]?.label ?? widget.metric;
  const title = document.createElement('div');
  title.className = 'widget-card-title';
  title.textContent = widget.title || fallbackTitle;
  title.title = widget.title || fallbackTitle;
  card.appendChild(title);

  return card;
}

function renderPlaceholder(widget) {
  const card = widgetCardShell(widget);
  card.classList.add('widget-placeholder');

  const body = document.createElement('div');
  body.textContent = 'Data unavailable for this widget.';
  card.appendChild(body);

  return card;
}

function renderChartWidget(widget, chartType) {
  const series = extractSeries(widget.data, widget.interval);
  if (!series) return renderPlaceholder(widget);

  const card = widgetCardShell(widget);

  const canvas = document.createElement('canvas');
  card.appendChild(canvas);

  if (typeof Chart === 'undefined') return renderPlaceholder(widget);

  const meta = METRIC_LABELS[widget.metric];
  const datasetLabel = widget.title || meta?.label || widget.metric;

  new Chart(canvas.getContext('2d'), {
    type: chartType,
    data: {
      labels: series.map((point) => point.label),
      datasets: [
        {
          label: datasetLabel,
          data: series.map((point) => point.value),
          backgroundColor: '#0052d9',
          borderColor: '#0052d9',
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
    },
  });

  // D-UI-13: spike-callout — only if the series' single highest point
  // exceeds 2x the mean. Silent absence (no callout) otherwise.
  const spike = detectSpike(series);
  if (spike) {
    const callout = document.createElement('div');
    callout.className = 'spike-callout';

    const formattedTimestamp = formatTimestamp(spike.point.rawTimestamp, widget.interval);
    const formattedValue = formatMetricValue(spike.point.value, meta?.format, meta?.unit ?? '');

    callout.append(
      '\u26a0 Spike detected: ' + formattedTimestamp + ' \u2014 ' + formattedValue + ' (',
    );
    const multiplierSpan = document.createElement('span');
    multiplierSpan.className = 'spike-value';
    // Fix (2026-08-13): call this out as "typical" (median-relative), not
    // "average" — detectSpike now uses median + MAD, not the arithmetic
    // mean, so the multiplier is against the typical value rather than
    // an outlier-sensitive average.
    multiplierSpan.textContent = spike.multiplier > 0
      ? `${spike.multiplier}\u00d7 typical`
      : 'well above typical';
    callout.appendChild(multiplierSpan);
    callout.append(')');

    card.appendChild(callout);
  }

  // D-UI-14: summary-insight sentence — always for line-chart/bar-chart
  // widgets, computed from the same already-extracted series.
  const stats = computeStats(series);
  const trend = computeTrend(series);
  const label = meta?.label ?? widget.metric;
  const summary = document.createElement('div');
  summary.className = 'insight-summary';
  summary.textContent =
    `${label} ranged from ${formatMetricValue(stats.min, meta?.format, meta?.unit ?? '')} to ` +
    `${formatMetricValue(stats.max, meta?.format, meta?.unit ?? '')}, averaging ` +
    `${formatMetricValue(stats.avg, meta?.format, meta?.unit ?? '')}, and is trending ${trend} ` +
    `over this period.`;
  card.appendChild(summary);

  return card;
}

function renderStatCardWidget(widget, isHero) {
  const series = extractSeries(widget.data, widget.interval);
  if (!series) return renderPlaceholder(widget);

  const total = series.reduce((sum, point) => sum + point.value, 0);
  const meta = METRIC_LABELS[widget.metric];

  const card = widgetCardShell(widget);
  if (isHero) card.classList.add('is-hero');
  const value = document.createElement('div');
  value.className = 'stat-card-value';
  value.textContent = formatMetricValue(total, meta?.format, meta?.unit ?? '');
  card.appendChild(value);

  return card;
}

function renderTableWidget(widget) {
  const series = extractSeries(widget.data, widget.interval);
  if (!series) return renderPlaceholder(widget);

  const meta = METRIC_LABELS[widget.metric];

  const card = widgetCardShell(widget);
  const table = document.createElement('table');
  table.className = 'widget-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Time', 'Value'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  series.forEach((point) => {
    const row = document.createElement('tr');
    const timeCell = document.createElement('td');
    timeCell.textContent = point.label;
    const valueCell = document.createElement('td');
    valueCell.textContent = formatMetricValue(point.value, meta?.format, meta?.unit ?? '');
    row.appendChild(timeCell);
    row.appendChild(valueCell);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  card.appendChild(table);
  return card;
}

function renderWidget(widget, isHero) {
  if (widget.componentType === 'line-chart') return renderChartWidget(widget, 'line');
  if (widget.componentType === 'bar-chart') return renderChartWidget(widget, 'bar');
  if (widget.componentType === 'stat-card') return renderStatCardWidget(widget, isHero);
  if (widget.componentType === 'table') return renderTableWidget(widget);
  return renderPlaceholder(widget);
}

function renderEmptyState() {
  const stack = document.getElementById('widget-stack');
  stack.textContent = '';

  const empty = document.createElement('div');
  empty.className = 'widget-empty-state';

  const heading = document.createElement('div');
  heading.className = 'widget-empty-heading';
  heading.textContent = 'No dashboard yet';
  empty.appendChild(heading);

  const bodyText = document.createElement('div');
  bodyText.className = 'widget-empty-body';
  bodyText.textContent = 'Describe what you want to see, then generate to build your dashboard.';
  empty.appendChild(bodyText);

  stack.appendChild(empty);
}

function renderWidgets(widgets) {
  const stack = document.getElementById('widget-stack');
  stack.textContent = '';

  // D-UI-12: hero-metric selection — the FIRST stat-card widget in the
  // LLM's returned order (no reordering). At most one hero per dashboard.
  // If no stat-card widget exists, no hero treatment is applied at all —
  // never promotes a chart/table widget instead.
  const heroIndex = widgets.findIndex((w) => w.componentType === 'stat-card');

  widgets.forEach((widget, index) => {
    stack.appendChild(renderWidget(widget, index === heroIndex));
  });

  // Fix (2026-08-13): "As of {timestamp}" footer so users see the
  // dashboard is a snapshot, not a live-updating view. Applies to every
  // generated dashboard (previously only the built-in default snapshots
  // showed a timestamp — line 208 of loadDefaultDataSourceDashboard).
  // Guarded by widgets.length > 0 to avoid rendering under an empty
  // state.
  if (widgets.length > 0) {
    const footer = document.createElement('div');
    footer.className = 'dashboard-timestamp-footer';
    footer.style.cssText =
      'margin-top: 16px; font-size: 12px; color: var(--color-text-subtle); text-align: right;';
    footer.textContent = `Snapshot as of ${new Date().toLocaleString()}`;
    stack.appendChild(footer);
  }
}

// ---------- Phase 4.1 (D-06/D-UI-16/D-UI-17): dashboard-state badge ----------
//
// setDashboardStateBadge() is presentation-only — it never fetches. Call
// sites decide when to invoke it, driven entirely by responses/state that
// already exist in memory (never a new network call, per D-UI-16).
function setDashboardStateBadge(text, isSaved) {
  const badge = document.getElementById('dashboard-state-badge');
  if (!badge) return;
  badge.textContent = text;
  badge.classList.toggle('is-saved', Boolean(isSaved));
  badge.style.display = '';
}

function showErrorBanner(message) {
  const banner = document.getElementById('error-banner');
  if (!banner) return;
  banner.textContent = message;
  banner.style.display = '';
}

function hideErrorBanner() {
  const banner = document.getElementById('error-banner');
  if (!banner) return;
  banner.style.display = 'none';
  banner.textContent = '';
}

// Phase 5 (HTML-agent pipeline): opt-in via ?html=1. When enabled, the
// Generate button calls /api/generate-html instead of /api/generate and
// renders the returned HTML inside a sandboxed iframe. The existing JSON
// pipeline remains the default so users without the flag see zero
// change in behaviour (feature-flag rollout, D-08 lineage).
function isHtmlAgentEnabled() {
  const params = new URLSearchParams(window.location.search);
  return params.get('html') === '1';
}

function renderHtmlDashboard(htmlString) {
  const stack = document.getElementById('widget-stack');
  if (!stack) return;
  stack.textContent = '';

  const iframe = document.createElement('iframe');
  // sandbox="allow-scripts" (deliberately without allow-same-origin)
  // isolates the LLM-authored content from the parent page — no cookie
  // access, no localStorage, no parent-DOM access, no same-origin fetch.
  iframe.setAttribute('sandbox', 'allow-scripts');
  // CSP restricts scripts to the Chart.js CDN only. Defense-in-depth
  // alongside html-sanitizer.js.
  iframe.setAttribute('csp',
    "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'unsafe-inline'; img-src data:; font-src data:;");
  iframe.style.cssText = 'width: 100%; height: 900px; border: 0; border-radius: 12px; background: #f8fafc;';
  iframe.srcdoc = htmlString;
  stack.appendChild(iframe);

  const footer = document.createElement('div');
  footer.className = 'dashboard-timestamp-footer';
  footer.style.cssText =
    'margin-top: 16px; font-size: 12px; color: var(--color-text-subtle); text-align: right;';
  footer.textContent = `Snapshot as of ${new Date().toLocaleString()}`;
  stack.appendChild(footer);
}

// ---------- Phase 6: tool-calling agent + async job polling (?agent=1) ----------
//
// The agent pipeline picks its own teo tools, gathers data across several
// calls, then composes a full HTML report. It takes 30-90s, so the flow is
// async: POST /api/generate-agent returns a jobId, and the client polls
// GET /api/jobs/:id every 2s, rendering a progress view until the report
// is ready.
//
// Gated behind ?agent=1 so the JSON pipeline stays the default and existing
// users see no change (same feature-flag discipline as ?html=1).
function isAgentEnabled() {
  const params = new URLSearchParams(window.location.search);
  return params.get('agent') === '1';
}

const AGENT_POLL_INTERVAL_MS = 2000;
// The server's own wall clock is 100s (kept under the EdgeOne Edge Functions
// request cap). Poll a little past that so a client never gives up while the
// server is still working, then stop: 70 * 2s = 140s.
const AGENT_POLL_MAX_ATTEMPTS = 70;

// Renders the "investigating" progress panel. Deliberately plain DOM —
// textContent only, never innerHTML, for every server-supplied string.
function renderAgentProgress(state) {
  const stack = document.getElementById('widget-stack');
  if (!stack) return;
  stack.textContent = '';

  const panel = document.createElement('div');
  panel.className = 'widget-loading-state';
  panel.style.cssText = 'text-align: left; padding: 24px;';

  const heading = document.createElement('div');
  heading.style.cssText =
    'font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-text-subtle); margin-bottom: 10px;';
  heading.textContent = 'Investigating your data';
  panel.appendChild(heading);

  const note = document.createElement('div');
  note.style.cssText = 'font-size: 15px; color: var(--color-text); margin-bottom: 14px;';
  note.textContent = state.note || 'Working…';
  panel.appendChild(note);

  if (state.maxSteps > 0) {
    const barOuter = document.createElement('div');
    barOuter.style.cssText =
      'height: 4px; background: var(--color-border); border-radius: 999px; overflow: hidden; margin-bottom: 14px;';
    const barInner = document.createElement('div');
    const pct = Math.min(100, Math.round((state.step / state.maxSteps) * 100));
    barInner.style.cssText =
      'height: 100%; width: ' + pct + '%; background: var(--color-primary); transition: width 0.4s ease;';
    barOuter.appendChild(barInner);
    panel.appendChild(barOuter);
  }

  if (Array.isArray(state.toolsUsed) && state.toolsUsed.length > 0) {
    const chipRow = document.createElement('div');
    chipRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px;';
    state.toolsUsed.forEach((toolName) => {
      const chip = document.createElement('span');
      chip.style.cssText =
        'font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 10px; ' +
        'border: 1px solid var(--color-border); border-radius: 999px; color: var(--color-text-muted);';
      chip.textContent = String(toolName).replace(/^teo_/, '').replace(/_/g, ' ');
      chipRow.appendChild(chip);
    });
    panel.appendChild(chipRow);
  }

  stack.appendChild(panel);
}

// Renders the finished agent report into a sandboxed iframe. Same isolation
// posture as renderHtmlDashboard() — sandbox="allow-scripts" without
// allow-same-origin — plus a CSP that additionally permits the Google Fonts
// hosts the editorial-dark brief relies on.
function renderAgentReport(htmlString) {
  const stack = document.getElementById('widget-stack');
  if (!stack) return;
  stack.textContent = '';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute(
    'csp',
    "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; " +
      "style-src 'unsafe-inline' https://fonts.googleapis.com; " +
      'font-src https://fonts.gstatic.com data:; img-src data:;',
  );
  iframe.style.cssText =
    'width: 100%; height: 1400px; border: 0; border-radius: 12px; background: #111211;';
  iframe.srcdoc = htmlString;
  stack.appendChild(iframe);

  const footer = document.createElement('div');
  footer.className = 'dashboard-timestamp-footer';
  footer.style.cssText =
    'margin-top: 16px; font-size: 12px; color: var(--color-text-subtle); text-align: right;';
  footer.textContent = `Report generated ${new Date().toLocaleString()}`;
  stack.appendChild(footer);
}

// Polls GET /api/jobs/:id until the job reaches a terminal state.
function pollAgentJob(jobId, onDone, onFail) {
  let attempts = 0;

  const tick = () => {
    attempts += 1;
    if (attempts > AGENT_POLL_MAX_ATTEMPTS) {
      onFail();
      return;
    }

    fetch('/api/jobs/' + encodeURIComponent(jobId))
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok || !body || body.error) {
          onFail();
          return;
        }
        if (body.status === 'done' && typeof body.html === 'string') {
          onDone(body.html);
          return;
        }
        if (body.status === 'failed') {
          onFail();
          return;
        }
        renderAgentProgress(body);
        setTimeout(tick, AGENT_POLL_INTERVAL_MS);
      })
      .catch(() => {
        onFail();
      });
  };

  tick();
}

// Kicks off the agent run. Called from the Generate button handler when
// ?agent=1 is set.
function startAgentRun(promptText, btn) {
  btn.disabled = true;
  btn.textContent = 'Investigating…';
  hideErrorBanner();
  setDashboardStateBadge('Investigating…', false);
  renderAgentProgress({ note: 'Starting analysis', step: 0, maxSteps: 6, toolsUsed: [] });

  const restoreButton = () => {
    btn.disabled = false;
    btn.textContent = 'Generate Report';
  };

  fetch('/api/generate-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: promptText }),
  })
    .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
      if (!ok || !body || !body.jobId) {
        showErrorBanner("Couldn't start the analysis — try rephrasing your question.");
        restoreButton();
        return;
      }
      pollAgentJob(
        body.jobId,
        (html) => {
          renderAgentReport(html);
          setDashboardStateBadge('✓ Report ready', true);
          restoreButton();
        },
        () => {
          showErrorBanner("Couldn't complete the analysis — try rephrasing your question.");
          setDashboardStateBadge('● Failed', false);
          restoreButton();
        },
      );
    })
    .catch(() => {
      showErrorBanner("Couldn't start the analysis — try rephrasing your question.");
      restoreButton();
    });
}

const generateBtn = document.getElementById('generate-btn');
if (generateBtn) {
  generateBtn.addEventListener('click', () => {
    const textarea = document.getElementById('prompt-textarea');
    const promptText = textarea ? textarea.value.trim() : '';

    // Phase 6: the agent picks its own tools, so it does NOT require a
    // pre-selected data source — the dataSource guard is skipped here.
    if (isAgentEnabled()) {
      if (!promptText) return;
      startAgentRun(promptText, generateBtn);
      return;
    }

    if (!promptText || !draft.dataSource) return;

    // Phase 5: branch to the HTML-agent pipeline when ?html=1 is set.
    if (isHtmlAgentEnabled()) {
      generateBtn.disabled = true;
      generateBtn.textContent = 'Generating (this can take 8–15s)…';
      hideErrorBanner();
      setDashboardStateBadge('Generating…', false);

      // For the initial cut, default to the first metric of the source
      // and the standard 24h/hour window. A future revision will let
      // the LLM (or the user via prompt) pick metric/interval/range
      // through a first-pass classifier.
      const defaultMetricBySource = {
        'cdn-traffic': 'l7Flow_outFlux',
        'security-events': 'ddos_attackBandwidth',
      };
      const metric = defaultMetricBySource[draft.dataSource];

      fetch('/api/generate-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataSource: draft.dataSource,
          prompt: promptText,
          metric,
          interval: 'hour',
          timeRange: 'last24h',
        }),
      })
        .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
        .then(({ ok, body }) => {
          if (ok && body && typeof body.html === 'string' && body.html.length > 0) {
            renderHtmlDashboard(body.html);
            setDashboardStateBadge('● HTML draft — not saved', false);
          } else {
            showErrorBanner("Couldn't generate a dashboard from that prompt — try rephrasing.");
          }
        })
        .catch(() => {
          showErrorBanner("Couldn't generate a dashboard from that prompt — try rephrasing.");
        })
        .finally(() => {
          generateBtn.disabled = false;
          generateBtn.textContent = 'Generate Dashboard';
        });
      return;
    }

    const isRePrompt = Boolean(draft.spec);

    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating…';
    hideErrorBanner();
    setDashboardStateBadge('Generating…', false);

    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataSource: draft.dataSource,
        prompt: promptText,
        // GEN-04: previousSpec carries the prior widget spec forward on a
        // re-prompt so /api/generate can refine it — same route, zero
        // server-side change, per 04-CONTEXT.md D-07.
        previousSpec: isRePrompt ? draft.spec : undefined,
      }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (ok && body && Array.isArray(body.widgets) && body.widgets.length > 0) {
          draft.prompt = promptText;
          // Each widget already carries its own fetched teo data merged in
          // (Plan 04-01's response shape) — `spec` is this render-ready
          // array; `data` mirrors it for save-payload shape compatibility
          // with edge-functions/api/dashboard.js's { spec, data, prompt }
          // contract (no separate raw-data extraction exists server-side).
          draft.spec = body.widgets;
          draft.data = body.widgets;
          renderWidgets(body.widgets);
          showSaveBar();
          setDashboardStateBadge('● Draft — not saved', false);

          // D-05/D-UI-15: dashboardTitle (validated server-side) replaces
          // the prompt-panel heading; falls back to "Your Dashboard" when
          // absent/invalid. This update only runs inside the success
          // branch — before the first generation the heading keeps its
          // original "Generate a dashboard" text untouched.
          //
          // WR-01 fix: also persist the validated title onto `draft` so
          // saveDashboard() can include it in the save payload — previously
          // only the DOM heading was updated, so the title was silently
          // dropped on save and never appeared in the retrieval view.
          draft.dashboardTitle =
            typeof body.dashboardTitle === 'string' && body.dashboardTitle
              ? body.dashboardTitle
              : null;
          const heading = document.getElementById('prompt-panel-heading');
          if (heading) {
            heading.textContent = draft.dashboardTitle || 'Your Dashboard';
          }
        } else {
          // D-08: exact generic copy, regardless of underlying cause —
          // keep any prior dashboard visible (D-UI-01).
          showErrorBanner("Couldn't generate a dashboard from that prompt — try rephrasing.");
        }
      })
      .catch(() => {
        showErrorBanner("Couldn't generate a dashboard from that prompt — try rephrasing.");
      })
      .finally(() => {
        generateBtn.disabled = false;
        generateBtn.textContent = draft.spec ? 'Regenerate' : 'Generate Dashboard';
      });
  });
}

// ---------- Phase 4 (SAVE-01): Save Dashboard + retrieval view ----------
//
// D-UI-06: the save-success render path uses the POST /api/dashboard
// response body directly — never an immediate GET /api/dashboard/:id
// re-fetch (Pitfall 5 — sidesteps KV's 60-second eventual-consistency
// window).

function showSaveBar() {
  const bar = document.getElementById('save-bar');
  if (!bar) return;
  bar.style.display = '';
  bar.textContent = '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-primary save-bar-btn';
  btn.textContent = 'Save Dashboard';
  btn.addEventListener('click', () => saveDashboard(bar, btn));
  bar.appendChild(btn);
}

function saveDashboard(bar, btn) {
  btn.disabled = true;
  btn.textContent = 'Saving…';

  fetch('/api/dashboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spec: draft.spec,
      data: draft.data,
      prompt: draft.prompt,
      dashboardTitle: draft.dashboardTitle,
    }),
  })
    .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
      if (ok && body && body.dashboardId) {
        // Render from the already-in-memory response — never re-fetch
        // GET /api/dashboard/:id immediately (Pitfall 5).
        bar.textContent = '';

        const confirmation = document.createElement('div');
        confirmation.className = 'save-confirmation';

        const label = document.createElement('span');
        label.textContent = 'Saved \u2713 — Dashboard saved. Bookmark this link to view it again: ';
        confirmation.appendChild(label);

        const link = document.createElement('a');
        const url = new URL(window.location.href);
        url.search = '';
        url.searchParams.set('dashboard', body.dashboardId);
        link.href = url.toString();
        link.textContent = url.toString();
        confirmation.appendChild(link);

        // Phase 4.1 (D-06/T-04.1-05/T-04.1-06): Copy Link — reuses the same
        // `url` already constructed above, never rebuilt. Clipboard
        // failure/unavailability is a silent no-op (no new error banner),
        // per the no-leak/graceful-degradation convention.
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn-secondary copy-link-btn';
        copyBtn.textContent = 'Copy Link';
        copyBtn.addEventListener('click', () => {
          if (!navigator.clipboard || !navigator.clipboard.writeText) return;
          navigator.clipboard
            .writeText(url.toString())
            .then(() => {
              copyBtn.textContent = 'Copied!';
              setTimeout(() => {
                copyBtn.textContent = 'Copy Link';
              }, 2000);
            })
            .catch(() => {
              // Silent no-op — link text remains manually selectable.
            });
        });
        confirmation.appendChild(copyBtn);

        bar.appendChild(confirmation);
        // D-UI-16: driven off the same already-in-memory POST response —
        // never a new fetch.
        setDashboardStateBadge('✓ Saved', true);
      } else {
        btn.disabled = false;
        btn.textContent = 'Save Dashboard';
        showSaveError(bar, btn);
      }
    })
    .catch(() => {
      btn.disabled = false;
      btn.textContent = 'Save Dashboard';
      showSaveError(bar, btn);
    });
}

function showSaveError(bar) {
  let errorText = bar.querySelector('.save-error-text');
  if (!errorText) {
    errorText = document.createElement('div');
    errorText.className = 'save-error-text';
    bar.appendChild(errorText);
  }
  errorText.textContent = "Couldn't save right now. Try again in a moment.";
}

// D-UI-07: the retrieval view (`?dashboard=<id>`) renders read-only — the
// prompt textarea, Generate/Regenerate button, and Save button are all
// hidden entirely, not just disabled. v1 has no edit-and-re-save flow.
function renderRetrievalView(dashboardId) {
  const loginScreen = document.getElementById('login-screen');
  const notFoundScreen = document.getElementById('not-found-screen');
  const dashboardMain = document.getElementById('dashboard-main');
  const dataSourceSection = document.getElementById('data-source-section');
  const tenantConnectSection = document.getElementById('tenant-connect-section');
  const promptSection = document.getElementById('prompt-section');

  if (loginScreen) loginScreen.classList.add('is-hidden');
  if (dataSourceSection) dataSourceSection.style.display = 'none';
  if (tenantConnectSection) tenantConnectSection.style.display = 'none';

  // Hide the prompt textarea, Generate/Regenerate button, and Save button
  // — only the widget stack itself is shown, read-only. Hide the textarea
  // and button individually rather than the whole .prompt-panel container
  // (CR-02): the heading-row (h2 + #dashboard-state-badge) lives inside
  // .prompt-panel, so hiding the container made the "✓ Saved · Read-only"
  // badge structurally unrenderable regardless of its own display value.
  const promptTextarea = promptSection ? promptSection.querySelector('#prompt-textarea') : null;
  if (promptTextarea) promptTextarea.style.display = 'none';
  const generateButton = promptSection ? promptSection.querySelector('#generate-btn') : null;
  if (generateButton) generateButton.style.display = 'none';
  const saveBar = document.getElementById('save-bar');
  if (saveBar) saveBar.style.display = 'none';

  if (promptSection) promptSection.style.display = '';
  if (dashboardMain) dashboardMain.style.display = '';

  const stack = document.getElementById('widget-stack');
  if (stack) {
    stack.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'widget-loading-state';
    loading.textContent = 'Loading dashboard\u2026';
    stack.appendChild(loading);
  }

  fetch('/api/dashboard/' + encodeURIComponent(dashboardId))
    .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
      if (ok && body && Array.isArray(body.spec)) {
        renderWidgets(body.spec);
        // Fix (2026-08-13): renderWidgets() now appends its own
        // "Snapshot as of <now>" footer, but that timestamp is misleading
        // in the retrieval view — the dashboard data was captured at
        // save time (body.createdAt), not "now". Replace the auto-appended
        // footer's text with the saved timestamp when available.
        const stackEl = document.getElementById('widget-stack');
        if (stackEl) {
          const footer = stackEl.querySelector('.dashboard-timestamp-footer');
          if (footer && typeof body.createdAt === 'number') {
            footer.textContent = `Snapshot from ${new Date(body.createdAt).toLocaleString()}`;
          }
        }
        // WR-01 fix: render the persisted dashboardTitle (if any) into the
        // same heading element the generate flow uses, mirroring the
        // fallback text used there ("Your Dashboard") for consistency.
        const heading = document.getElementById('prompt-panel-heading');
        if (heading) {
          heading.textContent =
            typeof body.dashboardTitle === 'string' && body.dashboardTitle
              ? body.dashboardTitle
              : 'Your Dashboard';
        }
        // D-UI-17: unconditional — this view has no Generating/Draft
        // transition to preserve.
        setDashboardStateBadge('✓ Saved · Read-only', true);
      } else {
        // D-06: identical "Dashboard not found." copy regardless of cause
        // (missing id vs. cross-tenant) — full-page state, same pattern as
        // access-denied.html's centered-card.
        if (dashboardMain) dashboardMain.style.display = 'none';
        if (notFoundScreen) notFoundScreen.classList.remove('is-hidden');
      }
    })
    .catch(() => {
      if (dashboardMain) dashboardMain.style.display = 'none';
      if (notFoundScreen) notFoundScreen.classList.remove('is-hidden');
    });
}
