// Defensive HTML sanitizer for LLM-authored dashboard content (Phase 5).
//
// Threat model:
//   The generated HTML runs inside an iframe with sandbox="allow-scripts"
//   and a strict CSP. The sandbox is the primary defense — it prevents
//   cookie/localStorage access, prevents same-origin fetch, prevents
//   parent-window access. This sanitizer is defense-in-depth: we still
//   reject obviously malicious patterns before storing or serving them,
//   so a compromised LLM key cannot poison the KV with visible garbage,
//   and so any accidental exfil pattern (e.g. img-src to a tracker) fails
//   fast rather than silently.
//
// This is NOT a full HTML parser (unavailable on the edge runtime). It is
// a string-scanning fail-closed validator: any hit on the blocklist
// causes the whole document to be rejected — never silently rewritten.
// A "clean" pass never modifies the HTML; the return value is the input
// verbatim.

// Elements that must not appear anywhere. Even inside the sandbox some of
// these can cause user confusion (fake login forms) or leak data
// (unallowlisted iframes/objects).
const FORBIDDEN_TAGS = [
  'form',
  'input',
  'button', // buttons can wire onclick handlers that look real; the dashboard is read-only
  'select',
  'textarea',
  'iframe',
  'object',
  'embed',
  'applet',
  'base',
  // NOTE: 'link' is deliberately NOT in this list. It is handled separately
  // by findDisallowedLink() below, which permits <link> only when every
  // occurrence points at a Google Fonts host. The editorial-dark design
  // brief requires those font links, so a blanket ban would reject every
  // generated report. Any other <link> (stylesheet or prefetch to an
  // arbitrary host, import, etc.) still fails closed.
  // NOTE: 'meta' is deliberately NOT in this list. It is handled separately
  // by findDisallowedMeta() below, which permits only the benign document
  // metadata tags (charset, viewport, and a small set of name= values) and
  // still rejects http-equiv entirely — that is the actually-dangerous form
  // (meta refresh / CSP override). A blanket ban would reject
  // <meta charset="UTF-8">, which every valid generated document needs.
  'audio',
  'video',
  'source',
  'track',
  'portal',
];

// Hosts permitted in a <link href="...">. Font delivery only — these cannot
// execute script, and the iframe's style-src/font-src CSP directives scope
// them independently, so this is a narrow auditable exception, not a hole.
const ALLOWED_LINK_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// `name` values permitted on a <meta> tag. Everything else, and any
// http-equiv at all, is rejected.
const ALLOWED_META_NAMES = ['viewport', 'description', 'author', 'color-scheme', 'theme-color'];



// Attribute patterns that indicate JS handlers or dangerous URIs.
// We reject the entire document if any of these appear.
const FORBIDDEN_ATTR_PATTERNS = [
  /\son[a-z]+\s*=/i, // any on* event handler attribute
  /javascript\s*:/i, // javascript: protocol
  /vbscript\s*:/i,
  /data\s*:\s*(?:text\/html|application\/x-javascript)/i,
];

// Only these hosts may appear in <script src="..."> — matches the CSP.
// Everything else is rejected.
const ALLOWED_SCRIPT_HOSTS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
];

// APIs that must not appear anywhere in the JS body. The sandbox already
// blocks the network-facing ones, but rejecting them at ingestion means
// a saved dashboard never even attempts them, which keeps CSP-violation
// noise out of the console.
const FORBIDDEN_JS_APIS = [
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'importScripts',
  'ServiceWorker',
  'SharedArrayBuffer',
  'postMessage', // sandbox blocks it but no reason to invite trouble
  'parent.',
  'top.',
  'opener',
  'localStorage',
  'sessionStorage',
  'document.cookie',
  'document.domain',
  'eval(',
  'Function(',
  'setTimeout(', // no strings-as-code paths — arrow-function version is fine but harder to allow-list without a parser; ban for safety
  'setInterval(',
];

// Cheap check for <script src="..."> to an unallowlisted host.
// Runs before FORBIDDEN_JS_APIS so a violating external script fails with
// a specific reason instead of getting caught later.
function findDisallowedExternalScript(html) {
  const re = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[1] || m[2] || m[3] || '';
    // Data URIs, blob URIs, and javascript: are all rejected. Only
    // absolute https URLs on the allowlisted hosts are OK.
    try {
      const url = new URL(src);
      if (url.protocol !== 'https:') return src;
      if (!ALLOWED_SCRIPT_HOSTS.includes(url.hostname)) return src;
    } catch {
      // Not a parseable URL (relative path, data URI, etc.) — reject.
      return src;
    }
  }
  return null;
}

