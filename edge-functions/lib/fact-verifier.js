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
function extractDisplayedNumbers(html) {
  // First strip <style>...</style> and JS values that are CSS/config,
  // not data. This is intentionally conservative: we only strip the
  // *contents* of <style> blocks (because CSS values are never data)
  // and hex color literals. We do NOT strip <script> because the LLM
  // legitimately writes chart data arrays inline — every number in
  // those arrays MUST be in the allowlist, that's the whole point.
  const noStyles = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const noHexColors = noStyles.replace(/#[0-9a-f]{3,8}\b/gi, '');
  // Strip common CSS numeric contexts embedded in `style="..."`
  // attributes: numbers followed immediately by px/em/rem/%/vh/vw are
  // layout tokens, not data.
  const noCssUnits = noHexColors.replace(/-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|pt|deg|s|ms|fr)\b/gi, '');
  // Strip strings like "rgb(255, 128, 64)" — colors, not data.
  const noRgb = noCssUnits.replace(/rgba?\s*\([^)]*\)/gi, '');
  // Strip SVG viewBox values.
  const noViewBox = noRgb.replace(/viewBox\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');

  const numbers = [];
  // Match integers, decimals, and negatives. Not scientific notation —
  // dashboards never legitimately use it.
  const re = /-?\b\d+(?:[.,]\d+)?\b/g;
  let m;
  while ((m = re.exec(noViewBox)) !== null) {
    // Normalize thousands separators.
    const clean = m[0].replace(/,/g, '');
    numbers.push(clean);
  }
  return numbers;
}

// Check if a candidate string represents a number that's "close enough"
// to any value in the allowlist. We accept exact match on the string
// form, and 0.5% relative tolerance on the numeric form (since the LLM
// may round differently than we do).
function isAllowed(candidate, allowlist) {
  if (allowlist.has(candidate)) return true;
  const n = Number(candidate);
  if (!Number.isFinite(n)) return true; // not a real number, ignore
  // Small integers are always OK (index/count/day/hour/percent).
  if (Number.isInteger(n) && Math.abs(n) <= 100) return true;

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
