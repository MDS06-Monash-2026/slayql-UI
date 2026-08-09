import React, { useState, useMemo } from 'react';
import { Trophy, TrendingUp, TrendingDown, Clock, Filter, ChevronUp, ChevronDown, Minus, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { BENCHMARK_DATA, LEADERBOARD_ROWS, COMPLEXITY_DATA, ABLATION_DATA } from '../mock/mockData';

/* ─── Helpers ───────────────────────────────────────────────────────── */
const STATUS_STYLES = {
  champion:   { bg: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700',  dot: 'bg-indigo-500' },
  baseline:   { bg: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-600',   dot: 'bg-slate-400'  },
  ablation:   { bg: 'bg-rose-50',    border: 'border-rose-200',   text: 'text-rose-700',    dot: 'bg-rose-400'   },
  incomplete: { bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',   dot: 'bg-amber-400'  },
};

const COMPONENT_COLORS = {
  RBP:   '#2563eb',
  BM25:  '#d97706',
  'IT-EE': '#7c3aed',
  QOC:   '#059669',
};

const SORT_FIELDS = [
  { id: 'rank',      label: 'Rank' },
  { id: 'ex_pct',   label: 'Accuracy' },
  { id: 'latency_ms', label: 'Latency' },
  { id: 'correct',  label: 'Correct' },
];

const COMPLEXITY_FILTERS = ['All', 'Easy', 'Medium', 'Hard'];

/* ─── Delta badge ───────────────────────────────────────────────────── */
function DeltaBadge({ delta }) {
  if (delta === null || delta === undefined) return <span className="text-slate-300 text-xs">—</span>;
  if (delta === 0) return <span className="flex items-center gap-0.5 text-xs text-slate-500 font-semibold"><Minus className="w-3 h-3" />0.00%</span>;
  const positive = delta > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-bold ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? '+' : ''}{delta.toFixed(2)}%
    </span>
  );
}

/* ─── Leaderboard table row ─────────────────────────────────────────── */
function LeaderRow({ row, maxPct, isChampion }) {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLES[row.status];
  const barWidth = row.ex_pct !== null ? `${(row.ex_pct / 50) * 100}%` : '0%';

  return (
    <>
      <tr
        className={`leaderboard-row${isChampion ? ' champion' : ''} border-b border-slate-100 cursor-pointer`}
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        {/* Rank */}
        <td className="px-4 py-3.5 text-center">
          {row.rank === 1
            ? <span className="text-lg">🥇</span>
            : row.rank === 2 ? <span className="text-lg">🥈</span>
            : <span className="text-sm font-bold text-slate-400">#{row.rank}</span>}
        </td>

        {/* System name */}
        <td className="px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold ${isChampion ? 'text-indigo-700' : 'text-slate-800'}`}>{row.system}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: row.tagColor + '18', color: row.tagColor }}>
                  {row.tag}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 max-w-xs leading-snug">{row.description}</p>
            </div>
          </div>
        </td>

        {/* Components */}
        <td className="px-4 py-3.5 hidden lg:table-cell">
          <div className="flex flex-wrap gap-1">
            {['RBP','BM25','IT-EE','QOC'].map(c => (
              <span key={c} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={row.components.includes(c)
                  ? { background: COMPONENT_COLORS[c] + '20', color: COMPONENT_COLORS[c] }
                  : { background: '#f1f5f9', color: '#cbd5e1' }}>
                {c}
              </span>
            ))}
          </div>
        </td>

        {/* EX Accuracy bar */}
        <td className="px-4 py-3.5 min-w-[160px]">
          {row.ex_pct !== null ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold tabular-nums ${isChampion ? 'text-indigo-700' : 'text-slate-700'}`}>{row.ex_pct}%</span>
                <span className="text-xs text-slate-400">{row.correct}/{row.total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="leaderboard-bar h-full rounded-full" style={{ width: barWidth, background: isChampion ? '#4f46e5' : '#94a3b8' }} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> Incomplete
            </div>
          )}
        </td>

        {/* Latency */}
        <td className="px-4 py-3.5 hidden md:table-cell">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono">
            <Clock className="w-3 h-3 text-slate-400" />{row.latency_label}
          </div>
        </td>

        {/* Delta */}
        <td className="px-4 py-3.5">
          <DeltaBadge delta={row.delta} />
        </td>

        {/* Expand icon */}
        <td className="px-3 py-3.5 text-slate-300">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </td>
      </tr>

      {/* Expanded note row */}
      {expanded && row.note && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={7} className="px-8 py-3">
            <div className="flex items-start gap-2 text-xs text-slate-600">
              <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              {row.note}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Complexity breakdown row ──────────────────────────────────────── */
function ComplexityBar({ label, desc, slayql, baseline, count }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-bold text-slate-800">{label}</span>
          <p className="text-xs text-slate-400 mt-0.5">{desc} · {count} instances</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-extrabold text-indigo-700 tabular-nums">{slayql}%</span>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span className="font-semibold text-indigo-700">SlayQL</span><span>{slayql}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="leaderboard-bar h-full rounded-full bg-indigo-600" style={{ width: `${(slayql / 80) * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>AutoLink Baseline</span><span>{baseline}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="leaderboard-bar h-full rounded-full bg-slate-400" style={{ width: `${(baseline / 80) * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-3 text-xs font-semibold text-emerald-600 flex items-center gap-1">
        <TrendingUp className="w-3 h-3" />+{(slayql - baseline).toFixed(1)}% vs baseline
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main BenchmarkSection
   ═══════════════════════════════════════════════════════════════════ */
export default function BenchmarkSection() {
  const [sortField, setSortField]      = useState('rank');
  const [sortAsc, setSortAsc]          = useState(true);
  const [complexityFilter, setComplexityFilter] = useState('All');
  const [showAblation, setShowAblation] = useState(false);

  const delta = (BENCHMARK_DATA.slayql.pct - BENCHMARK_DATA.baseline.pct).toFixed(2);

  const sortedRows = useMemo(() => {
    return [...LEADERBOARD_ROWS].sort((a, b) => {
      const av = a[sortField] ?? (sortField === 'ex_pct' ? -1 : 999999);
      const bv = b[sortField] ?? (sortField === 'ex_pct' ? -1 : 999999);
      return sortAsc ? av - bv : bv - av;
    });
  }, [sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) setSortAsc(a => !a);
    else { setSortField(field); setSortAsc(field === 'rank'); }
  };

  const complexityKey = complexityFilter.toLowerCase();
  const complexityRow = COMPLEXITY_DATA[complexityKey];

  return (
    <section id="benchmark" className="py-16 lg:py-24 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Section header ── */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold uppercase tracking-wider">
            <Trophy className="w-3.5 h-3.5" /> Benchmark
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            Spider 2.0-Lite Leaderboard
          </h2>
          <p className="mt-3 text-lg text-slate-500 max-w-2xl mx-auto">
            {BENCHMARK_DATA.total} instances · Execution Accuracy (EX) against gold results.
          </p>
        </div>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bench-kpi rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-6 text-center shadow-sm">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Execution Accuracy</p>
            <p className="text-5xl font-extrabold text-slate-900 tabular-nums">{BENCHMARK_DATA.slayql.pct}%</p>
            <p className="text-sm text-slate-500 mt-1">{BENCHMARK_DATA.slayql.correct} / {BENCHMARK_DATA.total} correct</p>
          </div>
          <div className="bench-kpi rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 text-center shadow-sm" style={{ animationDelay: '80ms' }}>
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Improvement over Baseline</p>
            <p className="text-5xl font-extrabold text-emerald-700 tabular-nums">+{delta}%</p>
            <p className="text-sm text-slate-500 mt-1">vs AutoLink Baseline ({BENCHMARK_DATA.baseline.pct}%)</p>
          </div>
          <div className="bench-kpi rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center shadow-sm" style={{ animationDelay: '160ms' }}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Benchmark Scale</p>
            <p className="text-5xl font-extrabold text-slate-900 tabular-nums">{BENCHMARK_DATA.total}</p>
            <p className="text-sm text-slate-500 mt-1">Spider 2.0-Lite instances</p>
          </div>
        </div>

        {/* ── Controls bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Sort by:
            </span>
            {SORT_FIELDS.map(f => (
              <button key={f.id} onClick={() => handleSort(f.id)}
                className={`sort-btn text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1
                  ${sortField === f.id ? 'active' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'}`}>
                {f.label}
                {sortField === f.id && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Complexity:</span>
            {COMPLEXITY_FILTERS.map(f => (
              <button key={f} onClick={() => setComplexityFilter(f)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all
                  ${complexityFilter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* ── Leaderboard table ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-12">#</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">System</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Components</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600" onClick={() => handleSort('ex_pct')}>
                    <span className="flex items-center gap-1">EX Accuracy {sortField === 'ex_pct' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell cursor-pointer hover:text-indigo-600" onClick={() => handleSort('latency_ms')}>
                    <span className="flex items-center gap-1">Latency {sortField === 'latency_ms' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Δ vs Baseline</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <LeaderRow key={row.system} row={row} isChampion={row.status === 'champion'} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Complexity breakdown ── */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Accuracy by Complexity
              {complexityFilter !== 'All' && <span className="ml-2 text-indigo-600">— {complexityFilter}</span>}
            </h3>
          </div>

          {complexityFilter === 'All' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.values(COMPLEXITY_DATA).map((c) => (
                <ComplexityBar key={c.label} {...c} />
              ))}
            </div>
          ) : (
            <div className="max-w-lg">
              <ComplexityBar {...complexityRow} />
            </div>
          )}
        </div>

        {/* ── Ablation toggle ── */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowAblation(a => !a)}
            className="w-full flex items-center justify-between px-6 py-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Component Ablation Study</p>
                <p className="text-xs text-slate-500">Leave-one-out dropout — each module's contribution</p>
              </div>
            </div>
            {showAblation ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {showAblation && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-white border-t border-slate-200">
              {ABLATION_DATA.map((item) => {
                const severe = item.pct !== null && item.pct < 10;
                return (
                  <div key={item.name} className={`rounded-xl border p-5 ${severe ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.dropped}</span>
                      {severe && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                    </div>
                    <h4 className="text-xs font-semibold text-slate-800 mb-3">{item.full}</h4>
                    {item.pct !== null ? (
                      <>
                        <div className={`text-3xl font-extrabold tabular-nums ${severe ? 'text-rose-600' : 'text-slate-900'}`}>{item.pct}%</div>
                        <div className="text-xs text-slate-400 mt-0.5">{item.correct}/{item.total} correct</div>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl font-extrabold text-amber-600">N/A</div>
                        <div className="text-xs text-slate-400 mt-0.5">{item.correct}/{item.total} evaluated</div>
                      </>
                    )}
                    {severe && (
                      <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-rose-600">
                        <TrendingDown className="w-3 h-3" /> Severe collapse
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{item.note}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Source note */}
        <p className="text-xs text-slate-400 text-center mt-6 max-w-3xl mx-auto leading-relaxed">{BENCHMARK_DATA.sourceNote}</p>

      </div>
    </section>
  );
}
