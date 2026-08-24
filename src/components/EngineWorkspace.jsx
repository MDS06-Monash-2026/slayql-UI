import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Database, Zap, Code2, ChevronRight, GitBranch, Key, Link2, Cpu,
  ShieldCheck, CheckCircle2, AlertCircle, MessageSquare, PlayCircle,
  Network, Target, Copy, Check, Code, Table, BarChart3, FileCheck2, Sparkles
} from 'lucide-react';
import { MOCK_DATA, SSE_STEPS, SQL_KEYWORDS } from '../mock/mockData';

/* ═══════════════════════════════════════════════════════════════════
   Stage definitions (left rail)
   ═══════════════════════════════════════════════════════════════════ */
const STAGES = [
  {
    id: 'ontology',
    step: 1,
    label: 'Schema Ontology',
    sublabel: 'Database Metadata & FK Graph',
    icon: Database,
    color: '#4f46e5',
    colorLight: '#eef2ff',
    colorBorder: '#c7d2fe',
  },
  {
    id: 'signal',
    step: 2,
    label: 'Signal Extraction',
    sublabel: 'NL Intent · BM25 Value Grounding',
    icon: Zap,
    color: '#d97706',
    colorLight: '#fffbeb',
    colorBorder: '#fde68a',
  },
  {
    id: 'reasoning',
    step: 3,
    label: 'SQL Compilation',
    sublabel: 'LLM Guardrails · QOC Output',
    icon: Code2,
    color: '#059669',
    colorLight: '#ecfdf5',
    colorBorder: '#a7f3d0',
  },
];

