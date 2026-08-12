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
  })
  .catch((err) => {
    document.getElementById('result').textContent = `Error: ${err.message}`;
  });
