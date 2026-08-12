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
