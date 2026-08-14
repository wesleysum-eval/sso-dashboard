// Document assembler (Option A, 2026-08-13).
//
// The LLM now returns ONLY <body> content. This module wraps that content in a
// document whose <head> is entirely server-authored: doctype, charset,
// viewport, font links, the Chart.js script tag, the injected stylesheet, and
// the Chart.js dark-theme defaults.
//
// Security consequence, and it is a strict improvement: because the server
// owns the whole head, model output no longer has any legitimate reason to
// contain <link>, <meta>, <style>, or <script src>. validateBodyContent()
// below rejects all of them outright, which is tighter than the narrow
// Google-Fonts and benign-<meta> exceptions the previous single-shot pipeline
// had to carve into html-sanitizer.js.
//
// Performance consequence: the model no longer retypes ~8KB of CSS per report.
// That CSS was ~40% of the 34,927 completion tokens measured in the first live
// run, which is what pushed compose past every available request timeout.

import { EDITORIAL_DARK_CSS } from '../briefs/editorial-dark.js';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700' +
  '&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';

const CHARTJS_SRC = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';

// Chart.js dark-theme defaults, applied once before any model-authored chart
// script runs. The model is told these are already set, so it only supplies
// per-chart data and colours.
const CHART_DEFAULTS = `
if (typeof Chart !== 'undefined') {
  Chart.defaults.color = '#b6b1a2';
  Chart.defaults.borderColor = '#2a2c29';
  Chart.defaults.font.family = "'JetBrains Mono', ui-monospace, monospace";
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.tooltip.backgroundColor = '#1c1e1c';
  Chart.defaults.plugins.tooltip.borderColor = '#33352f';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.titleColor = '#f4efe0';
  Chart.defaults.plugins.tooltip.bodyColor = '#eae6d9';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.displayColors = false;
}
`;

// Structures the model must not emit, now that the server owns the head.
// Rejecting rather than stripping keeps the fail-closed discipline used
// everywhere else in this codebase.
const FORBIDDEN_IN_BODY = [
  { re: /<!DOCTYPE/i, reason: 'doctype' },
  { re: /<html\b/i, reason: 'html_tag' },
  { re: /<head\b/i, reason: 'head_tag' },
  { re: /<body\b/i, reason: 'body_tag' },
  { re: /<style\b/i, reason: 'style_tag' },
  { re: /<link\b/i, reason: 'link_tag' },
  { re: /<meta\b/i, reason: 'meta_tag' },
  { re: /<base\b/i, reason: 'base_tag' },
  // A <script> with any src attribute. Inline <script> blocks are expected
  // (that is how charts are initialised) and are checked by html-sanitizer.js
  // against the forbidden-API list once the document is assembled.
  { re: /<script\b[^>]*\bsrc\s*=/i, reason: 'script_src' },
];

// validateBodyContent(content) -> { ok: true, content } | { ok: false, reason }
//
// Runs before assembly so a malformed response is rejected while the failure
// is still cheap to attribute.
export function validateBodyContent(content) {
  if (typeof content !== 'string') return { ok: false, reason: 'not_a_string' };

  const trimmed = content.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > 120_000) return { ok: false, reason: 'too_large' };
  if (!/<[a-z]/i.test(trimmed)) return { ok: false, reason: 'no_html_tags' };

  for (const { re, reason } of FORBIDDEN_IN_BODY) {
    if (re.test(trimmed)) return { ok: false, reason: 'body_contains_' + reason };
  }

  return { ok: true, content: trimmed };
}

// Strips a markdown fence if the model wrapped its output despite instructions.
// Trims again afterwards so a fenced block does not leave a trailing newline
// in the assembled document.
export function stripFence(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/^```(?:html)?[ \t]*\r?\n?/i, '')
    .replace(/\r?\n?[ \t]*```$/, '')
    .trim();
}

// assembleDocument(bodyContent, meta) -> full HTML document string.
//
// `meta.title` is used for <title> only. It is escaped, but note the escaping
// is belt-and-braces: the value originates server-side, not from the model.
function escapeText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function assembleDocument(bodyContent, meta) {
  const title = escapeText((meta && meta.title) || 'Traffic Report');

  // Ordering matters and is easy to get wrong: the model places its chart
  // initialisation <script> at the END of its body content, so the defaults
  // block must be emitted BEFORE the body — otherwise `new Chart(...)` runs
  // first and the dark theme never applies. The Chart.js <script src> is not
  // deferred, so it is fully evaluated by the time the defaults block runs.
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="color-scheme" content="dark">',
    `<title>${title}</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link href="${FONTS_HREF}" rel="stylesheet">`,
    `<script src="${CHARTJS_SRC}"></script>`,
    '<script>',
    CHART_DEFAULTS,
    '</script>',
    '<style>',
    EDITORIAL_DARK_CSS,
    '</style>',
    '</head>',
    '<body>',
    bodyContent,
    '</body>',
    '</html>',
  ].join('\n');
}
