import React, { useMemo, useState } from 'react';
import { Check, PanelLeftClose, PanelLeftOpen, Plus, Search, Trash2, X } from 'lucide-react';

function dayGroup(iso) {
  const date = new Date(iso);
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(date)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 31) return 'This month';
  return 'Older';
}

function when(iso) {
  const date = new Date(iso);
  const days = Math.round((Date.now() - date.getTime()) / 86400000);
  return days < 1 ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Row({ entry, active, onOpen, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  const period = entry.summary?.period;
  return (
    <li className={`group relative rounded-xl transition ${active ? 'bg-indigo-50 dark:bg-indigo-500/15' : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'}`}>
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-indigo-600" aria-hidden="true" />}
      <button type="button" onClick={() => onOpen(entry)} aria-current={active ? 'true' : undefined} className="block w-full min-w-0 px-3 py-2 pr-9 text-left">
        <span className={`block truncate text-[13px] ${active ? 'font-semibold text-indigo-900 dark:text-indigo-100' : 'font-medium text-slate-800 dark:text-slate-100'}`}>{entry.title}</span>
        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{period ? `${period} · ` : ''}{when(entry.updated_at)}</span>
      </button>
      {confirm ? (
        <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg bg-white p-0.5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
          <button type="button" onClick={() => onDelete([entry.id])} title="Delete" aria-label={`Delete ${entry.title}`} className="rounded-md p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/15"><Check className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setConfirm(false)} title="Keep" aria-label="Keep" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-3.5 w-3.5" /></button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} title="Delete" aria-label={`Delete ${entry.title}`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-white hover:text-rose-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-900">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

// Every report built on this data source, always beside the work, like a chat list.
export default function ReportHistoryRail({ entries, loading, currentId, onOpen, onNew, onDelete, onManage, collapsed, onToggle }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const out = [];
    entries
      .filter((e) => !query || `${e.title} ${e.question || ''}`.toLowerCase().includes(query.toLowerCase()))
      .forEach((entry) => {
        const name = dayGroup(entry.updated_at);
        const group = out.find((g) => g.name === name);
        if (group) group.items.push(entry);
        else out.push({ name, items: [entry] });
      });
    return out;
  }, [entries, query]);

  if (collapsed) {
    return (
      <aside className="hidden flex-col items-center gap-1.5 lg:sticky lg:top-0 lg:flex" aria-label="Report history">
        <button type="button" onClick={onToggle} title="Show history" aria-label="Show history" className="rounded-xl p-2.5 text-slate-500 hover:bg-white hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"><PanelLeftOpen className="h-4 w-4" /></button>
        <button type="button" onClick={onNew} title="New report" aria-label="New report" className="rounded-xl bg-indigo-600 p-2.5 text-white hover:bg-indigo-700"><Plus className="h-4 w-4" /></button>
      </aside>
    );
  }

  return (
    <aside className="hidden h-[calc(100dvh-104px)] flex-col lg:sticky lg:top-0 lg:flex" aria-label="Report history">
      <div className="flex items-center gap-2 pb-3">
        <button type="button" onClick={onNew}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
          <Plus className="h-4 w-4" /> New report
        </button>
        <button type="button" onClick={onToggle} title="Hide history" aria-label="Hide history" className="rounded-xl p-2.5 text-slate-500 hover:bg-white hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"><PanelLeftClose className="h-4 w-4" /></button>
      </div>
      {entries.length > 4 && (
        <label className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search reports" className="h-8 w-full bg-transparent text-[13px] outline-none dark:text-slate-100" />
        </label>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {loading && !entries.length ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-11 rounded-xl" />)}</div>
        ) : !entries.length ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500">Your reports will appear here.</p>
        ) : !groups.length ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500">No match.</p>
        ) : (
          groups.map((group) => (
            <div key={group.name} className="mb-3">
              <p className="px-3 pb-1 text-[11px] font-medium text-slate-400">{group.name}</p>
              <ul className="space-y-0.5">
                {group.items.map((entry) => <Row key={entry.id} entry={entry} active={entry.id === currentId} onOpen={onOpen} onDelete={onDelete} />)}
              </ul>
            </div>
          ))
        )}
      </div>
      {entries.length > 1 && (
        <button type="button" onClick={onManage} className="mt-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
          Manage all {entries.length}
        </button>
      )}
    </aside>
  );
}
