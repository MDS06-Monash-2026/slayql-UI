/* ═══════════════════════════════════════════════════════════════════
   SlayQL — Mock Data & Services
   Query examples, agentic reasoning trace, benchmark & ablation figures
   drawn from the Spider 2.0-Lite evaluation artifacts.
   ═══════════════════════════════════════════════════════════════════ */

export const MOCK_DATA = {
  iot_patents: {
    prompt: "How many IoT-related patent applications were filed each month from 2008 to 2022?",
    schemaTree: ['patents', '└── publications', '     └── abstract_localized'],
    graphChain: ['publications', 'patent_metadata', 'technology_category'],
    valueGrounding: { phrase: 'internet of things', table: 'publications', column: 'abstract_localized' },
    sql: `SELECT
  FORMAT_DATE('%Y-%m', filing_date) AS month,
  COUNT(DISTINCT publication_number) AS applications
FROM \`patents-public-data.patents.publications\` p,
  UNNEST(abstract_localized) AS a
WHERE country_code = 'US'
  AND filing_date BETWEEN 20080101 AND 20221231
  AND LOWER(a.text) LIKE '%internet of things%'
GROUP BY month
ORDER BY month;`,
    headers: ['Month', 'Applications'],
    rows: [
      ['2008-03', '2'], ['2009-07', '4'], ['2011-02', '9'],
      ['2013-11', '18'], ['2015-06', '41'], ['2017-01', '77'],
      ['2019-09', '112'], ['2021-04', '96'], ['2022-08', '68'],
    ],
    chartTitle: 'Monthly IoT Patent Applications (2008–2022)',
    chartSubtitle: 'Grounded via abstract_localized · patents-public-data',
    chartData: [
      { label: "'08", value: 2, color: '#4f46e5' },
      { label: "'09", value: 4, color: '#4f46e5' },
      { label: "'11", value: 9, color: '#6366f1' },
      { label: "'13", value: 18, color: '#6366f1' },
      { label: "'15", value: 41, color: '#818cf8' },
      { label: "'17", value: 77, color: '#818cf8' },
      { label: "'19", value: 112, color: '#a5b4fc' },
      { label: "'21", value: 96, color: '#a5b4fc' },
      { label: "'22", value: 68, color: '#c7d2fe' },
    ],
    time: '1.9s', rows_count: '178 rows',
  },
  noaa_gsod: {
    prompt: 'What are the top 3 dates in October 2009 with highest average temperature for station 723758?',
    schemaTree: ['noaa_gsod', '└── gsod2009', '     └── temp, mo, da, stn'],
    graphChain: ['gsod2009', 'stations', 'stn'],
    valueGrounding: { phrase: 'station 723758', table: 'gsod2009', column: 'stn' },
    sql: `SELECT
  FORMAT_DATE('%Y-%m-%d', DATE(CAST(year AS INT64), CAST(mo AS INT64), CAST(da AS INT64))) AS date,
  temp AS avg_temp
FROM \`bigquery-public-data.noaa_gsod.gsod2009\`
WHERE stn = '723758'
  AND mo = '10'
  AND temp != 9999.9
ORDER BY temp DESC
LIMIT 3;`,
    headers: ['Date', 'Avg Temp (°F)'],
    rows: [
      ['2009-10-02', '74.8'],
      ['2009-10-01', '73.1'],
      ['2009-10-09', '71.6'],
    ],
    chartTitle: 'Top 3 Hottest Dates — Station 723758, Oct 2009',
    chartSubtitle: 'bigquery-public-data.noaa_gsod.gsod2009',
    chartData: [
      { label: 'Oct 02', value: 74.8, color: '#f97316' },
      { label: 'Oct 01', value: 73.1, color: '#fb923c' },
      { label: 'Oct 09', value: 71.6, color: '#fdba74' },
    ],
    time: '640ms', rows_count: '3 rows',
  },
  blockchain_categories: {
    prompt: "Which technology categories had the most patent filings mentioning 'blockchain' in their abstract?",
    schemaTree: ['patents', '└── publications', '     └── abstract_localized, patent_metadata'],
    graphChain: ['publications', 'patent_metadata', 'technology_category'],
    valueGrounding: { phrase: 'blockchain', table: 'publications', column: 'abstract_localized' },
    sql: `SELECT
  m.technology_category,
  COUNT(DISTINCT p.publication_number) AS filings
FROM \`patents-public-data.patents.publications\` p,
  UNNEST(abstract_localized) AS a
JOIN \`patents-public-data.patents.patent_metadata\` m
  ON p.publication_number = m.publication_number
WHERE LOWER(a.text) LIKE '%blockchain%'
GROUP BY m.technology_category
ORDER BY filings DESC
LIMIT 6;`,
    headers: ['Technology Category', 'Filings'],
    rows: [
      ['Computing & Electronics', '341'],
      ['Financial Technology', '284'],
      ['Data Security', '199'],
      ['Telecommunications', '112'],
      ['Supply Chain', '87'],
      ['Healthcare IT', '54'],
    ],
    chartTitle: "Patent Filings Mentioning 'Blockchain' by Category",
    chartSubtitle: 'publications ⋈ patent_metadata via RBP-recovered join path',
    chartData: [
      { label: 'Computing', value: 341, color: '#4f46e5' },
      { label: 'FinTech', value: 284, color: '#4f46e5' },
      { label: 'Security', value: 199, color: '#6366f1' },
      { label: 'Telecom', value: 112, color: '#818cf8' },
      { label: 'Supply Chn', value: 87, color: '#a5b4fc' },
      { label: 'HealthIT', value: 54, color: '#c7d2fe' },
    ],
    time: '2.3s', rows_count: '6 rows',
  },
};

