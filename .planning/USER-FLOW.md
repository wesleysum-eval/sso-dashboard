# User Flow — Enterprise SSO Dashboard Builder (v1)

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. LOGIN                                                            │
│  User visits app → redirected to their company's SSO (IdP)          │
│  → authenticates → redirected back with session                     │
│  Session persists across browser refresh                            │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. IDENTITY → TENANT MAPPING (server-side, invisible to user)      │
│  SSO identity resolved to exactly ONE EdgeOne account                │
│  All subsequent API calls scoped to that account only                │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. PICK DATA SOURCE                                                 │
│  User selects ONE of:                                                │
│    ○ CDN Traffic Stats                                               │
│    ○ Security Events                                                │
│  (Only their own account's data is ever in scope — no picker         │
│   ever lists other tenants)                                          │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. PROMPT                                                           │
│  User types natural language request, e.g.:                         │
│    "show me weekly traffic by region for the last 30 days"          │
│    "which zones got the most WAF blocks this week"                  │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. AGENT GENERATES DASHBOARD                                        │
│  Agent interprets prompt → maps to read-only EdgeOne API calls       │
│  (constrained query/component DSL, not arbitrary code execution)     │
│  → fetches data (scoped to user's account) → renders charts/tables   │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6. VIEW RESULT                                                      │
│  Dashboard renders on screen                                         │
│    ├─→ Not what they wanted? → RE-PROMPT (back to step 4,           │
│    │    same data source, refine the ask)                            │
│    └─→ Looks good? → SAVE                                            │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  7. SAVE DASHBOARD                                                   │
│  Dashboard persisted for this user/account                           │
│  (No shareable link or dashboard history list in v1 — deferred)     │
└───────────────────────────────────────────────────────────────────────┘
```

## Key checkpoints for security/isolation

- **Step 1→2**: SSO auth must resolve to exactly one tenant — no ambiguous or missing mapping.
- **Step 2→3**: Data source picker never leaks the existence of other tenants' data.
- **Step 4→5**: Agent's EdgeOne API calls are always scoped server-side to the resolved tenant, regardless of what the prompt asks for (prompt cannot override tenant scope).
- **Step 5**: Generation path is constrained (fixed query/component vocabulary), not open code-gen — limits prompt-injection blast radius.
- **Step 5→6**: All API access is read-only; no mutation endpoints reachable from this flow.

## v2 candidates (deferred from this flow)

- Shareable links for saved dashboards
- Dashboard list/history view
- Explicit logout
- Live/auto-refreshing dashboards
- Additional data sources (DNS analytics, Edge Functions metrics)
