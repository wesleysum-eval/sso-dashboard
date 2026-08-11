fetch('/api/status')
  .then((r) => r.json())
  .then((data) => {
    const el = document.getElementById('result');
    el.textContent =
      `hasConfig: ${data.hasConfig} | kvBound: ${data.kvBound} | ts: ${data.ts}`;
  })
  .catch((err) => {
    document.getElementById('result').textContent = `Error: ${err.message}`;
  });
