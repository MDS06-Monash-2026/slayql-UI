import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Database, Zap, Code2, ChevronRight, GitBranch, Key, Link2, Cpu, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────
   Mock data for each pipeline stage
   ───────────────────────────────────────────────────────────────────── */
const STAGES = [
  {
    id: 'ontology',
    label: 'Ontology & Schema',
    shortLabel: 'Ontology',
    icon: Database,
    color: '#4f46e5',
    colorLight: '#eef2ff',
    colorBorder: '#c7d2fe',
    tagline: 'Database Metadata · Table Relationships · FK Graph',
    description:
      'SlayQL maps the full database ontology — tables, columns, data types, and foreign-key relationships — into a structured graph. This graph powers downstream reasoning without requiring the user to know the schema.',
  },
  {
    id: 'signal',
    label: 'Signal Extraction',
    shortLabel: 'Signal',
    icon: Zap,
    color: '#d97706',
    colorLight: '#fffbeb',
    colorBorder: '#fde68a',
    tagline: 'NL Intent · Semantic Tokens · Value Grounding',
    description:
      'Natural language intent is decomposed into semantic signals: entity mentions, temporal constraints, aggregation hints, and value literals. BM25 grounding maps each signal to its correct table-column target.',
  },
  {
    id: 'reasoning',
    label: 'SQL Compilation',
    shortLabel: 'Reasoning',
    icon: Code2,
    color: '#059669',
    colorLight: '#ecfdf5',
    colorBorder: '#a7f3d0',
    tagline: 'LLM Guardrails · Iterative Revision · Executable SQL',
    description:
      'The LLM compiler generates SQL under strict output contracts (QOC), validates against the schema graph, runs candidate execution, and selects the majority result via pairwise consistency voting.',
  },
];

