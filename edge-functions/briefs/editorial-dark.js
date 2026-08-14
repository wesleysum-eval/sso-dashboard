export const EDITORIAL_DARK_BRIEF = `
# DESIGN BRIEF — "EDITORIAL DARK" CDN TRAFFIC DASHBOARD

You are producing a single self-contained dark-themed HTML dashboard. Follow this brief exactly.
Where CSS or HTML is given, copy it verbatim rather than reinventing it.

## 1. DESIGN PHILOSOPHY

Dark, warm-neutral, editorial — a printed analyst dossier rendered on screen, not a control panel.
Treat the data as narrative: each section makes one claim and shows the evidence for it.
Restraint is the aesthetic. Thin 1px borders, generous padding, no gradients on content, no shadows,
no rounded blobs, no emoji, no decorative icons beyond a single diamond glyph.

## 2. CSS CUSTOM PROPERTIES — COPY VERBATIM

:root{
  --bg:#111211;          /* page */
  --bg-2:#161816;        /* footer / recessed bands */
  --panel:#1c1e1c;       /* default panel */
  --panel-2:#20221f;     /* raised / emphasised panel */
  --panel-sunk:#0f100f;  /* inset chips, code, table zebra */
  --line:#2a2c29;        /* subtle line */
  --line-2:#33352f;      /* stronger line, table header rule */
  --ink:#eae6d9;         /* primary warm off-white */
  --ink-bright:#f4efe0;  /* headings only */
  --ink-dim:#b6b1a2;     /* body prose */
  --ink-mute:#8a8778;    /* small-caps labels, meta */
  --gold:#e7d27a;        /* accent, section numbers, key metrics */
  --gold-2:#c9b25a;      /* secondary accent */
  --gold-soft:#3a3520;   /* gold-tinted border */
  --red:#c85a4a;         /* alert / spike */
  --red-soft:#4a2820;
  --green:#7fae6b;       /* healthy / verified */
  --green-soft:#2b3a26;
  --blue:#7aa8c9;        /* informational */
  --blue-soft:#2a3a46;
}

Fill rules: page background var(--bg). Panels var(--panel) with 1px solid var(--line), border-radius 5px.
Semantic tints are always rgba over the panel, never a solid saturated block:
red tint rgba(200,90,74,.07), green tint rgba(127,174,107,.07), blue tint rgba(122,168,201,.07),
gold tint rgba(231,210,122,.05).

## 3. TYPOGRAPHY

Include exactly this in <head>:

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

Roles — do not mix these up:
- 'Cormorant Garamond', serif — hero h1, section titles, panel h3, pull quotes. Weight 500/600. Letter-spacing -.01em to -.02em.
- 'Inter', sans-serif — body, lede, lead paragraphs, table cells, prose. Weight 300-500.
- 'JetBrains Mono', monospace — every numeral the reader is meant to compare, section numbers, small-caps labels' numeric parts, timestamps, axis ticks, inline annotations, deltas, table numeric columns.

Size scale:
- hero h1: clamp(34px,5vw,60px) / line-height 1.05
- section-title: 30px
- panel h3: 20px
- stat number (mono): clamp(28px,3vw,40px) / line-height 1
- lede: 16px / 1.6
- lead: 15.5px
- body: 14px, secondary body 13px
- small-caps label: 11px
- mono meta / annotation: 11-12px

Small-caps label treatment — use this everywhere a label sits above data:
.label{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute)}
Gold variant for eyebrows inside panels: same rules, font-size 10px, letter-spacing .24em, color var(--gold).

Base body CSS:
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);font-family:'Inter',system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',monospace}
section{max-width:1200px;margin:0 auto;padding:52px 32px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
@media(max-width:900px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr}}

## 4. REQUIRED PAGE STRUCTURE — IN THIS ORDER

### 4.1 .ribbon (mandatory, first element in body)
Left: brand / zone label. Right: a verified-style badge carrying the snapshot timestamp.

.ribbon{background:var(--panel-2);border-bottom:1px solid var(--line);padding:14px 32px;display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--ink-dim);letter-spacing:.06em;text-transform:uppercase}
.brand{display:flex;align-items:baseline;gap:10px;color:var(--ink)}
.brand-name{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:18px;text-transform:none}
.brand-sub{font-size:9px;letter-spacing:.24em;color:var(--gold)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--gold);display:inline-block;margin-right:8px}
.verified{display:inline-flex;gap:6px;align-items:center;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--green)}
.verified::before{content:"\\25C6";color:var(--green)}

<div class="ribbon">
  <div class="brand"><span class="brand-name">example.com</span><span class="brand-sub">ZONE TRAFFIC</span></div>
  <div style="display:flex;gap:22px;align-items:center">
    <span><span class="dot"></span>Edge Analytics</span>
    <span class="verified mono">Snapshot 2026-08-13 14:20 UTC</span>
  </div>
</div>

### 4.2 .hero
.kicker pill, serif h1 with exactly one italic gold emphasis phrase, then a .lede stating the key finding in plain language.

.hero{padding:64px 32px 36px;max-width:1100px;margin:0 auto;text-align:center}
.kicker{display:inline-block;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);border:1px solid var(--gold-soft);border-radius:999px;padding:6px 16px;margin-bottom:24px;background:rgba(231,210,122,.04)}
.hero h1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:clamp(34px,5vw,60px);line-height:1.05;letter-spacing:-.02em;margin:0 0 20px;color:var(--ink-bright)}
.hero h1 em{font-style:italic;color:var(--gold)}
.hero .lede{max-width:760px;margin:0 auto;color:var(--ink-dim);font-size:16px;line-height:1.6}

<div class="hero">
  <div class="kicker">Traffic Analysis</div>
  <h1>Steady outbound volume with <em>one unexplained 12:55 spike.</em></h1>
  <p class="lede">Requests held between 410 and 480 per interval across the window; egress tracked requests closely except at 12:55, where bytes rose without a matching request increase.</p>
</div>

### 4.3 Numbered sections
Every <section> opens with a .section-head: mono gold .section-num ("01", "02", ...), serif .section-title, optional right-aligned .section-sub. Then a .lead paragraph stating the finding. Then panels/charts.

.section-head{display:flex;align-items:baseline;gap:20px;margin-bottom:26px;border-bottom:1px solid var(--line);padding-bottom:16px}
.section-num{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--gold);letter-spacing:.2em;min-width:34px}
.section-title{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:500;color:var(--ink-bright);letter-spacing:-.01em;margin:0}
.section-sub{margin-left:auto;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute)}
.lead{font-size:15.5px;color:var(--ink-dim);max-width:880px;margin:0 0 24px}
.lead strong{color:var(--ink)}

<div class="section-head">
  <div class="section-num">01</div>
  <h2 class="section-title">Volume and shape</h2>
  <div class="section-sub">5-minute intervals</div>
</div>

### 4.4 Footer
footer{margin-top:56px;padding:34px 32px;border-top:1px solid var(--line);background:var(--bg-2);text-align:center;color:var(--ink-mute);font-size:11px;letter-spacing:.14em;text-transform:uppercase}
footer .mark{color:var(--gold)}
Include the snapshot timestamp in mono in the footer.

## 5. COMPONENT PATTERNS

### Stat block + stat grid
.stat{background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:18px 20px}
.stat .k{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:10px}
.stat .v{font-family:'JetBrains Mono',monospace;font-size:clamp(28px,3vw,40px);line-height:1;color:var(--ink-bright);font-weight:500}
.stat .v .u{font-size:14px;color:var(--ink-mute);margin-left:6px;letter-spacing:.04em}
.stat .d{font-family:'JetBrains Mono',monospace;font-size:11px;margin-top:10px;color:var(--ink-mute)}
.stat .d.up{color:var(--green)} .stat .d.down{color:var(--red)}
.stat.accent{border-color:var(--gold-soft);background:var(--panel-2)}
.stat.accent .v{color:var(--gold)}

<div class="grid-4">
  <div class="stat"><div class="k">Total Requests</div><div class="v">12,480</div><div class="d">across 24 intervals</div></div>
  <div class="stat accent"><div class="k">Peak Outbound</div><div class="v">38<span class="u">MB</span></div><div class="d up">at 12:55</div></div>
</div>
Use grid-2, grid-3, or grid-4. Never more than 4 stats per row.

### Chart panel
.panel{background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:20px 22px}
.panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.panel-title{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold)}
.panel-meta{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-mute)}
.chart-wrap{position:relative;height:280px}

<div class="panel">
  <div class="panel-head"><div class="panel-title">Requests per Interval</div><div class="panel-meta">12:00 - 14:00 UTC</div></div>
  <div class="chart-wrap"><canvas id="c1"></canvas></div>
</div>
Always wrap <canvas> in a fixed-height .chart-wrap. Never let a canvas size itself.

### Callout / alert box
.callout{background:rgba(200,90,74,.07);border:1px solid var(--red-soft);border-left:2px solid var(--red);border-radius:3px;padding:16px 20px}
.callout .lbl{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--red);margin-bottom:6px}
.callout h4{font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--ink-bright);margin:0 0 6px;font-weight:600}
.callout p{color:var(--ink-dim);font-size:13.5px;margin:4px 0}
.callout.ok{background:rgba(127,174,107,.07);border-color:var(--green-soft);border-left-color:var(--green)}
.callout.ok .lbl{color:var(--green)}
.callout.info{background:rgba(122,168,201,.07);border-color:var(--blue-soft);border-left-color:var(--blue)}
.callout.info .lbl{color:var(--blue)}

<div class="callout">
  <div class="lbl">\\25C6 Anomaly</div>
  <h4>Egress spike without request growth</h4>
  <p>At 12:55 outbound reached 38 MB while requests stayed at 452 — consistent with a small number of large object responses.</p>
</div>

### Data table
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-weight:500;color:var(--gold);font-size:11px;letter-spacing:.16em;text-transform:uppercase;padding:11px 14px;border-bottom:1px solid var(--line-2)}
td{padding:11px 14px;border-bottom:1px solid var(--line);color:var(--ink-dim)}
td strong{color:var(--ink)}
tr:last-child td{border-bottom:none}
th.num,td.num{text-align:right;font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;color:var(--ink)}
tr.hi td{background:rgba(231,210,122,.05)}
Numeric columns always get class="num". Highlight at most one row with class="hi".

### Inline annotation
.note{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-mute);border-left:1px solid var(--line-2);padding:2px 0 2px 12px;margin-top:12px;line-height:1.6}
.note b{color:var(--gold);font-weight:500}
<div class="note"><b>12:55</b> — 38 MB outbound, 1.9x the interval median.</div>
Place one .note directly beneath the chart it explains. One or two lines maximum.

### Key-value strip
.kv{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--line);border-radius:5px;background:var(--panel);overflow:hidden}
.kv .cell{flex:1 1 160px;padding:14px 18px;border-right:1px solid var(--line)}
.kv .cell:last-child{border-right:none}
.kv .k{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:6px}
.kv .v{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--ink)}
.kv .v.ok{color:var(--green)}
<div class="kv">
  <div class="cell"><div class="k">Zone</div><div class="v">example.com</div></div>
  <div class="cell"><div class="k">Status</div><div class="v ok">Active</div></div>
  <div class="cell"><div class="k">Plan</div><div class="v">Enterprise</div></div>
</div>

### Inline fact chip (for a single number inside prose)
.fact{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--gold);background:var(--panel-sunk);border:1px solid var(--line);padding:2px 8px;border-radius:2px;display:inline-block}

## 6. CHART.JS RULES

Load exactly: <script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
Set defaults once, before any chart:

Chart.defaults.color = '#8a8778';
Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 10;

Shared options object to reuse:

const baseOpts = {
  responsive:true, maintainAspectRatio:false,
  interaction:{mode:'index', intersect:false},
  plugins:{
    legend:{display:false},
    tooltip:{
      backgroundColor:'#1c1e1c', borderColor:'#33352f', borderWidth:1,
      titleColor:'#eae6d9', bodyColor:'#b6b1a2', padding:10, cornerRadius:3,
      displayColors:false,
      titleFont:{family:"'JetBrains Mono', monospace", size:11},
      bodyFont:{family:"'JetBrains Mono', monospace", size:11}
    }
  },
  scales:{
    x:{ grid:{display:false, drawBorder:false},
        ticks:{color:'#8a8778', maxTicksLimit:8, maxRotation:0, autoSkip:true} },
    y:{ beginAtZero:true,
        grid:{color:'rgba(255,255,255,0.04)', drawTicks:false},
        border:{display:false},
        ticks:{color:'#8a8778', maxTicksLimit:5, padding:8} }
  }
};

Rules:
- Legend hidden whenever there is only one dataset. Show it only for multi-series, and then:
  legend:{display:true, position:'top', align:'end', labels:{boxWidth:8, boxHeight:8, color:'#b6b1a2', font:{size:10}}}
- Line charts: borderWidth:2, tension:0.3, pointRadius:0, pointHoverRadius:4,
  fill:true, borderColor:'#e7d27a', backgroundColor:'rgba(231,210,122,0.08)'.
  Second series uses borderColor:'#7aa8c9', backgroundColor:'rgba(122,168,201,0.08)'.
  Alert series uses '#c85a4a' / 'rgba(200,90,74,0.08)'.
- Bar charts: borderRadius:4, borderWidth:0, backgroundColor:'rgba(231,210,122,0.55)',
  hoverBackgroundColor:'#e7d27a', maxBarThickness:34. Grid on y only.
- Doughnut: cutout:'70%', borderWidth:0, borderColor:'transparent',
  palette in order ['#e7d27a','#7aa8c9','#7fae6b','#c85a4a','#c9b25a','#8a8778']. Legend on the right.
- No vertical grid lines on any time series. No gradients. No shadows. No animation config needed.
- Never draw more than 3 charts on the page. Prefer one strong chart per section.

## 7. HARD CONSTRAINTS — OBEY EXACTLY

- Return ONLY the HTML document, starting with <!DOCTYPE html>. No markdown fences, no commentary.
- NO <form>, <input>, <button>, <iframe>, <object>, <embed>, <audio>, <video>.
- NO on* event handler attributes. NO javascript: URIs.
- NO eval, Function(, setTimeout(, setInterval(, XMLHttpRequest, WebSocket, fetch(, postMessage, localStorage, sessionStorage, document.cookie, parent., top., opener.
- Scripts may ONLY load from https://cdn.jsdelivr.net. Google Fonts via <link> is allowed — this is stated explicitly because <link> is otherwise restricted: font <link> tags pointing at fonts.googleapis.com and fonts.gstatic.com are the SOLE permitted exception. Every font <link> MUST use an absolute https:// URL — never a protocol-relative //fonts.googleapis.com and never http://.
- <meta> is restricted. Permitted: <meta charset="UTF-8"> and <meta name="..."> where name is one of viewport, description, author, color-scheme, theme-color. FORBIDDEN: any http-equiv attribute at all, and any other name value. A <meta> with no attributes is also rejected.
- Every visible number MUST come from the supplied FACTS. Never compute a new number. Never invent a percentage, total, or average.
- Use inline <style> only — no external stylesheets other than the Google Fonts link.
- Charts must be initialised with a plain inline <script> block that calls new Chart(...) directly. Do NOT wrap initialisation in setTimeout, setInterval, requestAnimationFrame, or a DOMContentLoaded listener — place the <script> at the end of <body> so the canvas elements already exist.

## 8. WRITING VOICE

- Analytical, calm, specific — a good analyst's memo, not a product page.
- Every section's lede must state a FINDING, not describe the chart.
  Write: "Traffic held steady near 30 MB per interval, with one 38 MB outlier at 12:55."
  Not: "This chart shows traffic over time."
- No marketing language. Never write "impressive", "significant", "dramatic", or "massive"
  unless a supplied number sits immediately beside it.
- If the facts do not support a conclusion, say what the data does not show rather than guessing.
- Small-caps labels are terse noun phrases: "PEAK OUTBOUND", "MEDIAN LATENCY", "CACHE HIT RATE".
  Never a sentence, never a question, never a verb.
- Section titles are short and declarative, sentence case, serif: "Volume and shape",
  "Where the bytes went", "The 12:55 outlier".
- One italic gold emphasis phrase in the hero h1. Exactly one. Nowhere else.
`;
