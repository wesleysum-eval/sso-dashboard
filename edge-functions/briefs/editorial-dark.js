// "Editorial dark" design system, split into two exports (Option A, 2026-08-13).
//
// WHY THE SPLIT
// The first working end-to-end agent run took 211 seconds and emitted 34,927
// completion tokens, because the LLM was retyping ~8KB of CSS on every single
// report. EdgeOne Edge Functions cannot hold a request open that long
// (documented limit: lightweight/200ms CPU; even Node Functions cap at 120s),
// so every run died regardless of the configured timeout.
//
// The CSS is OURS — it never varies between reports — so making the model
// reproduce it was pure waste. EDITORIAL_DARK_CSS is now injected server-side
// by document-assembler.js, and the LLM writes only the <body> content.
//
// Two consequences beyond speed, both improvements:
//   1. Visual consistency is now guaranteed rather than hoped for. The model
//      cannot drift the palette or forget a component style.
//   2. The server owns the entire <head>, so the sanitizer no longer needs to
//      permit <link> or <meta> from model output at all — a strictly tighter
//      posture than before.

// ---------------------------------------------------------------------------
// EDITORIAL_DARK_CSS — injected verbatim into the assembled document's <head>.
// Never sent to the LLM.
// ---------------------------------------------------------------------------
export const EDITORIAL_DARK_CSS = `
:root{
  --bg:#111211;--bg-2:#161816;--panel:#1c1e1c;--panel-2:#20221f;--panel-sunk:#0f100f;
  --line:#2a2c29;--line-2:#33352f;
  --ink:#eae6d9;--ink-bright:#f4efe0;--ink-dim:#b6b1a2;--ink-mute:#8a8778;
  --gold:#e7d27a;--gold-2:#c9b25a;--gold-soft:#3a3520;
  --red:#c85a4a;--red-soft:#4a2820;--green:#7fae6b;--green-soft:#2b3a26;
  --blue:#7aa8c9;--blue-soft:#2a3a46;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
section{max-width:1200px;margin:0 auto;padding:52px 32px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
@media(max-width:900px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr}}

.ribbon{background:var(--panel-2);border-bottom:1px solid var(--line);padding:14px 32px;display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--ink-dim);letter-spacing:.06em;text-transform:uppercase}
.brand{display:flex;align-items:baseline;gap:10px;color:var(--ink)}
.brand-name{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:18px;text-transform:none}
.brand-sub{font-size:9px;letter-spacing:.24em;color:var(--gold)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--gold);display:inline-block;margin-right:8px}
.verified{display:inline-flex;gap:6px;align-items:center;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--green)}
.verified::before{content:"\\25C6";color:var(--green)}

.hero{padding:64px 32px 36px;max-width:1100px;margin:0 auto;text-align:center}
.kicker{display:inline-block;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);border:1px solid var(--gold-soft);border-radius:999px;padding:6px 16px;margin-bottom:24px;background:rgba(231,210,122,.04)}
.hero h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:clamp(34px,5vw,60px);line-height:1.05;letter-spacing:-.02em;margin:0 0 20px;color:var(--ink-bright)}
.hero h1 em{font-style:italic;color:var(--gold)}
.hero .lede{max-width:760px;margin:0 auto;color:var(--ink-dim);font-size:16px;line-height:1.6}

.section-head{display:flex;align-items:baseline;gap:20px;margin-bottom:26px;border-bottom:1px solid var(--line);padding-bottom:16px}
.section-num{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:var(--gold);letter-spacing:.2em;min-width:34px}
.section-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;font-weight:500;color:var(--ink-bright);letter-spacing:-.01em;margin:0}
.section-sub{margin-left:auto;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute)}
.lead{font-size:15.5px;color:var(--ink-dim);max-width:880px;margin:0 0 24px}
.lead strong{color:var(--ink)}
.label{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute)}

.stat{background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:18px 20px}
.stat .k{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:10px}
.stat .v{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:clamp(28px,3vw,40px);line-height:1;color:var(--ink-bright);font-weight:500}
.stat .v .u{font-size:14px;color:var(--ink-mute);margin-left:6px;letter-spacing:.04em}
.stat .d{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;margin-top:10px;color:var(--ink-mute)}
.stat .d.up{color:var(--green)}
.stat .d.down{color:var(--red)}
.stat.accent{border-color:var(--gold-soft);background:var(--panel-2)}
.stat.accent .v{color:var(--gold)}

.panel{background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:20px 22px}
.panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.panel-title{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold)}
.panel-meta{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:var(--ink-mute)}
.chart-wrap{position:relative;height:280px}

.callout{background:rgba(200,90,74,.07);border:1px solid var(--red-soft);border-left:2px solid var(--red);border-radius:3px;padding:16px 20px}
.callout .lbl{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--red);margin-bottom:6px}
.callout h4{font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:var(--ink-bright);margin:0 0 6px;font-weight:600}
.callout p{color:var(--ink-dim);font-size:13.5px;margin:4px 0}
.callout.ok{background:rgba(127,174,107,.07);border-color:var(--green-soft);border-left-color:var(--green)}
.callout.ok .lbl{color:var(--green)}
.callout.info{background:rgba(122,168,201,.07);border-color:var(--blue-soft);border-left-color:var(--blue)}
.callout.info .lbl{color:var(--blue)}

table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-weight:500;color:var(--gold);font-size:11px;letter-spacing:.16em;text-transform:uppercase;padding:11px 14px;border-bottom:1px solid var(--line-2)}
td{padding:11px 14px;border-bottom:1px solid var(--line);color:var(--ink-dim)}
td strong{color:var(--ink)}
tr:last-child td{border-bottom:none}
th.num,td.num{text-align:right;font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--ink)}
tr.hi td{background:rgba(231,210,122,.05)}

.note{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:var(--ink-mute);border-left:1px solid var(--line-2);padding:2px 0 2px 12px;margin-top:12px;line-height:1.6}
.note b{color:var(--gold);font-weight:500}

.kv{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--line);border-radius:5px;background:var(--panel);overflow:hidden}
.kv .cell{flex:1 1 160px;padding:14px 18px;border-right:1px solid var(--line)}
.kv .cell:last-child{border-right:none}
.kv .k{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:6px}
.kv .v{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;color:var(--ink)}
.kv .v.ok{color:var(--green)}

.fact{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:var(--gold);background:var(--panel-sunk);border:1px solid var(--line);padding:2px 8px;border-radius:2px;display:inline-block}

footer{margin-top:56px;padding:34px 32px;border-top:1px solid var(--line);background:var(--bg-2);text-align:center;color:var(--ink-mute);font-size:11px;letter-spacing:.14em;text-transform:uppercase}
footer .mark{color:var(--gold)}
`;