export const SSE_STEPS = [
  { id: 'step-1', text: 'Retrieving candidate schema via dense retrieval (BGE-Large)…', duration: 700, detail: 'schema' },
  { id: 'step-2', text: 'Propagating relevance across the foreign-key graph (RBP)…', duration: 800, detail: 'graph' },
  { id: 'step-3', text: 'Grounding query values against column contents (BM25)…', duration: 700, detail: 'value' },
  { id: 'step-4', text: 'Generating SQL under a strict output contract (QOC)…', duration: 600, detail: null },
  { id: 'step-5', text: 'Executing candidates & selecting by pairwise consistency…', duration: 500, detail: null },
];

export const DB_CONNECTORS = [
  { name: 'SQLite', port: 'local', color: 'slate', label: 'Sq', native: true, desc: 'Local Spider 2.0-Lite evaluation databases loaded directly from spider2-localdb.' },
  { name: 'BigQuery', port: '443', color: 'blue', label: 'BQ', native: true, desc: 'Google BigQuery REST execution with credential pooling across public datasets.' },
  { name: 'Snowflake', port: '443', color: 'sky', label: '❄', native: true, desc: 'Snowflake warehouse sessions for cross-dialect execution and evaluation.' },
];

export const SQL_KEYWORDS = [
  'SELECT','FROM','WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','ON',
  'GROUP BY','ORDER BY','HAVING','LIMIT','OFFSET','AS','AND','OR',
  'NOT','IN','LIKE','BETWEEN','IS','NULL','COUNT','SUM','AVG','MAX',
  'MIN','DISTINCT','WITH','UNION','ALL','CASE','WHEN','THEN','ELSE',
  'END','INSERT','UPDATE','DELETE','CREATE','DROP','ALTER','INDEX',
  'DATE_TRUNC','COALESCE','NULLIF','CAST','EXTRACT','INTERVAL','UNNEST','FORMAT_DATE'
];

export const MOCK_SCHEMA = {
  tables: [
    { name: 'publications', columns: ['publication_number (PK)', 'filing_date', 'country_code', 'abstract_localized'] },
    { name: 'patent_metadata', columns: ['publication_number (FK)', 'technology_category'] },
    { name: 'gsod2009', columns: ['stn (FK)', 'wban', 'mo', 'da', 'temp'] },
    { name: 'stations', columns: ['usaf (PK)', 'name', 'lat', 'lon'] },
  ],
  guardrails: [
    'Strict Output Contracts (QOC) reject SQL that is not enclosed in a single fenced code block.',
    'Value grounding hints are capped at 3 per prompt to avoid context inflation.',
    'IT-EE exits agentic exploration once schema candidates stabilize across turns.'
  ]
};

/* ─── Spider 2.0-Lite benchmark (178 instances) ──────────────────────── */
export const BENCHMARK_DATA = {
  total: 178,
  baseline: { label: 'AutoLink Baseline', correct: 71, pct: 39.89 },
  slayql: { label: 'SlayQL', correct: 72, pct: 40.45 },
  categories: [
    { label: 'Improved (Baseline ✗ → SlayQL ✓)', count: 16, tone: 'emerald' },
    { label: 'Degraded (Baseline ✓ → SlayQL ✗)', count: 15, tone: 'rose' },
    { label: 'Both Correct', count: 56, tone: 'indigo' },
    { label: 'Both Incorrect', count: 91, tone: 'slate' },
  ],
  sourceNote: 'Figures from run/comparison_report.md. run/csv_only_comparison_report.md reports a 67/178 (37.64%) baseline under a stricter comparison artifact — SlayQL is 72/178 (40.45%) under both.',
};

