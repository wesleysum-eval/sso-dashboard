---
phase: 1
slug: edgeone-deployment-foundation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — this phase has no unit-test surface; all four success criteria are "prove a live, deployed platform primitive works," which is inherently an HTTP smoke-check against the real deployment, not a local test-runner concern (per RESEARCH.md's Validation Architecture section) |
| **Config file** | none — Wave 0 requires no test-framework install, only a captured live URL (see Wave 0 Requirements) |
| **Quick run command** | `curl -sf $(cat .planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt)/api/status` |
| **Full suite command** | See "Full smoke suite" below — sequential curl checks against all four ROADMAP success criteria, run against the live deployed URL |
| **Estimated runtime** | ~10 seconds (4-5 sequential HTTP requests, no build/compile step) |

**Full smoke suite:**
```bash
DEPLOYED_URL=$(cat .planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt)
test -n "$DEPLOYED_URL" || { echo "FAIL: no deployed URL captured"; exit 1; }

# Criterion 1: static site publicly reachable
curl -sf -o /dev/null -w "static: %{http_code}\n" "$DEPLOYED_URL/"

# Criterion 2: Edge Function callable, real (non-mocked) response
curl -sf "$DEPLOYED_URL/api/status"

# Criterion 3: secrets/env readable by deployed Function
curl -sf "$DEPLOYED_URL/api/status" | grep -q '"hasConfig":true' && echo "config: ok"

# Criterion 4: KV write-then-read across separate requests
curl -sf -X POST -H 'Content-Type: application/json' -d '{"value":"phase1-ok"}' "$DEPLOYED_URL/api/kv-check"
curl -sf "$DEPLOYED_URL/api/kv-check" | grep -q '"value":"phase1-ok"' && echo "kv: ok"
```

---

## Sampling Rate

- **After every task commit:** Run the quick run command (`curl .../api/status`) against
  the live URL — no local dev substitute is authoritative for this phase, since the phase
  goal is explicitly "not just local dev." `edgeone makers dev` may be used for iterating
  on function logic before each deploy, but is not itself a sampling gate.
- **After every plan wave:** Run the Full smoke suite above against the live deployed URL.
- **Before `/gsd:verify-work`:** Full smoke suite must be green — all four criteria pass
  against the real deployment.
- **Max feedback latency:** ~15 seconds (one `edgeone makers deploy` + smoke suite).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | DEPLOY-01 | T-01-SC | Package legitimacy confirmed by human before any `edgeone` install/upgrade | manual (blocking-human checkpoint) | N/A — see Manual-Only Verifications | ✅ | ⬜ pending |
| 01-01-02 | 01 | 1 | DEPLOY-01 | T-01-01 / T-01-02 | Static site reachable; Function callable; secret readable without leaking raw value | smoke | `curl -sf -o /dev/null -w "%{http_code}" $(cat .planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt)/ \| grep -q 200 && curl -sf $(cat .planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt)/api/status \| grep -q '"hasConfig":true'` | ✅ | ⬜ pending |
| 01-02-01 | 02 | 2 | DEPLOY-01 | — | KV namespace provisioned + bound to project as `my_kv` (console-only step) | manual (human-action checkpoint) | N/A — see Manual-Only Verifications | ✅ | ⬜ pending |
| 01-02-02 | 02 | 2 | DEPLOY-01 | T-01-03 | KV write-then-read round-trips correctly on the live deployment; key is hardcoded, never client-derived | smoke (2-step) | `curl -sf -X POST -H 'Content-Type: application/json' -d '{"value":"phase1-ok"}' $(cat .planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt)/api/kv-check \| grep -q '"wrote":true' && curl -sf $(cat .planning/phases/01-edgeone-deployment-foundation/DEPLOYED-URL.txt)/api/kv-check \| grep -q '"value":"phase1-ok"'` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no test framework, fixtures, or
scaffolding are needed before task execution begins. The "File Exists" column above is ✅
for every row because each automated check is a plain `curl` invocation against files/
endpoints the plan's own tasks create; there is no pre-existing test file to stub.

The only Wave-0-shaped prerequisite is non-code: the `edgeone` CLI must be present locally
(already true — v1.6.8 installed) before Plan 01's tracer task can run `edgeone makers
deploy`. This is handled by Plan 01's leading `checkpoint:human-verify` (package legitimacy
confirmation), not by a separate Wave 0 test-infra task.

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| `edgeone` npm package legitimacy confirmed before install/upgrade | DEPLOY-01 (supply-chain gate, not a functional criterion) | Package Legitimacy Audit in RESEARCH.md flagged `edgeone` as `[SUS]` (no `repository` field in npm metadata) — no automated command can substitute for a human visually confirming publisher identity/download count/description match on npmjs.com; this is a `gate="blocking-human"` checkpoint that is never auto-approved per GSD's package-legitimacy protocol | 1. Visit https://www.npmjs.com/package/edgeone. 2. Confirm publisher identity, download volume (~10k/week), and description match the documented official CLI (pages.edgeone.ai/document/edgeone-cli). 3. Approve upgrade to 1.6.23, or explicitly keep the already-functional 1.6.8. |
| KV namespace creation + project binding (variable name `my_kv`) | DEPLOY-01 criterion 4 (KV storage) | RESEARCH.md's Open Question 1 confirmed there is no CLI or API command for KV namespace creation/binding — it is console-only by platform design (`edgeone makers link` only pulls *existing* bindings, it cannot create one) | 1. Open Makers console → Storage → KV. 2. Activate KV for the account if prompted ("Apply Now"). 3. Create a namespace. 4. Bind it to this project with variable name exactly `my_kv`. 5. Run `edgeone makers link` locally to confirm the binding pulled through. |
| Deployed live URL is genuinely publicly reachable (not just reachable from the deploying machine) | DEPLOY-01 criterion 1 | `curl` from the executor's own machine proves reachability from that network path; a fully independent "reachable from anywhere" proof would require a second network vantage point, which is out of scope for a Phase 1 smoke check — the automated curl check is treated as sufficient evidence, this row exists to document the residual assumption rather than to force a separate manual step | No separate manual step required — documented here as a known limitation of the automated check, not an unresolved gap. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — both checkpoint tasks
      have no `<automated>` verify by design (human-verify / human-action types), which is
      expected per `verify.plan-structure`'s type-specific field requirements; both tracer
      tasks carry real `<automated>` curl-based checks against the live deployment.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — task sequence
      is checkpoint → tracer(automated) → checkpoint → tracer(automated); no 3-in-a-row gap.
- [x] Wave 0 covers all MISSING references — none were MISSING; no pre-existing test files
      were assumed to exist.
- [x] No watch-mode flags — all commands are one-shot `curl` invocations.
- [x] Feedback latency < 15s — smoke suite is 4-5 sequential HTTP requests with no
      build/compile step.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
