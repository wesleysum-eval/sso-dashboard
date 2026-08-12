// Phase 4 (GEN-01..03): client-side draft state for the currently selected
// data source and the last-generated widget spec — kept purely in-memory
// (D-07), never persisted to a cookie/KV. The selected data source is also
// reflected into the URL's `?source=` query param (Phase 3's D-04
// passthrough state) so a page refresh mid-flow doesn't silently lose which
// source was picked, without introducing any server-side session growth.
const draft = { dataSource: null, prompt: '', spec: null };

function getSourceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('source');
  return value === 'cdn-traffic' ? value : null;
}

function setSourceInUrl(source) {
  const url = new URL(window.location.href);
  url.searchParams.set('source', source);
  window.history.replaceState({}, '', url);
}

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
          const pre = document.createElement('pre');
          pre.textContent = JSON.stringify(data.data, null, 2);
          resultEl.appendChild(pre);
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

// extractSeries(data) attempts to normalize a handful of plausible
// `DescribeTimingL7AnalysisData`/`DescribeDDoSAttackData` response shapes
// into a flat [{ label, value }] series. Returns null if the shape doesn't
// match anything recognized — callers must render a `.widget-placeholder`
// in that case rather than throwing, so one malformed widget never breaks
// its siblings (D-UI-03/Pitfall 6).
function extractSeries(data) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0];
  const detail = first && (first.DetailData || first.Detail);

  if (Array.isArray(detail) && detail.length > 0) {
    const series = detail
      .map((point) => {
        const label = point.Time ?? point.time ?? '';
        const value = Number(point.Value ?? point.value);
        return { label: String(label), value };
      })
      .filter((point) => !Number.isNaN(point.value));
    return series.length > 0 ? series : null;
  }

  // Flat array of { Time/time, Value/value } points directly.
  if (first && (first.Time !== undefined || first.time !== undefined)) {
    const series = data
      .map((point) => {
        const label = point.Time ?? point.time ?? '';
        const value = Number(point.Value ?? point.value);
        return { label: String(label), value };
      })
      .filter((point) => !Number.isNaN(point.value));
    return series.length > 0 ? series : null;
  }

  return null;
}

function widgetCardShell(widget) {
  const card = document.createElement('div');
  card.className = 'widget-card';

  const title = document.createElement('div');
  title.className = 'widget-card-title';
  title.textContent = widget.title || widget.metric;
  title.title = widget.title || widget.metric;
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
  const series = extractSeries(widget.data);
  if (!series) return renderPlaceholder(widget);

  const card = widgetCardShell(widget);

  const canvas = document.createElement('canvas');
  card.appendChild(canvas);

  if (typeof Chart === 'undefined') return renderPlaceholder(widget);

  new Chart(canvas.getContext('2d'), {
    type: chartType,
    data: {
      labels: series.map((point) => point.label),
      datasets: [
        {
          label: widget.title || widget.metric,
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
  const series = extractSeries(widget.data);
  if (!series) return renderPlaceholder(widget);

  const total = series.reduce((sum, point) => sum + point.value, 0);

  const card = widgetCardShell(widget);
  const value = document.createElement('div');
  value.className = 'stat-card-value';
  value.textContent = String(Math.round(total * 100) / 100);
  card.appendChild(value);

  return card;
}

function renderTableWidget(widget) {
  const series = extractSeries(widget.data);
  if (!series) return renderPlaceholder(widget);

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
    valueCell.textContent = String(point.value);
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
        previousSpec: isRePrompt ? draft.spec : undefined,
      }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (ok && body && Array.isArray(body.widgets) && body.widgets.length > 0) {
          draft.prompt = promptText;
          draft.spec = body.widgets;
          renderWidgets(body.widgets);
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