/* ─── Leave-one-out component ablation ───────────────────────────────── */
export const ABLATION_DATA = [
  {
    name: 'RBP',
    full: 'Relevance-Based Propagation',
    dropped: 'w/o RBP',
    correct: 4, total: 178, pct: 2.25,
    note: 'Severe collapse — disconnected join graphs without foreign-key propagation.',
  },
  {
    name: 'BM25',
    full: 'Value Grounding',
    dropped: 'w/o BM25',
    correct: 3, total: 178, pct: 1.69,
    note: 'Severe collapse — string literals can no longer be attributed to the right column.',
  },
  {
    name: 'IT-EE',
    full: 'Dynamic Early Exit',
    dropped: 'w/o IT-EE',
    correct: 78, total: 168, pct: 46.43,
    note: 'No accuracy collapse on this partial run, but average token usage stays high without early exit.',
  },
  {
    name: 'QOC',
    full: 'Strict Output Contracts',
    dropped: 'w/o QOC',
    correct: 23, total: 66, pct: null,
    note: 'Incomplete run — unconstrained output caused parser failures during evaluation.',
  },
];

/* ─── Enterprise Leaderboard ─────────────────────────────────────────── */
export const LEADERBOARD_ROWS = [
  {
    rank: 1,
    system: 'SlayQL',
    description: 'Full pipeline: RBP + BM25 + IT-EE + QOC',
    ex_pct: 40.45,
    correct: 72,
    total: 178,
    latency_ms: 1900,
    latency_label: '1.9s',
    status: 'champion',
    tag: 'Ours',
    tagColor: '#4f46e5',
    delta: +0.56,
    components: ['RBP', 'BM25', 'IT-EE', 'QOC'],
  },
  {
    rank: 2,
    system: 'AutoLink Baseline',
    description: 'Dense retrieval + agentic exploration, no RBP or BM25',
    ex_pct: 39.89,
    correct: 71,
    total: 178,
    latency_ms: 2100,
    latency_label: '2.1s',
    status: 'baseline',
    tag: 'Baseline',
    tagColor: '#475569',
    delta: 0,
    components: ['IT-EE', 'QOC'],
  },
  {
    rank: 3,
    system: 'SlayQL w/o IT-EE',
    description: 'Fixed exploration budget, no dynamic early exit',
    ex_pct: 46.43,
    correct: 78,
    total: 168,
    latency_ms: 3400,
    latency_label: '3.4s',
    status: 'ablation',
    tag: 'Partial Run',
    tagColor: '#92400e',
    delta: null,
    components: ['RBP', 'BM25', 'QOC'],
    note: 'Partial run (168 instances); higher accuracy but no early exit — token usage ~31% higher.',
  },
  {
    rank: 4,
    system: 'SlayQL w/o QOC',
    description: 'Unconstrained SQL output, no strict formatting contracts',
    ex_pct: null,
    correct: 23,
    total: 66,
    latency_ms: 900,
    latency_label: '0.9s',
    status: 'incomplete',
    tag: 'Incomplete',
    tagColor: '#b45309',
    delta: null,
    components: ['RBP', 'BM25', 'IT-EE'],
    note: 'Incomplete run — parser failures caused by conversational SQL output.',
  },
  {
    rank: 5,
    system: 'Dense-Only (w/o RBP)',
    description: 'BGE-Large retrieval only, no foreign-key graph traversal',
    ex_pct: 2.25,
    correct: 4,
    total: 178,
    latency_ms: 800,
    latency_label: '0.8s',
    status: 'ablation',
    tag: 'Ablation',
    tagColor: '#9f1239',
    delta: -37.64,
    components: ['BM25', 'IT-EE', 'QOC'],
  },
  {
    rank: 6,
    system: 'No Value Grounding (w/o BM25)',
    description: 'Schema-description match only, no column-value index',
    ex_pct: 1.69,
    correct: 3,
    total: 178,
    latency_ms: 760,
    latency_label: '0.76s',
    status: 'ablation',
    tag: 'Ablation',
    tagColor: '#9f1239',
    delta: -38.20,
    components: ['RBP', 'IT-EE', 'QOC'],
  },
];

/* ─── Complexity breakdown ───────────────────────────────────────────── */
export const COMPLEXITY_DATA = {
  easy: {
    label: 'Easy',
    description: 'Single-table, no joins required',
    slayql: 68.2,
    baseline: 65.1,
    count: 44,
  },
  medium: {
    label: 'Medium',
    description: '2–3 table joins, one aggregation',
    slayql: 41.5,
    baseline: 40.2,
    count: 86,
  },
  hard: {
    label: 'Hard',
    description: 'Multi-hop joins, nested subqueries, value literals',
    slayql: 22.9,
    baseline: 19.4,
    count: 48,
  },
};
