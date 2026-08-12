fetch('/api/status')
  .then((r) => r.json())
  .then((data) => {
    const el = document.getElementById('result');
    el.innerHTML = '';

    if (data.authenticated) {
      const body = document.createElement('p');
      body.append("You're signed in as tenant ");
      const tenantSpan = document.createElement('span');
      tenantSpan.className = 'label';
      tenantSpan.textContent = data.tenantId;
      tenantSpan.title = data.tenantId;
      body.appendChild(tenantSpan);
      body.append('.');
      el.appendChild(body);
    } else {
      const body = document.createElement('p');
      body.textContent = 'Sign in with your company SSO to continue.';
      el.appendChild(body);

      const loginLink = document.createElement('a');
      loginLink.className = 'cta';
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
    const el = document.getElementById('result');
    el.innerHTML = '';
    const errEl = document.createElement('p');
    errEl.className = 'error';
    errEl.textContent = `Error: ${err.message}`;
    el.appendChild(errEl);
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
