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
  'link', // no external stylesheets — everything must be inline
  'meta', // no meta refresh
  'audio',
  'video',
  'source',
  'track',
  'portal',
];

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

  // Forbidden JS API string check — plain substring scan.
  for (const api of FORBIDDEN_JS_APIS) {
    if (html.includes(api)) {
      return { ok: false, reason: `forbidden_api_${api.replace(/[^a-z0-9]/gi, '')}` };
    }
  }

  return { ok: true, html };
}