// Cheap check for a <meta> tag that is anything other than benign document
// metadata. Returns a short description of the offending tag, or null when
// every <meta> is permitted (or there are none).
//
// Rules:
//   - `http-equiv` in ANY form is rejected. This is the dangerous variant
//     (refresh-based navigation, Content-Security-Policy override) and there
//     is no legitimate need for it in a generated report.
//   - `charset` alone is always permitted.
//   - `name` is permitted only when its value is in ALLOWED_META_NAMES.
//   - A <meta> with neither charset, name, nor http-equiv is rejected as
//     unrecognized rather than waved through.
function findDisallowedMeta(html) {
  const re = /<meta\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';

    if (/\bhttp-equiv\s*=/i.test(attrs)) return 'http-equiv';

    const hasCharset = /\bcharset\s*=/i.test(attrs);
    const nameMatch = attrs.match(/\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);

    if (nameMatch) {
      const name = (nameMatch[1] || nameMatch[2] || nameMatch[3] || '').toLowerCase();
      if (!ALLOWED_META_NAMES.includes(name)) return 'name=' + name;
      continue;
    }

    if (hasCharset) continue;

    return 'unrecognized meta';
  }
  return null;
}

// Cheap check for <link href="..."> pointing anywhere other than a Google
// Fonts host. Returns the offending href, or null when every <link> is a
// permitted font link (or there are none at all).
//
// A <link> with no href at all is treated as a violation: it has no
// legitimate purpose in a generated report, and silently allowing it would
// widen the exception beyond fonts.
function findDisallowedLink(html) {
  const re = /<link\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!hrefMatch) return '(link without href)';
    const href = hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || '';
    try {
      const url = new URL(href);
      if (url.protocol !== 'https:') return href;
      if (!ALLOWED_LINK_HOSTS.includes(url.hostname)) return href;
    } catch {
      // Relative path, data URI, protocol-relative //host — all rejected.
      return href;
    }
  }
  return null;
}

// sanitizeHtml(html) -> { ok: true, html } | { ok: false, reason }

//
// Fail-closed: any single rule violation rejects the whole document.
// Never mutates the HTML — this is a validator, not a rewriter.
// The reason string is diagnostic only; generate-html.js never returns
// it to the client (D-08 no-leak convention).
export function sanitizeHtml(html) {
  if (typeof html !== 'string') return { ok: false, reason: 'not_a_string' };
  if (html.length === 0) return { ok: false, reason: 'empty' };
  if (html.length > 200_000) return { ok: false, reason: 'too_large' };

  // Must look like an HTML document. We do NOT require <!DOCTYPE> because
  // srcdoc-loaded content is often just a fragment, but we do require
  // either a <body> or at least an opening tag as a sanity gate.
  if (!/<[a-z]/i.test(html)) return { ok: false, reason: 'no_html_tags' };

  // Forbidden tags — match opening tag start to avoid matching, say, the
  // string "form" inside a comment. Case-insensitive.
  for (const tag of FORBIDDEN_TAGS) {
    const re = new RegExp(`<${tag}\\b`, 'i');
    if (re.test(html)) {
      return { ok: false, reason: `forbidden_tag_${tag}` };
    }
  }

  // Forbidden attribute patterns.
  for (const re of FORBIDDEN_ATTR_PATTERNS) {
    if (re.test(html)) {
      return { ok: false, reason: `forbidden_attr_pattern` };
    }
  }

  // External script source check.
  const disallowedSrc = findDisallowedExternalScript(html);
  if (disallowedSrc !== null) {
    return { ok: false, reason: 'disallowed_script_src' };
  }

  // <link> is permitted for Google Fonts only (see ALLOWED_LINK_HOSTS).
  const disallowedLink = findDisallowedLink(html);
  if (disallowedLink !== null) {
    return { ok: false, reason: 'disallowed_link_href' };
  }

  // <meta> is permitted only as benign document metadata; http-equiv in any
  // form is rejected (see findDisallowedMeta).
  const disallowedMeta = findDisallowedMeta(html);
  if (disallowedMeta !== null) {
    return { ok: false, reason: 'disallowed_meta' };
  }

  // Forbidden JS API string check — plain substring scan.
  for (const api of FORBIDDEN_JS_APIS) {
    if (html.includes(api)) {
      return { ok: false, reason: `forbidden_api_${api.replace(/[^a-z0-9]/gi, '')}` };
    }
  }

  return { ok: true, html };
}
