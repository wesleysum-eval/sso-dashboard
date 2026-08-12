---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 2
total_count: 2
last_updated: 2026-08-12T01:04:06.379Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | unrun-verify | edge-functions/api/auth/login.js |  | Live verify curl for GET /api/auth/login returns HTTP 545 (env vars OIDC_ISSUER_URL etc. not yet set via EdgeOne Makers Console) instead of the expected 302 -- blocked on human console setup, not a code defect | fixed |  | 2026-08-12T00:04:02.510Z | 2026-08-12T01:04:06.292Z |
| 2 | 02 | unrun-verify | edge-functions/api/auth/callback.js |  | Live negative-test curl for GET /api/auth/callback with attacker-supplied tenant_id returns HTTP 545 (same missing env-var precondition as login.js) instead of the expected 302 to /access-denied.html -- code-level guarantee independently confirmed via code review, but end-to-end live curl still pending human console setup | fixed |  | 2026-08-12T00:04:10.326Z | 2026-08-12T01:04:06.379Z |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "edge-functions/api/auth/login.js",
    "line": null,
    "description": "Live verify curl for GET /api/auth/login returns HTTP 545 (env vars OIDC_ISSUER_URL etc. not yet set via EdgeOne Makers Console) instead of the expected 302 -- blocked on human console setup, not a code defect",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-12T00:04:02.510Z",
    "resolved_at": "2026-08-12T01:04:06.292Z"
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "edge-functions/api/auth/callback.js",
    "line": null,
    "description": "Live negative-test curl for GET /api/auth/callback with attacker-supplied tenant_id returns HTTP 545 (same missing env-var precondition as login.js) instead of the expected 302 to /access-denied.html -- code-level guarantee independently confirmed via code review, but end-to-end live curl still pending human console setup",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-12T00:04:10.326Z",
    "resolved_at": "2026-08-12T01:04:06.379Z"
  }
]
````
