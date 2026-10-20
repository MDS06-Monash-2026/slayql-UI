// C-CaSE research figures shown on the landing page.
//
// Spider figures are copied from the C-CaSE repository's analysis output (run/pub_results/,
// generated 26 September 2026: runs_summary.md, spider2_linking.md) and the full Spider 2.0-Lite
// run (run/log_spider2_full_slayql). BIRD figures come from the final v1.9 run
// (run/bird_dev_v19_full, aggregates/summary_metrics.json, October 2026): 904 of 1,534 correct,
// zero execution errors. Model: DeepSeek V4 Flash (0731).

export const BENCHMARKS = [
  { name: 'Spider 1.0', detail: 'test set', n: 2147, ex: 0.6539, note: '3 candidates' },
  // 95% Wilson interval for 904 of 1,534.
  { name: 'BIRD', detail: 'dev set', n: 1534, ex: 0.5893, ci: [0.5645, 0.6137], note: '5 candidates' },
  { name: 'Spider 2.0-Lite', detail: 'enterprise databases', n: 547, ex: 0.4589, note: '251 of 547' },
];

// BIRD dev, pipeline versions 1.0, 1.8 and 1.9 (same 1,534 questions). v1.9's provider reported
// no cost, so none is claimed (costPerQuestion: null).
export const VERSIONS = [
  { version: 'v1.0', ex: 0.4915, tokens: 37061, costPerQuestion: 0.0034 },
  { version: 'v1.8', ex: 0.5619, tokens: 50738, costPerQuestion: 0.0066 },
  { version: 'v1.9', ex: 0.5893, tokens: 51595, costPerQuestion: null },
];

// BIRD dev v1.9: is a correct query among the first k of the 5 candidates (oracle)? Computed from
// each question's correct_candidate_ids. SELECTED_EX is what SlayQL actually chose.
export const ORACLE_AT_K = [
  { k: 1, oracle: 0.5867 },
  { k: 2, oracle: 0.6199 },
  { k: 3, oracle: 0.6382 },
  { k: 4, oracle: 0.6486 },
  { k: 5, oracle: 0.6545 },
];
export const SELECTED_EX = 0.5893;
// When a correct candidate existed, how often it was chosen: 1,004 such questions in v1.9, 100 missed.
export const PICK_RATE = { before: 0.80, after: 0.9004, beforeVersion: 'v1.0', afterVersion: 'v1.9' };

// Spider 2.0-Lite schema linking against the gold SQL (248 questions with a parsable gold query).
export const LINKING = { n: 248, tableRecall: 0.955, columnRecall: 0.92 };

// What the study found (docs/presentation/QA_PREP.md; BIRD v1.9 summary for table recall).
export const FINDINGS = [
  { id: 'tables', label: 'Finding the tables is solved', value: '99.6%', what: 'of the tables each BIRD answer needs were in front of the AI' },
  { id: 'picking', label: 'Picking is the hard part', value: '80% → 90%', what: 'how often the right query is chosen when one was written (v1.0 → v1.9)' },
  { id: 'untuned', label: 'Not tuned to the test', value: '+6.0 pts', what: 'v1.9 over v1.0 on the 1,227 questions never used for tuning (p < 0.001)' },
  { id: 'budget', label: 'A negative result, reported', value: 'No saving', what: 'the adaptive budget never shortened exploration: the AI stayed uncertain' },
];
