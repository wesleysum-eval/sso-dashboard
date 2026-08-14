// Fact-verifier: extract every visible numeric value from LLM-generated
// HTML and check each against the trusted allowlist produced by
// data-facts.js's computeFacts(). Any number not in the allowlist is
// treated as a hallucination and the response is rejected.
//
// This is the answer to "the LLM might write '2.94 TB' when the real
// number is 2.5 TB" — the pre-computed facts declare what numbers are
// legal, and anything else fails the check.
//
// This is not a perfect defense — a determined LLM could rearrange the
// digits of a real value to say something misleading in prose ("traffic
// dropped 90%" when it actually rose 10%). Combined with strict
// prompting and the injected fact table, the risk is small in practice.
// But this catches the most common failure: raw numeric fabrication.

// Extract all numeric literals from visible text and inline JS.
// Skips numbers inside common structural contexts that aren't user-
// facing (e.g. font-size, padding, viewBox, hex colors, chart config).
//
// Live-run finding (2026-08-13): the first end-to-end agent run failed
// verification on ["400","500","600","700","300"] — every one a CSS
// font-weight or a Google Fonts URL weight parameter, not fabricated
// data. The stripping below was extended to remove those contexts. The
// principle is unchanged: strip only contexts that provably cannot carry
// a data value, never relax the check on chart data arrays.
function extractDisplayedNumbers(html) {
  // Strip <style> block contents — CSS values are never data.
  let s = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  // Strip <head> contents entirely: font links, charset, viewport, title.
  // Nothing in <head> is a rendered data value.
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');

  // Strip any remaining <link> and <meta> tags (in case the document has
  // no explicit <head> wrapper). Google Fonts URLs carry ;wght@400;500;600
  // parameters that are otherwise read as data.
  s = s.replace(/<link\b[^>]*>/gi, '');
  s = s.replace(/<meta\b[^>]*>/gi, '');

  // Strip hex colors.
  s = s.replace(/#[0-9a-f]{3,8}\b/gi, '');

  // Strip CSS numeric contexts: a number immediately followed by a unit.
  s = s.replace(/-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|pt|pc|ch|ex|deg|rad|turn|s|ms|fr|dpi)\b/gi, '');

  // Strip rgb()/rgba()/hsl()/hsla() color functions.
  s = s.replace(/(?:rgba?|hsla?)\s*\([^)]*\)/gi, '');

  // Strip CSS functions whose arguments are layout math, not data.
  s = s.replace(/(?:clamp|calc|min|max|minmax|translate[XYZ]?|scale[XYZ]?|rotate[XYZ]?|cubic-bezier|repeat)\s*\([^)]*\)/gi, '');

  // Strip font-weight declarations and the numeric weights that follow a
  // font-family/font shorthand. These are the exact false positives seen
  // in the first live run.
  s = s.replace(/font-weight\s*:\s*\d+/gi, '');
  s = s.replace(/\bwght@[\d;,\s]+/gi, '');

  // Strip SVG geometry attributes — layout, never data.
  s = s.replace(
    /\b(?:viewBox|d|points|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|stroke-width|offset|opacity|stop-opacity|fill-opacity)\s*=\s*(?:"[^"]*"|'[^']*')/gi,
    '',
  );

  // Strip Chart.js styling options that take bare numbers. These are
  // presentation config, not data values. Deliberately narrow — an
  // explicit key list, so a `data:` array is never caught here.
  s = s.replace(
    /\b(?:borderWidth|borderRadius|tension|pointRadius|pointHoverRadius|barPercentage|categoryPercentage|maxTicksLimit|maxRotation|minRotation|padding|size|lineWidth|tickLength|barThickness|hoverBorderWidth|aspectRatio|duration|weight|order|z|left|right|top|bottom)\s*:\s*-?\d+(?:\.\d+)?/gi,
    '',
  );

  // Strip named CSS/Chart.js color-ish and font-ish string values that can
  // embed digits (e.g. "'JetBrains Mono', monospace" is fine, but a
  // font shorthand like "500 14px Inter" would leak a 500).
  s = s.replace(/font\s*:\s*[^;{}"']*/gi, '');
  // Thousands separators are handled by requiring the canonical shape:
  // 1-3 leading digits, then one or more ",ddd" groups, with no digit
  // immediately after the final group. `30000000,30000000` does NOT match
  // (8 leading digits), so it is correctly read as two separate numbers
  // rather than merged into "3000000030000000" — the naive `[.,]\d+`
  // pattern made exactly that mistake and failed a chart-data array whose
  // every element was approved (caught by the definitive test, 2026-08-13).
  //
  // Two alternations, grouped-first so it wins when both could match:
  //   1. \d{1,3}(?:,\d{3})+(?:\.\d+)?   e.g. 1,234  1,234,567  1,234.56
  //   2. \d+(?:\.\d+)?                  e.g. 30000000  36.2  0.3
  // A comma-decimal locale is deliberately unsupported: formatValue()
  // always emits '.' as the decimal mark.
  const numbers = [];
  const re = /-?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const clean = m[0].replace(/,/g, '');
    numbers.push(clean);
  }
  return numbers;
}