// ---------------------------------------------------------------------------
// EDITORIAL_DARK_BRIEF — the only design text the LLM sees. Structure, class
// vocabulary, and voice. No CSS: every rule above is already applied, so the
// model composes by choosing the right class names.
// ---------------------------------------------------------------------------
export const EDITORIAL_DARK_BRIEF = `
# TASK

Write the BODY CONTENT of a dark editorial analytics report. A complete
stylesheet is ALREADY APPLIED — you only choose the right class names.

Return raw HTML body content only. Do NOT write <!DOCTYPE>, <html>, <head>,
<body>, <style>, <link>, <meta>, or <script src>. Do NOT write any CSS.
Start your output directly with <div class="ribbon">.

# LENGTH BUDGET (important)

Exactly 3 sections. Aim for 120-180 lines of HTML total. Be terse. A tight
3-section report is the goal; do not pad.

# STRUCTURE — IN THIS ORDER

1. Ribbon (first element):
<div class="ribbon">
  <div class="brand"><span class="brand-name">ZONE_NAME</span><span class="brand-sub">ZONE TRAFFIC</span></div>
  <div style="display:flex;gap:22px;align-items:center">
    <span><span class="dot"></span>Edge Analytics</span>
    <span class="verified mono">Snapshot TIMESTAMP</span>
  </div>
</div>

2. Hero — kicker pill, serif h1 with exactly ONE <em> gold emphasis phrase,
   then a lede paragraph stating the single key finding:
<div class="hero">
  <div class="kicker">Traffic Analysis</div>
  <h1>Plain statement of the finding with <em>the notable part italicised.</em></h1>
  <p class="lede">One or two sentences of concrete detail using the supplied numbers.</p>
</div>

3. Three <section> blocks. Each opens with a section-head, then a lead
   paragraph stating that section's finding, then its evidence:
<section>
  <div class="section-head">
    <div class="section-num">01</div>
    <h2 class="section-title">Short noun phrase</h2>
    <div class="section-sub">OPTIONAL META</div>
  </div>
  <p class="lead">The finding, with numbers.</p>
  ...evidence...
</section>

4. Footer, containing the snapshot timestamp:
<footer>Generated from live zone telemetry <span class="mark">&#9670;</span> <span class="mono">TIMESTAMP</span></footer>

# COMPONENT VOCABULARY — use these exact class names

Stat grid (2-4 per row; use grid-2 / grid-3 / grid-4):
<div class="grid-3">
  <div class="stat"><div class="k">Total Requests</div><div class="v">12,480</div><div class="d">across 24 intervals</div></div>
  <div class="stat accent"><div class="k">Peak Outbound</div><div class="v">38<span class="u">MB</span></div><div class="d up">at 12:55</div></div>
</div>
Use "stat accent" for the single most important number. Add class "up" or
"down" to the .d line when it describes a direction.

Chart panel — canvas MUST be wrapped in .chart-wrap:
<div class="panel">
  <div class="panel-head"><div class="panel-title">Requests per Interval</div><div class="panel-meta">last 24h</div></div>
  <div class="chart-wrap"><canvas id="c1"></canvas></div>
</div>

Callout for an anomaly (variants: default = alert, .ok = healthy, .info):
<div class="callout">
  <div class="lbl">&#9670; Anomaly</div>
  <h4>Short claim</h4>
  <p>The evidence, with numbers.</p>
</div>

Data table — numeric columns ALWAYS get class="num"; highlight at most one
row with class="hi":
<table>
  <thead><tr><th>Interval</th><th class="num">Outbound</th></tr></thead>
  <tbody><tr><td>12:50</td><td class="num">30.1 MB</td></tr></tbody>
</table>

Inline annotation — place one directly under the chart it explains:
<div class="note"><b>12:55</b> &mdash; 38 MB outbound, 1.9x the interval median.</div>

Key-value strip for zone metadata:
<div class="kv">
  <div class="cell"><div class="k">Zone</div><div class="v">example.com</div></div>
  <div class="cell"><div class="k">Status</div><div class="v ok">Active</div></div>
</div>

Inline fact chip for a single number inside prose:
<span class="fact">38 MB</span>

# CHARTS

Include at most 2 charts. For each, add ONE plain <script> block (no src
attribute) at the very end of your output, after the footer. Initialise
directly — no setTimeout, no setInterval, no DOMContentLoaded, no
requestAnimationFrame. Chart.js 4.5.1 and these defaults are already loaded:
color #b6b1a2, borderColor #2a2c29, mono font family.

<script>
new Chart(document.getElementById('c1'),{type:'line',data:{labels:[...],datasets:[{data:[...],borderColor:'#e7d27a',backgroundColor:'rgba(231,210,122,0.08)',fill:true,borderWidth:2,tension:0.3,pointRadius:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{grid:{color:'rgba(255,255,255,0.04)'}},x:{grid:{display:false},ticks:{maxTicksLimit:8}}}}});
</script>

Use labels from the supplied ts_local values and data from the supplied raw
values. Bar charts: borderRadius 4, no border.

# HARD RULES

- Every visible number MUST come from the supplied FACTS. Never compute a new
  number. Never invent a percentage, total, average, or comparison figure.
- Use the pre-formatted strings for display and the raw values for chart data.
- NO <form>, <input>, <button>, <select>, <textarea>, <iframe>, <object>,
  <embed>, <audio>, <video>, <link>, <meta>, <style>.
- NO on* event handler attributes. NO javascript: URIs.
- NO eval, Function(, setTimeout(, setInterval(, XMLHttpRequest, WebSocket,
  fetch(, postMessage, localStorage, sessionStorage, document.cookie,
  parent., top., opener.
- Inline style="" is allowed only for one-off layout nudges (as in the ribbon
  example). Never redefine a component's look.

# VOICE

Analytical, calm, specific — an analyst's memo, not a product page.
Every lede and lead states a FINDING, not a description of the chart.
  Write: "Traffic held steady near 30 MB per interval, with one 38 MB outlier at 12:55."
  Not:   "This chart shows traffic over time."
No marketing language. Never "impressive", "significant", "dramatic", or
"massive" unless a supplied number sits immediately beside it.
Small-caps labels are terse noun phrases: "PEAK OUTBOUND", not sentences.
If the data is unremarkable, say so plainly — a quiet period reported
honestly is more useful than manufactured drama.
`;
