import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Filter,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  RotateCcw,
  Search,
  ShieldCheck,
  Table2,
  X,
} from 'lucide-react';
import TrustBadge from '../trust/TrustBadge';
import DataTablePanel from '../demo/DataTablePanel';
import ReportChart from './ReportChart';
import { formatValue, periodLabel, themeFor, upIsBad } from './chartTheme';

const NUMBER_PATTERN = /((?<![\w.\-/])[-+]?\d[\d,]*(?:\.\d+)?(?:[KMB%x]|\s?times)?(?![\w\-/]))/gi;
const GRAINS = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];
// Charts whose marks can be clicked to filter the report.
const CLICKABLE = new Set(['bar', 'bar_h', 'donut', 'treemap']);
const CHART_NAMES = {
  line: 'Line', area: 'Area', bar: 'Column', bar_h: 'Ranking', stacked_bar: 'Stacked', donut: 'Donut', treemap: 'Treemap',
  funnel: 'Funnel', heatmap: 'Heatmap', scatter: 'Scatter', waterfall: 'Waterfall', table: 'Table',
};

// Numbers in findings are bold so the eye lands on them.
function Emphasised({ text }) {
  const parts = String(text || '').split(NUMBER_PATTERN);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-slate-950 dark:text-white">{part}</strong> : <React.Fragment key={i}>{part}</React.Fragment>));
}

function Evidence({ item }) {
  const findings = item.findings || [];
  if (!findings.length && !item.definitions_used?.length && !item.repaired) {
    return <p className="text-xs text-slate-500">All checks passed: join grain, business definitions, date coverage, result sanity and data coverage.</p>;
  }
  return (
    <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
      {findings.map((f, i) => <li key={i}><b className="font-semibold">{f.title}.</b> {f.detail}</li>)}
      {item.definitions_used?.map((d) => <li key={d.term}>Uses the approved definition of <b>{d.term}</b> (version {d.version}).</li>)}
      {item.repaired && <li>SlayQL rewrote the first query after a check failed, and the new one passed.</li>}
    </ul>
  );
}