// Check if a candidate string represents a number that's "close enough"
// to any value in the allowlist. We accept exact match on the string
// form, and 0.5% relative tolerance on the numeric form (since the LLM
// may round differently than we do).
// Structural integers that routinely appear in presentational markup and
// carry no data meaning: CSS font weights, common z-index/opacity/radius
// multiples, and round layout numbers. Allowed unconditionally so a
// styling choice can never be mistaken for a fabricated metric.
//
// This list is deliberately explicit rather than a range: "any number
// under 1000 is fine" would let a genuinely fabricated small value (e.g.
// a made-up request count of 847) slip through.
const STRUCTURAL_INTEGERS = new Set([
  // CSS font weights
  100, 200, 300, 400, 500, 600, 700, 800, 900,
  // Common round layout / duration / z-index values
  1000, 1200, 1400, 1500, 1600, 1800, 2000, 2400, 3000,
  // Chart.js / CSS 8-bit color channel bounds
  255,
  // Year values that may appear in a footer date
  2024, 2025, 2026, 2027,
]);

function isAllowed(candidate, allowlist) {
  if (allowlist.has(candidate)) return true;
  const n = Number(candidate);
  if (!Number.isFinite(n)) return true; // not a real number, ignore
  // Small integers are always OK (index/count/day/hour/percent).
  if (Number.isInteger(n) && Math.abs(n) <= 100) return true;
  // Presentational structural integers (font weights, round layout values).
  if (Number.isInteger(n) && STRUCTURAL_INTEGERS.has(Math.abs(n))) return true;

  // Tolerance check against every allowlisted number. O(N*M) but N and
  // M are both small (< 300 total).
  for (const value of allowlist) {
    const v = Number(value);
    if (!Number.isFinite(v) || v === 0) continue;
    const diff = Math.abs(n - v) / Math.abs(v);
    if (diff <= 0.005) return true; // 0.5% tolerance
  }
  return false;
}

// verifyFacts(html, factsList) -> { ok: true } | { ok: false, reason,
// unexpected }
//
// factsList is an array of facts objects (one per widget/data source
// the pipeline fetched); their _numberAllowlist Sets are merged.
export function verifyFacts(html, factsList) {
  if (!Array.isArray(factsList) || factsList.length === 0) {
    return { ok: false, reason: 'no_facts' };
  }

  // Merge every fact's number allowlist into one Set.
  const allowlist = new Set();
  for (const facts of factsList) {
    if (facts && facts._numberAllowlist) {
      for (const n of facts._numberAllowlist) allowlist.add(n);
    }
  }

  const displayed = extractDisplayedNumbers(html);
  const unexpected = [];
  for (const candidate of displayed) {
    if (!isAllowed(candidate, allowlist)) {
      unexpected.push(candidate);
      // Bail after 5 — we only need enough evidence to reject.
      if (unexpected.length >= 5) break;
    }
  }

  if (unexpected.length > 0) {
    return { ok: false, reason: 'unexpected_numbers', unexpected };
  }
  return { ok: true };
}
