// Time-window computation shared by every tool in the registry.
//
// Extracted into its own module to break the circular import that would
// otherwise exist between registry.js (which imports every tool) and the
// tools (which each need computeWindow). ESM tolerates the cycle because
// the import is only dereferenced at call time, but a standalone module
// removes the hazard entirely — a future refactor that moves a
// dereference to module-load time would otherwise break subtly.
//
// Pure function. No env, no async, no side effects.

const RANGE_MS = {
  last24h: 24 * 60 * 60 * 1000,
  last7d: 7 * 24 * 60 * 60 * 1000,
  last30d: 30 * 24 * 60 * 60 * 1000,
};

// computeWindow(timeRange) -> { startTime: Date, endTime: Date }.
// Returns null for an unrecognized timeRange rather than defaulting —
// callers have already validated it against their closed enum, so a miss
// here indicates a real bug and should fail closed.
export function computeWindow(timeRange) {
  const rangeMs = RANGE_MS[timeRange];
  if (rangeMs === undefined) return null;
  const endTime = new Date();
  return { startTime: new Date(endTime.getTime() - rangeMs), endTime };
}
