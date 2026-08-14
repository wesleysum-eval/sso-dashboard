// Tool registry for the tool-calling agent (Phase 6).
//
// The agent LLM is handed getToolSchemas() and replies with a tool NAME plus
// an ARGUMENTS object. Both are untrusted text. This module is the single
// choke point that turns that untrusted pair into an executed, tenant-scoped
// teo call — the same "closed vocabulary" discipline as
// generation-schema.js's validateWidget() and metric-lookup.js's
// ACTION_BY_SOURCE, now applied one layer up.
//
// Security invariants preserved here (carried forward from
// api/data/cdn-traffic.js and api/generate-html.js):
//   1. The LLM never supplies a teo Action, Version, or ZoneId. It supplies a
//      tool name (resolved through the closed TOOLS array below — never a
//      dynamic import, never a computed module path) and arguments that each
//      tool's own validateArgs() checks against a closed enum. An argument
//      string is never interpolated into a teo call unvalidated.
//   2. zoneId / secretId / secretKey come exclusively from
//      getTenantAccount(tenantId, env), where tenantId originates from the
//      caller's verified session. No tool reads a client- or LLM-supplied
//      scoping value.
//   3. No tool returns secretId, secretKey, or teoResponse.Response.Error
//      (03-RESEARCH.md Pitfall 5 — Tencent's error text sometimes embeds the
//      ZoneId, which would be a cross-tenant leak into LLM context).
//   4. Every execute() catches its own failures and returns { ok: false }
//      rather than throwing, so one bad tool call can never abort the
//      orchestrator's turn loop. Failure carries no reason string — the
//      orchestrator logs generically (D-05).
import teoTrafficTiming from './teo-traffic-timing.js';
import teoSecurityDdos from './teo-security-ddos.js';
import teoTrafficSummary from './teo-traffic-summary.js';
import teoTrafficMulti from './teo-traffic-multi.js';
import teoZoneInfo from './teo-zone-info.js';

// The closed tool vocabulary. Adding a tool means editing this array — there
// is no discovery-by-filename, no registry.register() side channel.
export const TOOLS = [
  teoTrafficTiming,
  teoSecurityDdos,
  teoTrafficSummary,
  teoTrafficMulti,
  teoZoneInfo,
];

// computeWindow now lives in its own module (time-window.js) to break the
// registry <-> tools import cycle. Re-exported here so existing call sites
// and any future tool can keep importing it from either location.
export { computeWindow } from './time-window.js';

// getToolSchemas() -> OpenAI-format tool array for the LLM request body.
//
// Only name/description/parameters are exposed. validateArgs and execute stay
// server-side and are never serialized into the prompt.
export function getToolSchemas() {
  return TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// findTool(name) -> tool | null. Closed lookup over the TOOLS array; `name`
// is compared, never used to index an object or build a path, so a crafted
// name like '../lib/tenant-mapping.js' or '__proto__' resolves to null.
export function findTool(name) {
  if (typeof name !== 'string') return null;
  return TOOLS.find((tool) => tool.name === name) || null;
}

// executeTool(name, rawArgs, tenantId, env) -> { ok: true, data } | { ok: false, error? }
//
// Fixed three-step order, and the order matters: resolve the tool from the
// closed list, validate its arguments fail-closed, and only then execute with
// server-resolved credentials. `rawArgs` is whatever the LLM emitted and is
// never forwarded past validateArgs() — each tool returns a freshly
// constructed object containing only the properties it recognises, so unknown
// extra properties are dropped rather than reaching a teo payload.
export async function executeTool(name, rawArgs, tenantId, env) {
  const tool = findTool(name);
  if (!tool) return { ok: false, error: 'unknown_tool' };

  const args = tool.validateArgs(rawArgs);
  if (!args) return { ok: false, error: 'invalid_args' };

  return await tool.execute(args, tenantId, env);
}