function Options({ item, onChoose, busy }) {
  if (item.outcome !== 'clarify' || !item.options?.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Which figure do you mean?</p>
      {item.options.map((option) => (
        <button key={option.label} type="button" disabled={busy} onClick={() => onChoose(item, option)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-indigo-400 hover:bg-indigo-50/50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-indigo-950/30">
          <span className="text-slate-700 dark:text-slate-200">{option.label}</span>
          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{option.preview}</span>
        </button>
      ))}
    </div>
  );
}

// --- Filter row ----------------------------------------------------------------------------

function Slicer({ spec, selected, onApply, disabled }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(selected);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  useEffect(() => { setDraft(selected); }, [selected]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const values = (spec.values || []).filter((v) => v.toLowerCase().includes(query.toLowerCase()));
  const toggle = (value) => setDraft(draft.includes(value) ? draft.filter((v) => v !== value) : [...draft, value]);
  const summary = !selected.length ? 'All' : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return (
    <div className="relative" ref={ref}>
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)} aria-expanded={open}
        className={`inline-flex h-9 max-w-[15rem] items-center gap-1.5 rounded-xl border px-3 text-xs transition disabled:opacity-50 ${
          selected.length
            ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-500/50 dark:bg-indigo-500/15 dark:text-indigo-200'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
        <span className="text-slate-500 dark:text-slate-400">{spec.label}</span>
        <span className="truncate font-semibold">{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-11 z-30 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {(spec.values || []).length > 8 && (
            <label className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 px-2 dark:border-slate-700">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${spec.label.toLowerCase()}`}
                className="h-8 w-full bg-transparent text-xs outline-none dark:text-slate-100" />
            </label>
          )}
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {values.map((value) => {
              const on = draft.includes(value);
              return (
                <li key={value}>
                  <button type="button" onClick={() => toggle(value)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{value}</span>
                  </button>
                </li>
              );
            })}
            {!values.length && <li className="px-2 py-3 text-center text-xs text-slate-500">No matches</li>}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
            <button type="button" onClick={() => setDraft([])} className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">Clear</button>
            <button type="button" onClick={() => { setOpen(false); onApply(draft); }}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterBar({ report, view, onView, busy }) {
  const period = report.period;
  const filters = report.filters || [];
  const state = view.filter_state || {};
  const active = Object.values(state).some((v) => v?.length);
  if (!period && !filters.length) return null;
  const grain = view.grain || period?.grain;
  return (
    <div className="relative z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur print:hidden dark:border-slate-800 dark:bg-[#121622]/95 sm:px-5">
      {period && (
        <>
          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800/70" role="group" aria-label="Report period">
            {GRAINS.map((g) => (
              <button key={g.id} type="button" disabled={busy} aria-pressed={grain === g.id}
                onClick={() => onView({ ...view, grain: g.id, offset: 0, start: null, end: null })}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
                  grain === g.id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}>
                {g.label}
              </button>
            ))}
          </div>
          {grain !== 'all' && (
            <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700">
              <button type="button" disabled={busy} onClick={() => onView({ ...view, grain, offset: (view.offset || 0) - 1 })} title="Previous period"
                className="flex h-9 w-8 items-center justify-center text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
              <span className="flex min-w-[8.5rem] items-center justify-center gap-1.5 px-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" /> : <CalendarRange className="h-3.5 w-3.5 text-indigo-500" />}
                {period.label}
              </span>
              <button type="button" disabled={busy || !(view.offset < 0)} onClick={() => onView({ ...view, grain, offset: Math.min(0, (view.offset || 0) + 1) })} title="Next period"
                className="flex h-9 w-8 items-center justify-center text-slate-500 hover:text-slate-900 disabled:opacity-30 dark:hover:text-white"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </>
      )}
      {filters.length > 0 && <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block dark:bg-slate-700" aria-hidden="true" />}
      {filters.length > 0 && <Filter className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
      {filters.map((spec) => (
        <Slicer key={spec.id} spec={spec} selected={state[spec.id] || []} disabled={busy}
          onApply={(values) => onView({ ...view, filter_state: { ...state, [spec.id]: values } })} />
      ))}
      {active && (
        <button type="button" disabled={busy} onClick={() => onView({ ...view, filter_state: {} })}
          className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
          <RotateCcw className="h-3.5 w-3.5" /> Reset filters
        </button>
      )}
      {period?.note && <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">{period.note}</span>}
    </div>
  );
}

// --- KPIs -----------------------------------------------------------------------------------

function Sparkline({ points, color, id }) {
  const data = points.map(([x, y]) => ({ x, y }));
  return (
    <div className="h-10 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="y" stroke={color} strokeWidth={1.75} fill={`url(#spark-${id})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiTile({ kpi, index, isDark, onAsk, onChoose, busy }) {
  const theme = themeFor(isDark);
  const color = theme.series[index % theme.series.length];
  const answered = kpi.outcome === 'confident' || kpi.outcome === 'caveat';
  const change = answered && kpi.previous ? (kpi.value - kpi.previous) / Math.abs(kpi.previous) : null;
  const good = change !== null && (change >= 0) !== upIsBad(kpi.label);
  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-[#141925]">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{kpi.label}</p>
        {!kpi.pending && <TrustBadge outcome={kpi.outcome} size="xs" isDark={isDark} approved={Boolean(kpi.definitions_used?.length)} compact />}
      </div>
      {kpi.pending ? (
        <div className="mt-3 space-y-2"><div className="skel h-7 w-28 rounded" /><div className="skel h-9 w-full rounded" /></div>
      ) : answered && !kpi.no_data ? (
        <>
          <p className="mt-1 text-[26px] font-semibold leading-tight text-slate-950 dark:text-white">{formatValue(kpi.value, kpi.format)}</p>
          <p className="mt-0.5 min-h-[18px] text-xs">
            {change === 0 ? (
              <span className="text-slate-500">No change vs {periodLabel(kpi.comparison_label || 'previous')}</span>
            ) : change !== null ? (
              <span className={`inline-flex items-center gap-0.5 font-semibold ${good ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(change * 100).toFixed(1)}%
                <span className="ml-1 font-normal text-slate-500">vs {periodLabel(kpi.comparison_label || 'previous')}</span>
              </span>
            ) : kpi.empty_period ? <span className="text-slate-500">Nothing recorded in this period</span> : null}
          </p>
          <div className="mt-auto pt-2">{kpi.spark?.length > 2 && <Sparkline points={kpi.spark} color={color} id={kpi.id} />}</div>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {kpi.no_data ? 'No records in this period.' : kpi.outcome === 'clarify' ? 'This figure depends on which records count.' : 'Not shown: it did not pass its checks.'}
        </p>
      )}
      <Options item={kpi} onChoose={onChoose} busy={busy} />
      {onAsk && !kpi.pending && (
        <button type="button" onClick={() => onAsk(kpi)} title="Ask the agent to change this figure"
          className="absolute bottom-2 right-2 rounded-lg p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-indigo-600 group-hover:opacity-100 focus:opacity-100 print:hidden dark:hover:bg-slate-800">
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </button>
      )}
    </article>
  );
}

// --- Panels -----------------------------------------------------------------------------------

function PanelCard({ panel, width = 1, columns = 3, isDark, bucket, selected, onSelect, onAsk, onChoose, onFocus, busy, focused = false }) {
  const [view, setView] = useState(panel.chart === 'table' ? 'table' : 'chart');
  const [showSql, setShowSql] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const span = focused ? '' : width >= columns ? (columns === 2 ? 'lg:col-span-2' : 'lg:col-span-3') : width === 2 ? 'lg:col-span-2' : '';
  const answered = panel.outcome === 'confident' || panel.outcome === 'caveat';
  const facts = (panel.facts || []).filter((f) => f.kind !== 'rows').slice(0, 2);
  return (
    <article className={`group flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] break-inside-avoid dark:border-slate-800 dark:bg-[#141925] ${span}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{panel.title}</h3>
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">{CHART_NAMES[panel.chart] || panel.chart}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{panel.question}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 print:hidden">
          {!panel.pending && (
            <button type="button" onClick={() => setShowEvidence(!showEvidence)} className="mr-1" aria-expanded={showEvidence} title="See its checks">
              <TrustBadge outcome={panel.outcome} size="xs" isDark={isDark} approved={Boolean(panel.definitions_used?.length)} compact />
            </button>
          )}
          {panel.chart !== 'table' && answered && (
            <button type="button" onClick={() => setView(view === 'chart' ? 'table' : 'chart')} title={view === 'chart' ? 'Show as table' : 'Show as chart'}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
              {view === 'chart' ? <Table2 className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
            </button>
          )}
          <button type="button" onClick={() => setShowSql(!showSql)} title="Show the query"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><Code2 className="h-4 w-4" /></button>
          {onAsk && (
            <button type="button" onClick={() => onAsk(panel)} title="Ask the agent to change this chart"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"><MessageSquarePlus className="h-4 w-4" /></button>
          )}
          {onFocus && (
            <button type="button" onClick={() => onFocus(panel)} title={focused ? 'Close' : 'Focus'}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
              {focused ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </header>
      {showEvidence && <div className="mt-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60"><Evidence item={panel} /></div>}
      {showSql && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{panel.sql_run || panel.sql}</pre>}
      <div className="mt-3 min-h-0 flex-1">
        {panel.pending ? (
          <div className="skel flex h-56 items-center justify-center rounded-xl text-xs text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running and checking…
          </div>
        ) : !answered ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {panel.outcome === 'clarify' ? 'This chart depends on which records count. Choose one:' : 'Not shown: this chart did not pass its checks and is with an analyst.'}
            <Options item={panel} onChoose={onChoose} busy={busy} />
            {panel.outcome !== 'clarify' && <div className="mt-2"><Evidence item={panel} /></div>}
          </div>
        ) : !(panel.rows || []).length ? (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            {panel.purpose === 'exception' ? 'None this period: nothing matched, which is good news.' : 'No records for this period and filters.'}
          </div>
        ) : view === 'table' ? (
          <DataTablePanel columns={panel.columns || []} rows={panel.rows || []} isDark={isDark} isTruncated={panel.truncated} />
        ) : (
          <ReportChart panel={panel} isDark={isDark} bucket={bucket} height={focused ? 460 : 260} selected={selected} onSelect={onSelect} />
        )}
      </div>
      {answered && (facts.length > 0 || (panel.filter_id && CLICKABLE.has(panel.chart))) && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
          {facts.map((f) => {
            const text = f.text.replace(`${panel.title}: `, '');
            return <p key={f.id}><Emphasised text={text.charAt(0).toUpperCase() + text.slice(1)} /></p>;
          })}
          {panel.filter_id && CLICKABLE.has(panel.chart) && view === 'chart' && <p className="text-[11px] text-indigo-600 dark:text-indigo-300">Click a {panel.chart === 'donut' ? 'slice' : panel.chart === 'treemap' ? 'tile' : 'bar'} to filter the whole report.</p>}
        </div>
      )}
    </article>
  );
}

// Widen the last chart in a row so every row of the grid is full.
function packWidths(panels, columns = 3) {
  const widths = {};
  let row = [];
  let used = 0;
  const close = () => {
    if (row.length && used < columns) widths[row[row.length - 1].id] += columns - used;
    row = [];
    used = 0;
  };
  panels.forEach((panel) => {
    const span = Math.min(columns, Math.max(1, Number(panel.span) || 1));
    if (used + span > columns) close();
    widths[panel.id] = span;
    row.push(panel);
    used += span;
    if (used === columns) close();
  });
  close();
  return widths;
}

function TrustRing({ trust, pending }) {
  const total = Object.values(trust || {}).reduce((a, b) => a + b, 0);
  const passed = (trust?.confident || 0) + (trust?.caveat || 0);
  const share = total ? passed / total : 0;
  return (
    <div className="flex items-center gap-3">
      <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
        <circle cx="23" cy="23" r="19" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="5" />
        <circle cx="23" cy="23" r="19" fill="none" stroke="#6ee7b7" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${share * 119.4} 119.4`} transform="rotate(-90 23 23)" />
      </svg>
      <div className="text-xs leading-tight">
        <p className="font-semibold text-white">{pending ? `${pending} still checking` : `${passed} of ${total} checked`}</p>
        <p className="text-indigo-100/80">figures passed on the full data</p>
      </div>
    </div>
  );
}

function AgentCard({ report }) {
  const [open, setOpen] = useState(false);
  const agent = report.agent || {};
  const meta = report.meta || {};
  const steps = agent.steps || [];
  const planner = meta.planner === 'agent' || meta.planner === 'model' ? `Planned by the AI report agent (${agent.model || meta.model})`
    : String(meta.planner || '').startsWith('template:') ? 'Ready-made pack, figures written in advance' : 'Planned from the database structure';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#141925]" aria-label="How this report was built">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><Bot className="h-4 w-4 text-indigo-500" /> How it was built</p>
      <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">{planner}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['Agent steps', steps.length || '—'],
          ['Plans checked', agent.submissions || (meta.planner === 'agent' ? 1 : '—')],
          ['AI cost', `$${Number(meta.ai_cost_usd || 0).toFixed(3)}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-900/60">
            <dd className="text-base font-semibold text-slate-900 dark:text-white">{value}</dd>
            <dt className="text-[10px] text-slate-500">{label}</dt>
          </div>
        ))}
      </dl>
      {steps.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen(!open)} className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800 print:hidden dark:text-indigo-300">
            {open ? 'Hide the agent’s steps' : 'See the agent’s steps'}
          </button>
          {open && (
            <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-300">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${step.ok === false ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <span>{step.label}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <p className="mt-3 text-[11px] text-slate-500">
        {meta.data_sent?.length ? 'Only table and column names, category examples and computed findings were sent to the AI. No table rows.' : 'No AI was used for this version.'}
      </p>
    </section>
  );
}

export default function ReportCanvas({ report, isDark = false, onAsk, onChoose, busy = false, view = {}, onView, refreshing = false, narrow = false }) {
  const columns = narrow ? 2 : 3;
  const [focus, setFocus] = useState(null);
  const kpis = report.kpis || [];
  const panels = report.panels || [];
  const narrative = report.narrative;
  const meta = report.meta || {};
  const period = report.period;
  const bucket = period?.bucket;
  const pending = [...kpis, ...panels].filter((i) => i.pending).length;
  const widths = useMemo(() => packWidths(panels, columns), [panels, columns]);
  const trust = report.trust || [...kpis, ...panels].filter((i) => !i.pending).reduce((acc, i) => ({ ...acc, [i.outcome]: (acc[i.outcome] || 0) + 1 }), { confident: 0, caveat: 0, clarify: 0, handoff: 0 });
  const state = view.filter_state || report.filter_state || {};
  const select = (panel) => (value) => {
    const current = state[panel.filter_id] || [];
    const next = current.length === 1 && current[0] === value ? [] : [value];
    onView?.({ ...view, filter_state: { ...state, [panel.filter_id]: next } });
  };
  const focused = focus ? panels.find((p) => p.id === focus) : null;
  const edition = { week: 'Weekly report', month: 'Monthly report', quarter: 'Quarterly report', year: 'Yearly report', all: 'All-time report', custom: 'Custom period' }[period?.grain] || 'Report';

  return (
    <div className="report-print-root overflow-hidden rounded-3xl border border-slate-200 bg-[#f4f6fb] dark:border-slate-800 dark:bg-[#0b0e16]">
      <header className="relative overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4338ca] px-5 py-5 text-white sm:px-6">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.45),transparent_70%)]" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-200">{edition}{period?.label ? ` · ${period.label}` : ''}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">{report.title}</h1>
            {report.subtitle && <p className="mt-1 max-w-3xl text-sm text-indigo-100/90">{report.subtitle}</p>}
            {period?.prev_label && <p className="mt-2 text-xs text-indigo-200">Compared with {period.prev_label}</p>}
          </div>
          <TrustRing trust={trust} pending={pending} />
        </div>
      </header>

      {onView && <FilterBar report={report} view={view} onView={onView} busy={busy || refreshing} />}

      <div className={`space-y-4 p-4 transition-opacity sm:p-5 ${refreshing ? 'opacity-55' : ''}`}>
        {kpis.length > 0 && (
          <section className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${narrow ? 'xl:grid-cols-3' : kpis.length >= 5 ? 'xl:grid-cols-5' : kpis.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} ${kpis.length === 6 && !narrow ? 'xl:grid-cols-6' : ''}`} aria-label="Key figures">
            {kpis.map((kpi, i) => <KpiTile key={kpi.id} kpi={kpi} index={i} isDark={isDark} onAsk={onAsk} onChoose={onChoose} busy={busy} />)}
          </section>
        )}

        {(narrative || meta.generated_at) && (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {narrative ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#141925]" aria-label="Key highlights">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Key highlights</p>
                <p className="mt-2 text-[17px] font-medium leading-relaxed text-slate-900 dark:text-slate-50"><Emphasised text={narrative.headline} /></p>
                {narrative.findings?.length > 0 && (
                  <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    {narrative.findings.map((f, i) => (
                      <li key={i} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" /><span><Emphasised text={f.text} /></span></li>
                    ))}
                  </ul>
                )}
                {narrative.next_steps?.length > 0 && (
                  <div className="mt-4 rounded-xl bg-indigo-50/70 p-3 dark:bg-indigo-500/10">
                    <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">Suggested next steps</p>
                    <ul className="mt-1 space-y-1 text-sm text-indigo-950/80 dark:text-indigo-100/80">
                      {narrative.next_steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                <p className="mt-3 text-[11px] text-slate-500">
                  {narrative.source === 'model'
                    ? `Written by AI from ${report.facts?.length || 0} computed findings; every number was checked against them.`
                    : `Written from ${report.facts?.length || 0} computed findings.`}
                  {narrative.removed_sentences > 0 && ` ${narrative.removed_sentences} AI sentence${narrative.removed_sentences > 1 ? 's were' : ' was'} removed because the numbers were not in the data.`}
                </p>
              </div>
            ) : <div />}
            {meta.generated_at && <AgentCard report={report} />}
          </section>
        )}

        <section className={`grid grid-cols-1 gap-4 ${narrow ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`} aria-label="Analysis">
          {panels.map((panel) => (
            <PanelCard key={panel.id} panel={panel} width={widths[panel.id]} columns={columns} isDark={isDark} bucket={bucket}
              selected={panel.filter_id ? state[panel.filter_id] : null} onSelect={onView ? select(panel) : undefined}
              onAsk={onAsk} onChoose={onChoose} onFocus={(p) => setFocus(p.id)} busy={busy} />
          ))}
        </section>

        {meta.generated_at && (
          <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Every figure ran on the full data and passed SlayQL&apos;s checks before it was shown</span>
            <span>{meta.refreshed ? 'Refreshed' : 'Generated'} {new Date(meta.generated_at).toLocaleString()}</span>
            <span>Definitions: {meta.definitions?.length ? meta.definitions.map((d) => `${d.term} (v${d.version})`).join(', ') : 'none approved yet'}</span>
          </footer>
        )}
      </div>

      {focused && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm print:hidden" onClick={() => setFocus(null)}>
          <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <PanelCard panel={focused} isDark={isDark} bucket={bucket} focused selected={focused.filter_id ? state[focused.filter_id] : null}
              onSelect={onView ? select(focused) : undefined} onChoose={onChoose} onFocus={() => setFocus(null)} busy={busy} />
          </div>
        </div>
      )}
    </div>
  );
}
