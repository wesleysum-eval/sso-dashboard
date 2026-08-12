# API Coverage — EdgeOne Makers AI Gateway + teo Open API (query generation)

**Generated:** 2026-08-12, at plan-phase time for Phase 4.
**Sources:** `04-RESEARCH.md` (AI Gateway Contract, Standard Stack, `teo` Metric Allow-Lists sections), `04-CONTEXT.md` D-01/D-02/D-03/D-04.

## EdgeOne Makers AI Gateway (chat completions — the only endpoint this phase uses)

| capability | decision | reason |
|---|---|---|
| Chat completions, non-streaming (`POST /v1/chat/completions`, `stream` omitted/false) | INTEGRATE | Core mechanism for GEN-01/GEN-02 — the server needs one complete JSON response body to parse-then-validate (D-03 step 2-3), not a token stream. |
| Streaming (`stream: true`, shown in the official curl example) | OPT-OUT | D-03's validate-before-use pipeline requires the full response body before any widget can be checked against the closed enums; a partial stream cannot be validated mid-flight. No UI in `04-UI-SPEC.md` calls for incremental token rendering. |
| `response_format: {type:"json_object"}` (structured/JSON-mode output) | OPT-OUT | Undocumented on this gateway per `04-RESEARCH.md` Standard Stack (checked models/vendor-keys-openai/models-faqs pages, found nowhere) — Assumption A1/A2 flag the risk as either a silent no-op or a request error. Relying on prompt-engineered JSON-only instructions + D-03's mandatory server-side schema validation (already the required backstop regardless) avoids introducing an unverified parameter. |
| Function calling / tool calls | OPT-OUT | Not documented on this gateway. Would also conflict with D-03/GEN-03's "LLM output is data, never executed as code" boundary if used to let the model directly invoke API actions — the fixed lookup-table mapping (`metric-lookup.js`) must remain the only path from a validated enum to a real `teo` Action/Version. |
| Vision / multimodal input | OPT-OUT | GEN-01 scopes input to a natural-language text prompt only; no image-based dashboard requests are in any source artifact. |
| Embeddings endpoint | OPT-OUT | No semantic search, RAG, or similarity-matching feature exists anywhere in Phase 4's scope (GEN-01 through SAVE-01). |
| External vendor model binding (OpenAI/Anthropic/Hunyuan keys via the same gateway) | OPT-OUT | D-04 locks the built-in `@makers/deepseek-v4-flash` model for v1; D-04's own text notes vendor-key binding is a "one-line `model` string swap" available *later*, not adopted this phase. |
| Alternate built-in models (any model string other than `@makers/deepseek-v4-flash`) | OPT-OUT | D-04 locks this exact model string as the resolved provider decision (human-confirmed 2026-08-12). |

## `teo` Open API surface scoped for query generation (extends Phase 3's two data sources, per D-02)

| capability | decision | reason |
|---|---|---|
| CDN Traffic `MetricNames` — full 10-value enum (`l7Flow_outFlux`, `l7Flow_inFlux`, `l7Flow_flux`, `l7Flow_outBandwidth`, `l7Flow_inBandwidth`, `l7Flow_bandwidth`, `l7Flow_request`, `l7Flow_avgResponseTime`, `l7Flow_avgFirstByteResponseTime`, `l7Flow_requestRate`) | INTEGRATE | D-02 explicitly widens beyond Phase 3's single proven value (`l7Flow_outFlux`) to the full documented `DescribeTimingL7AnalysisData` enum, giving the LLM real generation flexibility within a still-closed vocabulary. |
| Security Events `MetricNames` — full 4-value enum (`ddos_attackMaxBandwidth`, `ddos_attackMaxPackageRate`, `ddos_attackBandwidth`, `ddos_attackPackageRate`) | INTEGRATE | Same rationale, extends Phase 3's proven `ddos_attackBandwidth` to the full documented `DescribeDDoSAttackData` enum. |
| `Interval`: `hour`, `day` | INTEGRATE | Matches D-02's locked LLM-facing subset exactly. |
| `Interval`: `min`, `5min` (present in the platform's own wider enum) | OPT-OUT | D-02 deliberately narrows LLM-facing granularity — RESEARCH.md Pitfall 3 explicitly warns against "helpfully" widening this to match the raw API surface. Widening this is a one-way vocabulary-expansion decision this phase does not make. |
| `timeRange` → `StartTime`/`EndTime` mapping (`last24h`, `last7d`, `last30d`) | INTEGRATE | D-02's closed enum; server computes ISO8601 timestamps, the LLM never supplies raw timestamps. |
| `ZoneIds` scoping (mandatory param since 2024-05-30 per Tencent's own change notice) | INTEGRATE | Always server-derived from `getTenantAccount(payload.tenant_id)` — never LLM- or client-supplied, per D-02/D-03 and this project's DATA-03 tenant-isolation invariant carried forward from Phase 3. |
| Any write/mutation `teo` Action (zone config edits, rule changes) | OPT-OUT | PROJECT.md's read-only constraint applies to the entire project, not just this phase — "Write/mutation actions against EdgeOne APIs" is explicitly in REQUIREMENTS.md's Out of Scope table. |
| Any `teo` Action beyond `DescribeTimingL7AnalysisData` / `DescribeDDoSAttackData` (e.g. DNS analytics, Edge Functions metrics, WAF/bot-management event logs) | OPT-OUT | DATA-04/DATA-05 (DNS analytics, Edge Functions metrics as data sources) are deferred to v2 per REQUIREMENTS.md; this phase only widens the metric *selection* within the two actions Phase 3 already established, never adds a third data source. |
