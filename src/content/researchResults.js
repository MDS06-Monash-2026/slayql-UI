// C-CaSE research figures shown on the landing page.
//
// Measured figures are copied from the C-CaSE repository's analysis output (run/pub_results/,
// generated 26 September 2026: runs_summary.md, oracle_at_k.md, spider2_linking.md) and the
// full Spider 2.0-Lite run (run/log_spider2_full_slayql). Model: deepseek-v4-flash.
//
// Entries marked `pending: true` belong to the BIRD dev ablation runs that are still running
// (run/PUBLICATION_RUNBOOK.md, section 1.1). They render as "in progress" with no number. When the
// results package arrives, run `python -m pub.run_analysis`, copy each EX and tokens figure from
// pub_results/runs_summary.md, and remove `pending`.

export const BENCHMARKS = [
  { name: 'Spider 1.0', detail: 'test set', n: 2147, ex: 0.6539, note: '3 candidates' },
  { name: 'BIRD', detail: 'dev set', n: 1534, ex: 0.5619, ci: [0.537, 0.587], note: '5 candidates' },
  { name: 'Spider 2.0-Lite', detail: 'enterprise databases', n: 547, ex: 0.4589, note: '251 of 547' },
];

// BIRD dev, pipeline versions 1.0 and 1.8 (same 1,534 questions).
export const VERSIONS = [
  { version: 'v1.0', ex: 0.4915, tokens: 37061, costPerQuestion: 0.0034 },
  { version: 'v1.8', ex: 0.5619, tokens: 50738, costPerQuestion: 0.0066 },
];

// BIRD dev v1.8: is a correct query among the first k candidates (oracle), and does voting pick it.
export const ORACLE_AT_K = [
  { k: 1, oracle: 0.5763, vote: 0.5763 },
  { k: 2, oracle: 0.6213, vote: 0.5763 },
  { k: 3, oracle: 0.6558, vote: 0.5874 },
  { k: 4, oracle: 0.6747, vote: 0.5867 },
  { k: 5, oracle: 0.6871, vote: 0.59 },
];
export const SELECTED_EX = 0.5619;

// Spider 2.0-Lite schema linking against the gold SQL (248 questions with a parsable gold query).
export const LINKING = { n: 248, tableRecall: 0.955, columnRecall: 0.92 };

// BIRD dev ablation (one candidate per question, all 1,534 questions). Still running.
export const ABLATION = [
  { id: 'ref', label: 'Full SlayQL Link', what: 'Reference for every comparison', pending: true },
  { id: 'no_rbp', label: 'Without RBP', what: 'Relevance spread along foreign keys removed', pending: true },
  { id: 'no_bm25', label: 'Without BM25 grounding', what: 'Value matching removed', pending: true },
  { id: 'no_qoc', label: 'Without QOC', what: 'Strict output format removed', pending: true },
  { id: 'itee_max', label: 'IT-EE at its most active', what: 'Early exit wherever allowed: tokens saved', pending: true },
  { id: 'topn20', label: 'Top 20 columns', what: 'Tight schema retrieval', pending: true },
  { id: 'topn50', label: 'Top 50 columns', what: 'Medium schema retrieval', pending: true },
];
