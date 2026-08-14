// Tool: teo_zone_info — zone metadata for report headers and context.
//
// teo Action DescribeZones, Version 2022-09-01. Takes NO metric, interval, or
// timeRange: the zone is already fully determined by the tenant's session, so
// this tool has no LLM-supplied arguments at all. That makes it the safest
// tool in the registry by construction — there is nothing for the LLM to
// influence — and also the one that needs the strictest OUTPUT filtering,
// because DescribeZones returns the richest record of any call in this app.
//
// Security invariants (registry.js numbering):
//   1. No arguments are read from the LLM. The zone is selected by a
//      server-built Filters clause using the tenant's own resolved zoneId.
//   2. ZoneIds and credentials come only from getTenantAccount(tenantId, env).
//   3. STRICT ALLOWLIST on the response. DescribeZones' Zone object also
//      carries ZoneId, OriginalNameServers, NameServers, OwnershipVerification,
//      CnameSpeedUp and more; none of it is copied out. Only zoneName, status,
//      area, createdOn and planType leave this module, each individually
//      type-checked, and any value that would echo the zoneId is dropped
//      (03-RESEARCH.md Pitfall 5 — the zoneId must not reach LLM context,
//      where it could surface in generated HTML shown to another tenant's
//      operator during a shared-report review).
//   4. Every failure path returns { ok: false } — no throw, no reason string.
import { getTenantAccount } from '../lib/tenant-mapping.js';
import { signTeoRequest } from '../lib/teo-signer.js';

const ACTION = 'DescribeZones';
const VERSION = '2022-09-01';

// Copy a single scalar field only if it is a usable string/number AND does not
// contain the zoneId. Returns undefined otherwise, so the caller can omit the
// key entirely rather than emit a null the LLM might render as "null".
function safeField(value, zoneId) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return undefined;
  if (zoneId && trimmed.includes(zoneId)) return undefined; // never echo the zoneId, in any field
  return trimmed;
}

export default {
  name: 'teo_zone_info',

  description:
    'Fetch descriptive metadata about this tenant EdgeOne zone: the zone name, its current status, the service area it is deployed in, when it was created, and which plan type it runs on. This tool takes no arguments - the zone is determined automatically from the authenticated session. Use it when you need context for a report header, a title, or an introductory sentence, when the user asks what site or zone the data belongs to, or when the plan type or service area is relevant to interpreting the numbers. It returns no metrics and no time series whatsoever, so it can never answer a question about traffic volume, bandwidth, latency, or attacks - pair it with teo_traffic_timing, teo_traffic_summary, teo_traffic_multi, or teo_security_ddos for the actual data. Some fields may be absent depending on the zone configuration, so only refer to the fields that come back.',

  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  // No fields to check, so validation reduces to normalising the argument
  // container. An LLM may send `{}`, omit arguments entirely, or send stray
  // properties; all three yield the same empty argument object. A non-object
  // primitive (a bare string or number) is still a malformed tool call and is
  // rejected, keeping the fail-closed contract uniform across the registry.
  validateArgs(raw) {
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) return null;
    return {}; // every property on `raw` is unexpected and is dropped
  },

  async execute(args, tenantId, env) {
    try {
      const account = await getTenantAccount(tenantId, env);
      if (!account) return { ok: false };

      const { url, headers, body } = await signTeoRequest({
        secretId: account.secretId,
        secretKey: account.secretKey,
        action: ACTION,
        version: VERSION,
        payload: {
          // Server-resolved scoping only. Filters is built here from the
          // tenant's own zoneId — the LLM has no argument that reaches it.
          Filters: [{ Name: 'zone-id', Values: [account.zoneId] }],
          Limit: 1,
        },
        domain: env.TEO_API_DOMAIN,
      });

      const res = await fetch(url, { method: 'POST', headers, body });
      const teoResponse = await res.json();

      if (teoResponse?.Response?.Error) return { ok: false };

      const zone = teoResponse?.Response?.Zones?.[0];
      if (!zone || typeof zone !== 'object') return { ok: false };

      // Allowlist build-up. Nothing is spread from `zone`; each key is named
      // explicitly and omitted when it fails safeField().
      const zoneId = account.zoneId;
      const data = {};
      const zoneName = safeField(zone.ZoneName, zoneId);
      const status = safeField(zone.Status, zoneId);
      const area = safeField(zone.Area, zoneId);
      const createdOn = safeField(zone.CreatedOn, zoneId);
      // Newer DescribeZones responses nest the plan under Plan.PlanType;
      // older ones expose a flat PlanType. Read both, allowlisted the same way.
      const planType =
        safeField(zone.PlanType, zoneId) ?? safeField(zone.Plan?.PlanType, zoneId);

      if (zoneName !== undefined) data.zoneName = zoneName;
      if (status !== undefined) data.status = status;
      if (area !== undefined) data.area = area;
      if (createdOn !== undefined) data.createdOn = createdOn;
      if (planType !== undefined) data.planType = planType;

      if (Object.keys(data).length === 0) return { ok: false };

      return { ok: true, data };
    } catch {
      return { ok: false };
    }
  },
};
