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
const draft = { dataSource: null, prompt: '', spec: null, data: null };

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
      dataSourceSection.style.display = data.authenticated ? '' : 'none';
    }

    // Phase 4 (GEN-01): the prompt panel is gated behind BOTH authenticated
    // AND a selected data source (Phase 3's D-04 `?source=` passthrough) —
    // reuses this same `authenticated` field, no duplicate session check.
    const promptSection = document.getElementById('prompt-section');
    if (promptSection) {
      const existingSource = data.authenticated ? getSourceFromUrl() : null;
      if (existingSource) draft.dataSource = existingSource;
      promptSection.style.display = data.authenticated && draft.dataSource ? '' : 'none';
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

// Phase 3 (DATA-01): clicking the CDN Traffic Stats card fetches the
// session-gated, tenant-scoped route and renders either the returned data
// or a generic "No data available" state (D-05) — the client never
// inspects *why* `available` is false.
const cdnTrafficCard = document.getElementById('card-cdn-traffic');
if (cdnTrafficCard) {
  cdnTrafficCard.addEventListener('click', () => {
    const resultEl = document.getElementById('data-source-result');
    resultEl.classList.add('is-visible');
    resultEl.textContent = 'Loading…';

    // Phase 4 (D-04 passthrough): selecting a data source reveals the
    // prompt panel and is reflected into the URL so a refresh mid-flow
    // doesn't lose the selection.
    draft.dataSource = 'cdn-traffic';
    setSourceInUrl('cdn-traffic');
    const promptSection = document.getElementById('prompt-section');
    if (promptSection) promptSection.style.display = '';

    fetch('/api/data/cdn-traffic')
      .then((r) => r.json())
      .then((data) => {
        if (data.available) {
          resultEl.textContent = '';
          // Reuse the same widget-card renderer as the prompt-driven
          // generate path (renderChartWidget -> extractSeries) rather than
          // dumping raw JSON — same real teo response shape, same fix.
          const card = renderChartWidget(
            {
              title: 'Outbound Traffic (last 24h)',
              metric: 'l7Flow_outFlux',
              data: data.data,
              interval: 'hour',
            },
            'line',
          );
          resultEl.appendChild(card);
        } else {
          resultEl.textContent = 'No data available';
        }
      })
      .catch(() => {
        resultEl.textContent = 'No data available';
      });
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
    return `${Math.round(n)} ms`;
  }

  if (formatRule === 'rate-1dp') {
    return `${n.toFixed(1)} req/s`;
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

  const datasetLabel = widget.title || METRIC_LABELS[widget.metric]?.label || widget.metric;

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

  return card;
}

function renderStatCardWidget(widget) {
  const series = extractSeries(widget.data, widget.interval);
  if (!series) return renderPlaceholder(widget);

  const total = series.reduce((sum, point) => sum + point.value, 0);
  const meta = METRIC_LABELS[widget.metric];

  const card = widgetCardShell(widget);
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

function renderWidget(widget) {
  if (widget.componentType === 'line-chart') return renderChartWidget(widget, 'line');
  if (widget.componentType === 'bar-chart') return renderChartWidget(widget, 'bar');
  if (widget.componentType === 'stat-card') return renderStatCardWidget(widget);
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
  widgets.forEach((widget) => {
    stack.appendChild(renderWidget(widget));
  });
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

const generateBtn = document.getElementById('generate-btn');
if (generateBtn) {
  generateBtn.addEventListener('click', () => {
    const textarea = document.getElementById('prompt-textarea');
    const promptText = textarea ? textarea.value.trim() : '';
    if (!promptText || !draft.dataSource) return;

    const isRePrompt = Boolean(draft.spec);

    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating…';
    hideErrorBanner();

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
    body: JSON.stringify({ spec: draft.spec, data: draft.data, prompt: draft.prompt }),
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

        bar.appendChild(confirmation);
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
  // — only the widget stack itself is shown, read-only.
  const promptPanel = promptSection ? promptSection.querySelector('.prompt-panel') : null;
  if (promptPanel) promptPanel.style.display = 'none';
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
