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
