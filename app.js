fetch('/api/status')
  .then((r) => r.json())
  .then((data) => {
    const el = document.getElementById('result');
    const statusLine =
      `hasConfig: ${data.hasConfig} | kvBound: ${data.kvBound} | ts: ${data.ts}`;

    if (data.authenticated) {
      el.textContent = `Logged in — tenant: ${data.tenantId} (${statusLine})`;
    } else {
      el.textContent = `${statusLine} — `;
      const loginLink = document.createElement('a');
      loginLink.href = '/api/auth/login';
      loginLink.textContent = 'Log in with SSO';
      el.appendChild(loginLink);
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
    resultEl.textContent = 'Loading…';

    fetch('/api/data/cdn-traffic')
      .then((r) => r.json())
      .then((data) => {
        if (data.available) {
          resultEl.textContent = JSON.stringify(data.data);
        } else {
          resultEl.textContent = 'No data available';
        }
      })
      .catch(() => {
        resultEl.textContent = 'No data available';
      });
  });
}
