// D-03 step 5's fixed lookup table: maps a VALIDATED `dataSource` value to
// the real teo Action/Version — never the LLM's raw string, never a
// client-supplied value. The `metric` field itself is already the real
// teo MetricNames string post-validateWidget() (generation-schema.js's
// enum values ARE the real teo values verbatim); this table only supplies
// Action/Version, which the LLM never sees or supplies.
//
// These two version strings must never be shared/interchanged between data
// sources (03-RESEARCH.md Pitfall 1, carried forward to this phase).
export const ACTION_BY_SOURCE = {
  'cdn-traffic': { action: 'DescribeTimingL7AnalysisData', version: '2022-09-01' },
  'security-events': { action: 'DescribeDDoSAttackData', version: '2022-09-01' },
};