/* ─── Ontology panel ────────────────────────────────────────────────── */
function OntologyPanel() {
  const tables = [
    { name: 'publications',    pk: 'publication_number', cols: ['filing_date','country_code','abstract_localized'], fks: ['patent_metadata.publication_number'], color: '#4f46e5' },
    { name: 'patent_metadata', pk: 'publication_number', cols: ['technology_category','inventor_id'],               fks: ['publications.publication_number'],    color: '#7c3aed' },
    { name: 'gsod2009',        pk: 'stn',               cols: ['wban','mo','da','temp','dewp'],                    fks: ['stations.usaf'],                      color: '#0369a1' },
    { name: 'stations',        pk: 'usaf',              cols: ['name','lat','lon','elev'],                         fks: [],                                     color: '#0d9488' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 slide-in-right">
      {tables.map((tbl) => (
        <div key={tbl.name} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100" style={{ background: tbl.color + '12' }}>
            <Database className="w-3 h-3 flex-shrink-0" style={{ color: tbl.color }} />
            <span className="text-xs font-bold text-slate-800 font-mono">{tbl.name}</span>
            <span className="ml-auto flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: tbl.color + '20', color: tbl.color }}>
              <Key className="w-2 h-2" />{tbl.pk}
            </span>
          </div>
          <div className="px-3 py-2 space-y-1">
            {tbl.cols.map((col) => (
              <div key={col} className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />{col}
              </div>
            ))}
          </div>
          {tbl.fks.length > 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {tbl.fks.map((fk) => (
                <span key={fk} className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full border"
                  style={{ borderColor: tbl.color + '50', color: tbl.color, background: tbl.color + '0d' }}>
                  <Link2 className="w-2 h-2" />{fk}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 flex items-start gap-2.5">
        <GitBranch className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-indigo-700 mb-1">FK Graph (RBP traversal)</p>
          <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono text-indigo-600">
            {['publications','→','patent_metadata','→','technology_category'].map((n, i) => (
              <span key={i} className={n === '→' ? 'text-indigo-300' : 'px-2 py-0.5 rounded bg-white border border-indigo-200'}>{n}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Signal panel ──────────────────────────────────────────────────── */
function SignalPanel() {
  const tokens = [
    { text: 'Which',               type: 'neutral' },
    { text: 'technology categories', type: 'entity', label: 'ENTITY → technology_category', color: '#7c3aed', bg: '#f5f3ff' },
    { text: 'had the most',        type: 'neutral' },
    { text: 'patent filings',      type: 'agg',    label: 'AGG → COUNT DISTINCT',          color: '#0369a1', bg: '#eff6ff' },
    { text: "'blockchain'",         type: 'value',  label: "VALUE → abstract_localized LIKE '%blockchain%'", color: '#d97706', bg: '#fffbeb' },
  ];
  const signals = [
    { label: 'Target entity', value: 'technology_category',          icon: Database,      color: '#7c3aed' },
    { label: 'Aggregation',   value: 'COUNT DISTINCT filings',       icon: Cpu,           color: '#0369a1' },
    { label: 'Value literal', value: "'blockchain'",                  icon: Zap,           color: '#d97706' },
    { label: 'BM25 match',    value: 'publications.abstract_localized', icon: CheckCircle2, color: '#059669' },
  ];
  return (
    <div className="space-y-4 slide-in-right">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">NL Input Tokenised</p>
        <p className="text-sm leading-loose text-slate-700 font-medium">
          {tokens.map((tok, i) =>
            tok.type === 'neutral' ? (
              <span key={i}> {tok.text} </span>
            ) : (
              <span key={i} className="relative group mx-0.5">
                <span className="token-highlight px-1.5 py-0.5 rounded font-semibold cursor-default" style={{ background: tok.bg, color: tok.color }}>{tok.text}</span>
                <span className="absolute bottom-full left-0 mb-1 z-10 hidden group-hover:block whitespace-nowrap text-[9px] font-mono px-2 py-1 rounded-lg shadow-lg text-white" style={{ background: tok.color }}>{tok.label}</span>
              </span>
            )
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {signals.map((sig) => {
          const Icon = sig.icon;
          return (
            <div key={sig.label} className="rounded-xl border border-slate-200 bg-white p-3 flex items-start gap-2.5 shadow-sm">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: sig.color + '15' }}>
                <Icon className="w-3.5 h-3.5" style={{ color: sig.color }} />
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{sig.label}</p>
                <p className="text-[11px] font-bold text-slate-800 font-mono mt-0.5">{sig.value}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          <strong>BM25 Grounding:</strong> Token <code className="px-1 rounded bg-amber-100 font-mono">'blockchain'</code> matched column <code className="px-1 rounded bg-amber-100 font-mono">abstract_localized</code> in <code className="px-1 rounded bg-amber-100 font-mono">publications</code> (score 14.2).
        </p>
      </div>
    </div>
  );
}

/* ─── Reasoning panel ───────────────────────────────────────────────── */
function ReasoningPanel() {
  const steps = [
    'Schema context assembled (4 tables, 14 cols)',
    'RBP graph: publications → patent_metadata',
    'BM25 value hint injected into prompt',
    'LLM inference (GPT-4o) — QOC-constrained',
    'SQL parsed from single fenced block ✓',
    'Candidate execution: 3/3 consistent',
  ];
  const sql = `SELECT
  m.technology_category,
  COUNT(DISTINCT p.publication_number) AS filings
FROM \`patents.publications\` p,
  UNNEST(abstract_localized) AS a
JOIN \`patents.patent_metadata\` m
  ON p.publication_number = m.publication_number
WHERE LOWER(a.text) LIKE '%blockchain%'
GROUP BY m.technology_category
ORDER BY filings DESC
LIMIT 6;`;
  return (
    <div className="space-y-4 slide-in-right">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Reasoning Trace</p>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              {s}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 overflow-x-auto">
        <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Generated SQL</p>
        <pre className="text-xs font-mono leading-relaxed text-slate-300 whitespace-pre">{sql}</pre>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1.5 mb-2">
          <ShieldCheck className="w-3 h-3" /> QOC Guardrails — All Passed
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {['Single fenced block','No conversational text','Valid SQL syntax','Schema-grounded cols'].map((g) => (
            <div key={g} className="flex items-center gap-1.5 text-xs text-emerald-800">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />{g}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PANEL_MAP = { ontology: OntologyPanel, signal: SignalPanel, reasoning: ReasoningPanel };

/* ─── SQL syntax highlighter ────────────────────────────────────────── */
function renderHighlightedSQL(sql) {
  if (!sql) return '';
  const kwPattern = SQL_KEYWORDS.slice().sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const tokenRe = new RegExp(`(--[^\\n]*)|('(?:[^'\\\\]|\\\\.)*')|(\\b(?:${kwPattern})\\b)|(\\b\\d+(?:\\.\\d+)?\\b)`, 'gi');
  const parts = [];
  let lastIndex = 0, match;
  while ((match = tokenRe.exec(sql)) !== null) {
    if (match.index > lastIndex) parts.push(sql.slice(lastIndex, match.index));
    const [, comment, str, kw, num] = match;
    if (comment) parts.push(<span key={parts.length} className="text-slate-500 italic">{comment}</span>);
    else if (str)  parts.push(<span key={parts.length} className="text-green-300">{str}</span>);
    else if (kw)   parts.push(<span key={parts.length} className="text-purple-400 font-semibold">{kw}</span>);
    else if (num)  parts.push(<span key={parts.length} className="text-yellow-300">{num}</span>);
    lastIndex = tokenRe.lastIndex;
  }
  if (lastIndex < sql.length) parts.push(sql.slice(lastIndex));
  return <code className="font-mono whitespace-pre-wrap leading-relaxed block text-slate-300">{parts}</code>;
}

/* ─── SVG bar chart ─────────────────────────────────────────────────── */
function SVGChart({ chartData }) {
  if (!chartData) return null;
  const W = 500, H = 180, pad = { t: 12, r: 12, b: 36, l: 50 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const maxVal = Math.max(...chartData.map(d => d.value));
  const bW = Math.max(14, (cW - (chartData.length - 1) * 5) / chartData.length);
  return (
    <svg className="w-full" viewBox={`0 0 ${W} ${H}`}>
      <g transform={`translate(${pad.l},${pad.t})`}>
        {[0, 0.5, 1].map((r, i) => {
          const val = Math.round(maxVal * r);
          const y = cH - r * cH;
          return (
            <g key={i}>
              <line x1={0} y1={y} x2={cW} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={-6} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8" fontFamily="sans-serif">
                {val >= 1000 ? `${(val/1000).toFixed(0)}K` : val}
              </text>
            </g>
          );
        })}
        {chartData.map((item, idx) => {
          const x = idx * (bW + 5);
          const bH = (item.value / maxVal) * cH;
          return (
            <g key={idx} className="chart-bar">
              <rect x={x} y={cH - bH} width={bW} height={bH} fill={item.color || '#4f46e5'} rx={2} />
              <text x={x + bW / 2} y={cH + 14} textAnchor="middle" fontSize={8} fill="#94a3b8" fontFamily="sans-serif">
                {item.label.length > 7 ? item.label.slice(0, 7) + '..' : item.label}
              </text>
            </g>
          );
        })}
        <line x1={0} y1={0} x2={0} y2={cH} stroke="#cbd5e1" strokeWidth={1} />
        <line x1={0} y1={cH} x2={cW} y2={cH} stroke="#cbd5e1" strokeWidth={1} />
      </g>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main EngineWorkspace component
   ═══════════════════════════════════════════════════════════════════ */
export default function EngineWorkspace() {
  const [mode, setMode]                 = useState('stage');   // 'stage' | 'query'
  const [activeStage, setActiveStage]   = useState('ontology');
  const [queryInput, setQueryInput]     = useState('');
  const [running, setRunning]           = useState(false);
  const [sseActive, setSseActive]       = useState(false);
  const [stepIndex, setStepIndex]       = useState(-1);
  const [resultsActive, setResultsActive] = useState(false);
  const [activeTab, setActiveTab]       = useState('sql');
  const [currentDataset, setCurrentDataset] = useState(null);
  const [copyStatus, setCopyStatus]     = useState(false);
  // Stage progress 0-100
  const [stageProgress, setStageProgress] = useState(0);
  const [panelKey, setPanelKey]           = useState(0);   // forces re-mount for shimmer
  const timerRef    = useRef(null);
  const progressRef = useRef(null);
  const AUTO_MS = 5000;
  const TICK_MS = 50;

  /* Auto-advance stages with live progress bar */
  useEffect(() => {
    if (mode !== 'stage') return;
    setStageProgress(0);
    const totalTicks = AUTO_MS / TICK_MS;
    let tick = 0;
    progressRef.current = setInterval(() => {
      tick++;
      setStageProgress(Math.min(100, Math.round((tick / totalTicks) * 100)));
      if (tick >= totalTicks) {
        clearInterval(progressRef.current);
        setActiveStage(prev => {
          const idx = STAGES.findIndex(s => s.id === prev);
          return STAGES[(idx + 1) % STAGES.length].id;
        });
        setPanelKey(k => k + 1);
      }
    }, TICK_MS);
    return () => clearInterval(progressRef.current);
  }, [mode, activeStage]);

  const handleStageClick = useCallback((id) => {
    clearInterval(progressRef.current);
    clearTimeout(timerRef.current);
    setActiveStage(id);
    setStageProgress(0);
    setPanelKey(k => k + 1);
    setMode('stage');
  }, []);

  const simulateQuery = useCallback(async (prompt) => {
    if (running) return;
    clearTimeout(timerRef.current);
    setMode('query');
    setRunning(true);
    setResultsActive(false);
    setSseActive(true);
    setStepIndex(-1);

    const lower = prompt.toLowerCase();
    let data = MOCK_DATA.iot_patents;
    if (lower.includes('station') || lower.includes('temperature') || lower.includes('hottest')) data = MOCK_DATA.noaa_gsod;
    else if (lower.includes('blockchain') || lower.includes('categories')) data = MOCK_DATA.blockchain_categories;
    setCurrentDataset(data);

    for (let i = 0; i < SSE_STEPS.length; i++) {
      setStepIndex(i);
      await new Promise(r => setTimeout(r, 2000 + Math.floor(Math.random() * 2001)));
    }
    setSseActive(false);
    setResultsActive(true);
    setActiveTab('sql');
    setRunning(false);
  }, [running]);

  const handleRun = () => { if (queryInput.trim()) simulateQuery(queryInput); };
  const handleExample = (prompt) => { setQueryInput(prompt); simulateQuery(prompt); };

  const handleCopy = () => {
    if (!currentDataset) return;
    navigator.clipboard.writeText(currentDataset.sql).then(() => {
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 2000);
    });
  };

  const ActiveStagePanel = PANEL_MAP[activeStage];
  const activeStageData  = STAGES.find(s => s.id === activeStage);

  return (
    <section id="workspace" className="py-16 lg:py-24 bg-slate-50 border-t border-slate-200 relative overflow-hidden">
      {/* subtle grid texture */}
      <div className="section-dot-bg absolute inset-0 pointer-events-none opacity-30" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Section header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-500 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600" />
            </span>
            Core Engine · Live Workspace
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            See the Pipeline in Action
          </h2>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl mx-auto">
            Explore each stage of SlayQL's cognitive engine — then run a query and watch the full pipeline execute live.
          </p>
        </div>

        {/* ── Master-Detail Container ── */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-2xl shadow-indigo-100/40 overflow-hidden" style={{ backdropFilter: 'blur(2px)' }}>
          <div className="flex flex-col lg:flex-row min-h-[580px]">

            {/* ── LEFT RAIL ── */}
            <div className="engine-rail w-full lg:w-72 xl:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/80 flex flex-col">

              {/* Pipeline stage tabs */}
              <div className="p-4 border-b border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pipeline Stages</p>
                  {mode === 'stage' && (
                    <span className="text-[9px] font-semibold text-indigo-500">auto-advancing</span>
                  )}
                </div>
                <div className="space-y-2">
                  {STAGES.map((stage) => {
                    const Icon = stage.icon;
                    const isActive = stage.id === activeStage && mode === 'stage';
                    return (
                      <div key={stage.id}>
                        <button
                          id={`engine-stage-${stage.id}`}
                          onClick={() => handleStageClick(stage.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200"
                          style={{
                            background: isActive ? stage.colorLight : 'transparent',
                            boxShadow: isActive ? `0 0 0 1.5px ${stage.colorBorder}` : 'none',
                          }}
                          aria-selected={isActive}
                        >
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 border transition-all"
                            style={isActive
                              ? { background: stage.color, color: '#fff', borderColor: stage.color }
                              : { background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                            <Icon className="w-3.5 h-3.5" style={{ color: isActive ? '#fff' : '#94a3b8' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold truncate ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>{stage.label}</p>
                            <p className="text-[10px] text-slate-400 truncate">{stage.sublabel}</p>
                          </div>
                          <span className="text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border"
                            style={isActive
                              ? { background: stage.color, color: '#fff', borderColor: stage.color }
                              : { background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                            {stage.step}
                          </span>
                        </button>
                        {/* Per-stage progress strip */}
                        {isActive && (
                          <div className="stage-strip mx-3 mt-1">
                            <div
                              className="stage-strip-fill"
                              style={{ width: `${stageProgress}%`, background: stage.color }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Query input */}
              <div className="p-4 border-b border-slate-200 flex-1 flex flex-col">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Run a Query</p>

                {/* Example chips */}
                <div className="flex flex-col gap-1.5 mb-3">
                  {[
                    { label: '📈 IoT Patents by Month',     prompt: MOCK_DATA.iot_patents.prompt },
                    { label: '🌡️ Hottest Dates by Station', prompt: MOCK_DATA.noaa_gsod.prompt },
                    { label: '🔗 Blockchain Multi-Hop',      prompt: MOCK_DATA.blockchain_categories.prompt },
                  ].map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => handleExample(ex.prompt)}
                      disabled={running}
                      className="w-full text-left px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all disabled:opacity-40"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>

                {/* Textarea */}
                <div className="flex-1 flex flex-col gap-2">
                  <textarea
                    id="engine-query-input"
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleRun(); }}}
                    className="flex-1 w-full min-h-[80px] text-xs text-slate-800 placeholder-slate-400 bg-white border border-slate-200 rounded-xl p-3 outline-none resize-none leading-relaxed focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
                    placeholder="Ask a question about your database…"
                  />
                  <button
                    onClick={handleRun}
                    disabled={running || !queryInput.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-100 disabled:opacity-40"
                  >
                    <PlayCircle className="w-4 h-4" />
                    {running ? 'Running…' : 'Run Query'}
                  </button>
                </div>
              </div>

              {/* Mode indicator footer */}
              <div className="px-4 py-2.5 border-t border-slate-100">
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${mode === 'query' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'}`} />
                  {mode === 'query' ? (running ? 'Query executing…' : 'Showing query results') : 'Auto-advancing stages'}
                </div>
              </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div className="engine-panel flex-1 flex flex-col overflow-hidden">

              {/* Panel header */}
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 bg-white/95 flex-shrink-0">
                {mode === 'stage' ? (
                  <>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center border flex-shrink-0 shadow-sm"
                      style={{ background: activeStageData.colorLight, borderColor: activeStageData.colorBorder }}>
                      {React.createElement(activeStageData.icon, { className: 'w-4 h-4', style: { color: activeStageData.color } })}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{activeStageData.label}</p>
                      <p className="text-xs text-slate-400">{activeStageData.sublabel}</p>
                    </div>
                    {/* Stage breadcrumb pills */}
                    <div className="hidden sm:flex items-center gap-1">
                      {STAGES.map((s, i) => (
                        <React.Fragment key={s.id}>
                          <button onClick={() => handleStageClick(s.id)}
                            className="w-6 h-6 rounded-full text-[10px] font-bold transition-all"
                            style={{
                              background: s.id === activeStage ? s.color : '#f1f5f9',
                              color: s.id === activeStage ? '#fff' : '#94a3b8',
                            }}>
                            {s.step}
                          </button>
                          {i < STAGES.length - 1 && <ChevronRight className="w-3 h-3 text-slate-200" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{queryInput || 'Live Query'}</p>
                      <p className="text-xs text-slate-400">{running ? 'Executing pipeline…' : resultsActive ? `${currentDataset?.time} · ${currentDataset?.rows_count}` : 'Waiting…'}</p>
                    </div>
                    <button onClick={() => setMode('stage')} className="text-[11px] text-slate-500 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all">
                      ← Stages
                    </button>
                  </>
                )}
              </div>

              {/* Global pipeline progress bar (query execution) */}
              {running && (
                <div className="h-0.5 bg-slate-100 flex-shrink-0">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600 transition-all duration-300"
                    style={{ width: `${stepIndex < 0 ? 0 : Math.round(((stepIndex + 1) / SSE_STEPS.length) * 100)}%` }}
                  />
                </div>
              )}

              {/* Panel content */}
              <div className="flex-1 overflow-y-auto p-5 relative">

                {/* STAGE MODE */}
                {mode === 'stage' && <ActiveStagePanel key={`panel-${activeStage}-${panelKey}`} />}

                {/* QUERY MODE — SSE trace */}
                {mode === 'query' && sseActive && (
                  <div className="space-y-3 slide-in-up">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                      <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">SlayQL Thinking</span>
                    </div>
                    {SSE_STEPS.map((step, idx) => (
                      <div key={idx}>
                        <div className={`flex items-start gap-2.5 text-sm ${idx < stepIndex ? 'opacity-100' : idx === stepIndex ? 'opacity-100' : 'opacity-30'}`}>
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold
                            ${idx < stepIndex ? 'bg-emerald-500 text-white' : idx === stepIndex ? 'border-2 border-indigo-600 border-t-transparent animate-spin' : 'border-2 border-slate-200 bg-white'}`}>
                            {idx < stepIndex ? '✓' : ''}
                          </div>
                          <span className={`text-xs ${idx === stepIndex ? 'text-indigo-600 font-semibold' : idx < stepIndex ? 'text-slate-700' : 'text-slate-400'}`}>{step.text}</span>
                        </div>
                        {step.detail === 'schema' && idx < stepIndex && currentDataset && (
                          <div className="ml-6 mt-1.5 p-2.5 rounded-lg bg-white border border-slate-200 font-mono text-xs text-slate-600 space-y-0.5">
                            {currentDataset.schemaTree.map((line, li) => <div key={li}>{line}</div>)}
                          </div>
                        )}
                        {step.detail === 'graph' && idx < stepIndex && currentDataset && (
                          <div className="ml-6 mt-1.5 flex items-center gap-1.5 flex-wrap text-xs">
                            {currentDataset.graphChain.map((node, ni) => (
                              <React.Fragment key={ni}>
                                <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-mono">{node}</span>
                                {ni < currentDataset.graphChain.length - 1 && <span className="text-slate-300">→</span>}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        {step.detail === 'value' && idx < stepIndex && currentDataset && (
                          <div className="ml-6 mt-1.5 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                            <Target className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>Entity <strong>"{currentDataset.valueGrounding.phrase}"</strong> matched column <code className="bg-amber-100 px-1 rounded">{currentDataset.valueGrounding.column}</code> in <code className="bg-amber-100 px-1 rounded">{currentDataset.valueGrounding.table}</code>.</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* QUERY MODE — Results */}
                {mode === 'query' && resultsActive && currentDataset && (
                  <div className="slide-in-up">
                    {/* Result tabs */}
                    <div className="flex items-center gap-0 border-b border-slate-200 mb-4">
                      {[
                        { id: 'sql',   icon: Code,     label: 'SQL Query'     },
                        { id: 'table', icon: Table,    label: 'Data Table'    },
                        { id: 'chart', icon: BarChart3, label: 'Visualization' },
                      ].map((tab) => {
                        const Icon = tab.icon;
                        return (
                          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${activeTab === tab.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                            <Icon className="w-3.5 h-3.5" />{tab.label}
                          </button>
                        );
                      })}
                      <div className="ml-auto pb-1 flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">{currentDataset.time}</span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">{currentDataset.rows_count}</span>
                      </div>
                    </div>

                    {activeTab === 'sql' && (
                      <div className="space-y-2.5">
                        <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 relative overflow-x-auto">
                          <button onClick={handleCopy} className="absolute top-3 right-3 text-slate-400 hover:text-white flex items-center gap-1 text-xs">
                            {copyStatus ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            {copyStatus ? 'Copied' : 'Copy'}
                          </button>
                          <pre className="overflow-x-auto text-sm">{renderHighlightedSQL(currentDataset.sql)}</pre>
                        </div>
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                          <FileCheck2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <span><strong>QOC passed:</strong> SQL parsed cleanly from a single fenced code block.</span>
                        </div>
                      </div>
                    )}

                    {activeTab === 'table' && (
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>{currentDataset.headers.map((h, i) => <th key={i} className="p-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {currentDataset.rows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50">
                                  {row.map((cell, ci) => <td key={ci} className="p-3 text-slate-600 text-xs">{cell}</td>)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {activeTab === 'chart' && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="text-sm font-semibold text-slate-800 mb-0.5">{currentDataset.chartTitle}</h4>
                        <p className="text-xs text-slate-500 mb-4">{currentDataset.chartSubtitle}</p>
                        <SVGChart chartData={currentDataset.chartData} />
                      </div>
                    )}
                  </div>
                )}

                {/* QUERY MODE — empty state */}
                {mode === 'query' && !sseActive && !resultsActive && (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-3">
                      <Sparkles className="w-6 h-6 text-indigo-500" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">Ready to Execute</p>
                    <p className="text-xs text-slate-400 mt-1">Click an example or type your query</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