/* ─── Ontology Stage Panel ─────────────────────────────────────────── */
function OntologyPanel() {
  const tables = [
    {
      name: 'publications',
      pk: 'publication_number',
      cols: ['filing_date', 'country_code', 'abstract_localized'],
      fks: ['patent_metadata.publication_number'],
      color: '#4f46e5',
    },
    {
      name: 'patent_metadata',
      pk: 'publication_number',
      cols: ['technology_category', 'inventor_id'],
      fks: ['publications.publication_number'],
      color: '#7c3aed',
    },
    {
      name: 'gsod2009',
      pk: 'stn',
      cols: ['wban', 'mo', 'da', 'temp', 'dewp'],
      fks: ['stations.usaf'],
      color: '#0369a1',
    },
    {
      name: 'stations',
      pk: 'usaf',
      cols: ['name', 'lat', 'lon', 'elev'],
      fks: [],
      color: '#0d9488',
    },
  ];

  return (
    <div className="slide-in-right grid grid-cols-1 sm:grid-cols-2 gap-4">
      {tables.map((tbl, i) => (
        <div
          key={tbl.name}
          className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {/* Table header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100"
            style={{ background: tbl.color + '10' }}>
            <Database className="w-3.5 h-3.5 flex-shrink-0" style={{ color: tbl.color }} />
            <span className="text-sm font-bold text-slate-800 font-mono">{tbl.name}</span>
            <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: tbl.color + '20', color: tbl.color }}>
              <Key className="w-2.5 h-2.5" />{tbl.pk}
            </span>
          </div>

          {/* Columns */}
          <div className="px-4 py-3 space-y-1.5">
            {tbl.cols.map((col) => (
              <div key={col} className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                {col}
              </div>
            ))}
          </div>

          {/* FK relationships */}
          {tbl.fks.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              {tbl.fks.map((fk) => (
                <span key={fk}
                  className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border"
                  style={{ borderColor: tbl.color + '60', color: tbl.color, background: tbl.color + '0d' }}>
                  <Link2 className="w-2.5 h-2.5" />{fk}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* FK graph legend */}
      <div className="sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 flex items-start gap-3">
        <GitBranch className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-indigo-700 mb-1">Foreign-Key Graph (RBP traversal path)</p>
          <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono text-indigo-600">
            {['publications', '→', 'patent_metadata', '→', 'technology_category'].map((n, i) => (
              <span key={i} className={n === '→' ? 'text-indigo-300' : 'px-2 py-0.5 rounded bg-white border border-indigo-200'}>{n}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Signal Extraction Panel ──────────────────────────────────────── */
function SignalPanel() {
  const query = "Which technology categories had the most patent filings mentioning 'blockchain' in their abstract?";

  const tokens = [
    { text: 'Which', type: 'neutral' },
    { text: 'technology categories', type: 'entity', label: 'ENTITY → technology_category', color: '#7c3aed', bg: '#f5f3ff' },
    { text: 'had the most', type: 'neutral' },
    { text: 'patent filings', type: 'agg', label: 'AGGREGATION → COUNT DISTINCT', color: '#0369a1', bg: '#eff6ff' },
    { text: 'mentioning', type: 'neutral' },
    { text: "'blockchain'", type: 'value', label: "VALUE → abstract_localized LIKE '%blockchain%'", color: '#d97706', bg: '#fffbeb' },
    { text: 'in their abstract?', type: 'neutral' },
  ];

  const signals = [
    { label: 'Target entity', value: 'technology_category', icon: Database, color: '#7c3aed' },
    { label: 'Aggregation', value: 'COUNT DISTINCT filings', icon: Cpu, color: '#0369a1' },
    { label: 'Value literal', value: "'blockchain'", icon: Zap, color: '#d97706' },
    { label: 'BM25 column match', value: 'publications.abstract_localized', icon: CheckCircle2, color: '#059669' },
  ];

  return (
    <div className="slide-in-right space-y-5">
      {/* Token visualizer */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Natural Language Input</p>
        <p className="text-sm leading-loose text-slate-700 font-medium">
          {tokens.map((tok, i) =>
            tok.type === 'neutral' ? (
              <span key={i}> {tok.text} </span>
            ) : (
              <span key={i} className="relative group mx-0.5">
                <span
                  className="token-highlight px-1.5 py-0.5 rounded font-semibold cursor-default"
                  style={{ background: tok.bg, color: tok.color }}>
                  {tok.text}
                </span>
                <span className="absolute bottom-full left-0 mb-1.5 z-10 hidden group-hover:block whitespace-nowrap
                  text-[10px] font-mono px-2 py-1 rounded-lg shadow-lg border text-white"
                  style={{ background: tok.color }}>
                  {tok.label}
                </span>
              </span>
            )
          )}
        </p>
      </div>

      {/* Signal extraction grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {signals.map((sig, i) => {
          const Icon = sig.icon;
          return (
            <div key={sig.label}
              className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3 shadow-sm"
              style={{ animationDelay: `${i * 50}ms` }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: sig.color + '15' }}>
                <Icon className="w-4 h-4" style={{ color: sig.color }} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{sig.label}</p>
                <p className="text-xs font-bold text-slate-800 font-mono mt-0.5">{sig.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* BM25 match callout */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800">
          <span className="font-bold">Value Grounding (BM25):</span> Query token{' '}
          <code className="px-1 py-0.5 rounded bg-amber-100 font-mono">'blockchain'</code> matched column{' '}
          <code className="px-1 py-0.5 rounded bg-amber-100 font-mono">abstract_localized</code> in{' '}
          <code className="px-1 py-0.5 rounded bg-amber-100 font-mono">publications</code> with score 14.2.
        </div>
      </div>
    </div>
  );
}

/* ─── SQL Compilation Panel ────────────────────────────────────────── */
function ReasoningPanel() {
  const steps = [
    { label: 'Schema context assembled (4 tables, 14 cols)', done: true },
    { label: 'RBP graph traversal: publications → patent_metadata', done: true },
    { label: 'BM25 value hint injected into prompt', done: true },
    { label: 'LLM inference (GPT-4o) — QOC-constrained output', done: true },
    { label: 'SQL parsed from single fenced code block ✓', done: true },
    { label: 'Candidate execution: 3/3 consistent results', done: true },
  ];

  const sql = `SELECT
  m.technology_category,
  COUNT(DISTINCT p.publication_number) AS filings
FROM \`patents-public-data.patents.publications\` p,
  UNNEST(abstract_localized) AS a
JOIN \`patents-public-data.patents.patent_metadata\` m
  ON p.publication_number = m.publication_number
WHERE LOWER(a.text) LIKE '%blockchain%'
GROUP BY m.technology_category
ORDER BY filings DESC
LIMIT 6;`;

  const guardrails = [
    { label: 'Single fenced code block', pass: true },
    { label: 'No conversational text', pass: true },
    { label: 'Valid SQL syntax', pass: true },
    { label: 'Schema-grounded columns only', pass: true },
  ];

  return (
    <div className="slide-in-right space-y-4">
      {/* Reasoning trace */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Reasoning Trace</p>
        <div className="space-y-2.5">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-3 h-3 text-white" />
              </div>
              <span className="text-slate-700">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SQL output */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 overflow-x-auto shadow-sm">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Generated SQL</p>
        <pre className="text-xs font-mono leading-relaxed text-slate-300 whitespace-pre">{sql}</pre>
      </div>

      {/* Guardrail checklist */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> QOC Guardrail Checklist
        </p>
        <div className="grid grid-cols-2 gap-2">
          {guardrails.map((g) => (
            <div key={g.label} className="flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              {g.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PANEL_MAP = {
  ontology: OntologyPanel,
  signal: SignalPanel,
  reasoning: ReasoningPanel,
};

const AUTO_ADVANCE_MS = 5000;

/* ─── Main Component ───────────────────────────────────────────────── */
export default function CognitivePipeline() {
  const [activeStage, setActiveStage] = useState('ontology');
  const [paused, setPaused] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const timerRef = useRef(null);

  const activeIndex = STAGES.findIndex((s) => s.id === activeStage);
  const ActivePanel = PANEL_MAP[activeStage];
  const active = STAGES[activeIndex];

  const advance = useCallback(() => {
    setActiveStage((prev) => {
      const idx = STAGES.findIndex((s) => s.id === prev);
      return STAGES[(idx + 1) % STAGES.length].id;
    });
    setProgressKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setTimeout(advance, AUTO_ADVANCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [activeStage, paused, advance]);

  const handleTabClick = (id) => {
    clearTimeout(timerRef.current);
    setActiveStage(id);
    setProgressKey((k) => k + 1);
    setPaused(false);
  };

  return (
    <section id="workspace" className="py-20 lg:py-28 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Section header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold uppercase tracking-wider">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
            Core Engine
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            SlayQL's Cognitive Pipeline
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            Step through the multi-stage reasoning engine — from raw schema ontology to executable SQL.
          </p>
        </div>

        {/* Pipeline tabs + panel */}
        <div
          className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-100 overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Tab bar */}
          <div className="flex items-stretch border-b border-slate-200 bg-slate-50 overflow-x-auto">
            {STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              const isActive = stage.id === activeStage;
              return (
                <button
                  key={stage.id}
                  id={`pipeline-tab-${stage.id}`}
                  onClick={() => handleTabClick(stage.id)}
                  className={`pipeline-tab${isActive ? ' active' : ''} flex-1 min-w-[120px] flex flex-col items-center gap-1.5 px-5 py-4 text-sm font-semibold transition-all border-r border-slate-200 last:border-r-0`}
                  style={{
                    color: isActive ? stage.color : '#64748b',
                    background: isActive ? '#ffffff' : 'transparent',
                  }}
                  aria-selected={isActive}
                >
                  {/* Step number */}
                  <span className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: isActive ? stage.color : '#94a3b8' }}>
                    Stage {idx + 1}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden sm:inline">{stage.label}</span>
                    <span className="sm:hidden">{stage.shortLabel}</span>
                  </div>
                  {/* Active indicator */}
                  {isActive && (
                    <div className="h-0.5 w-full mt-1 rounded-full overflow-hidden bg-slate-100">
                      <div
                        key={progressKey}
                        className="pipeline-progress-bar h-full rounded-full"
                        style={{ background: stage.color, '--progress-duration': `${AUTO_ADVANCE_MS}ms` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active stage header */}
          <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100"
            style={{ background: active.colorLight }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border"
              style={{ background: active.color + '20', borderColor: active.colorBorder }}>
              {React.createElement(active.icon, { className: 'w-4.5 h-4.5', style: { color: active.color } })}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800">{active.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{active.tagline}</p>
            </div>
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              {STAGES.map((s, i) => (
                <React.Fragment key={s.id}>
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold`}
                    style={{
                      background: s.id === activeStage ? active.color : '#f1f5f9',
                      color: s.id === activeStage ? '#fff' : '#94a3b8',
                    }}>
                    {s.shortLabel}
                  </span>
                  {i < STAGES.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="px-6 py-4 border-b border-slate-100 bg-white">
            <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">{active.description}</p>
          </div>

          {/* Dynamic panel */}
          <div className="p-6 bg-slate-50/50">
            <ActivePanel key={activeStage} />
          </div>

          {/* Footer hint */}
          <div className="px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {paused ? '⏸ Paused — hover to pause auto-advance' : '▶ Auto-advancing every 5s — hover to pause'}
            </span>
            <div className="flex items-center gap-1.5">
              {STAGES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleTabClick(s.id)}
                  className="w-1.5 h-1.5 rounded-full transition-all"
                  style={{ background: s.id === activeStage ? active.color : '#cbd5e1' }}
                  aria-label={`Go to ${s.label}`}
                />
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
