import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bot,
  CalendarClock,
  CalendarDays,
  Check,
  CheckSquare,
  Clock,
  FileText,
  Loader2,
  Package,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { formatValue } from './chartTheme';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'agent', label: 'Built by the agent' },
  { id: 'pack', label: 'Ready-made' },
];

const SOURCE = {
  agent: { label: 'AI agent', Icon: Bot, tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  pack: { label: 'Ready-made', Icon: Package, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  catalog: { label: 'From structure', Icon: FileText, tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  saved: { label: 'Saved', Icon: FileText, tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

function dayGroup(iso) {
  const date = new Date(iso);
  const today = new Date();
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(today) - start(date)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Earlier this week';
  if (days < 31) return 'Earlier this month';
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function timeLabel(iso) {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function KpiPreview({ kpi }) {
  const change = kpi.previous ? (kpi.value - kpi.previous) / Math.abs(kpi.previous) : null;
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-base font-semibold text-slate-900 dark:text-white">{formatValue(kpi.value, kpi.format)}</span>
        {change !== null && change !== 0 && (
          <span className={`inline-flex items-center text-[11px] font-semibold ${change > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
            {change > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(change * 100).toFixed(0)}%
          </span>
        )}
      </p>
    </div>
  );
}

function HistoryCard({ entry, current, selecting, selected, onToggle, onOpen, onDelete, deleting }) {
  const [confirm, setConfirm] = useState(false);
  const summary = entry.summary || {};
  const source = SOURCE[summary.source] || SOURCE.saved;
  const charts = [...new Set(summary.charts || [])];
  const passed = summary.figures ? `${summary.passed} of ${summary.figures} checked` : null;
  return (
    <article className={`group relative rounded-2xl border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-30px_rgba(49,46,129,0.55)] dark:bg-[#121622] ${
      selected ? 'border-indigo-400 ring-1 ring-indigo-400' : current ? 'border-indigo-200 dark:border-indigo-500/40' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="flex items-start gap-3">
        {selecting ? (
          <button type="button" onClick={() => onToggle(entry.id)} aria-pressed={selected} aria-label={`Select ${entry.title}`}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
            {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </button>
        ) : (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${source.tone}`}><source.Icon className="h-4 w-4" /></span>
        )}
        <button type="button" onClick={() => (selecting ? onToggle(entry.id) : onOpen(entry))} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{entry.title}</h3>
            {current && <span className="rounded-full bg-indigo-600 px-2 py-px text-[10px] font-semibold text-white">Open now</span>}
          </div>
          {entry.question && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">“{entry.question.split('\n')[0]}”</p>}
        </button>
        {!selecting && (
          confirm ? (
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => onDelete([entry.id])} disabled={deleting}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Keep it"><X className="h-4 w-4" /></button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} title="Delete from history"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-rose-500/15">
              <Trash2 className="h-4 w-4" />
            </button>
          )
        )}
      </div>

      {summary.kpis?.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">{summary.kpis.map((kpi) => <KpiPreview key={kpi.label} kpi={kpi} />)}</div>
      )}
      {summary.headline && <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{summary.headline}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {summary.period && (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {summary.grain === 'month' ? <CalendarClock className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}{summary.period}
          </span>
        )}
        {charts.length > 0 && <span className="inline-flex items-center gap-1"><BarChart3 className="h-3 w-3" /> {summary.charts.length} charts</span>}
        {passed && <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald-600" /> {passed}</span>}
        <span className="ml-auto inline-flex items-center gap-1" title={new Date(entry.updated_at).toLocaleString()}><Clock className="h-3 w-3" /> {timeLabel(entry.updated_at)}</span>
      </div>
    </article>
  );
}

// Every report built on this data source, newest first: review, reopen or delete.
export default function ReportHistory({ entries, loading, currentId, onOpen, onDelete, onClose }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const shown = useMemo(() => entries.filter((entry) => {
    const s = entry.summary || {};
    const text = `${entry.title} ${entry.question || ''} ${s.headline || ''}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (filter === 'week' || filter === 'month') return s.grain === filter;
    if (filter === 'agent' || filter === 'pack') return s.source === filter;
    return true;
  }), [entries, query, filter]);

  const groups = useMemo(() => {
    const out = [];
    shown.forEach((entry) => {
      const name = dayGroup(entry.updated_at);
      const group = out.find((g) => g.name === name);
      if (group) group.items.push(entry);
      else out.push({ name, items: [entry] });
    });
    return out;
  }, [shown]);

  const remove = async (ids) => {
    setDeleting(true);
    try {
      await onDelete(ids);
      setSelected((current) => current.filter((id) => !ids.includes(id)));
      setConfirmBulk(false);
      if (ids.length > 1) setSelecting(false);
    } finally {
      setDeleting(false);
    }
  };
  const toggle = (id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const allShown = shown.length > 0 && shown.every((e) => selected.includes(e.id));

  return (
    <section className="space-y-4" aria-label="Report history">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Report history</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Every report built on this data source is kept here automatically. Open one to filter or re-run it for free.</p>
        </div>
        <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{entries.length} report{entries.length === 1 ? '' : 's'}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-[#121622]">
        <label className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3 dark:bg-slate-900">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, questions and findings" aria-label="Search report history"
            className="h-9 w-full bg-transparent text-sm outline-none dark:text-slate-100" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter reports">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${filter === f.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { setSelecting(!selecting); setSelected([]); setConfirmBulk(false); }} disabled={!entries.length}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${selecting ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
          <CheckSquare className="h-3.5 w-3.5" /> {selecting ? 'Done' : 'Select'}
        </button>
      </div>

      {selecting && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/95 px-4 py-2.5 text-sm backdrop-blur dark:border-indigo-500/40 dark:bg-indigo-950/80">
          <button type="button" onClick={() => setSelected(allShown ? [] : shown.map((e) => e.id))} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 dark:text-indigo-200">
            {allShown ? 'Clear selection' : `Select all ${shown.length}`}
          </button>
          <span className="text-xs text-indigo-900/80 dark:text-indigo-100/80">{selected.length} selected</span>
          <span className="ml-auto flex items-center gap-2">
            {confirmBulk ? (
              <>
                <span className="text-xs font-medium text-rose-700 dark:text-rose-300">Delete {selected.length} report{selected.length === 1 ? '' : 's'} for good?</span>
                <button type="button" onClick={() => remove(selected)} disabled={deleting}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                </button>
                <button type="button" onClick={() => setConfirmBulk(false)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white/60 dark:text-slate-300">Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmBulk(true)} disabled={!selected.length}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-900 dark:bg-transparent dark:text-rose-300">
                <Trash2 className="h-3.5 w-3.5" /> Delete selected
              </button>
            )}
          </span>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skel h-52 rounded-2xl" />)}</div>
      ) : !entries.length ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"><Clock className="h-6 w-6" /></span>
          <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">No reports yet</p>
          <p className="mt-1 max-w-sm text-xs text-slate-500">Reports you build appear here automatically, so you can come back to them, compare periods and clean up.</p>
        </div>
      ) : !shown.length ? (
        <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-slate-500 dark:bg-[#121622]">No reports match. Try another word or filter.</p>
      ) : (
        groups.map((group) => (
          <div key={group.name}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.name}</h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((entry) => (
                <HistoryCard key={entry.id} entry={entry} current={entry.id === currentId} selecting={selecting} selected={selected.includes(entry.id)}
                  onToggle={toggle} onOpen={onOpen} onDelete={remove} deleting={deleting} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
