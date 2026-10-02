import React, { useEffect, useMemo, useState } from 'react';
import { Check, History, Search, X } from 'lucide-react';
import { fetchReportQuestions } from '../../services/api';

// Questions asked in chat on this data source. Picked ones become figures in the report,
// so a report can bundle everything someone keeps asking each week.
export default function PastQuestionsPicker({ connectionId, onAdd, onClose, actionLabel = 'Add to report' }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    fetchReportQuestions(connectionId).then(setItems).catch((err) => { setItems([]); setError(err.message); });
  }, [connectionId]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = useMemo(() => (items || []).filter((q) => q.question.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const toggle = (item) => setPicked(picked.some((p) => p.id === item.id) ? picked.filter((p) => p.id !== item.id) : [...picked, item].slice(0, 8));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add past questions">
      <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-[#121622]">
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"><History className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Add questions you asked before</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">The agent turns each one into a checked figure that follows the report&apos;s period, so it arrives in every edition.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your questions" className="h-10 w-full bg-transparent text-sm outline-none dark:text-slate-100" />
          </label>
        </div>
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {items === null && [0, 1, 2, 3].map((i) => <li key={i} className="skel h-14 rounded-xl" />)}
          {items !== null && !shown.length && (
            <li className="px-4 py-10 text-center text-sm text-slate-500">{error || (items.length ? 'No questions match.' : 'No chat questions with SQL on this data source yet. Ask some in the chat first.')}</li>
          )}
          {shown.map((item) => {
            const on = picked.some((p) => p.id === item.id);
            return (
              <li key={item.id}>
                <button type="button" onClick={() => toggle(item)} aria-pressed={on}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${on ? 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-500/60 dark:bg-indigo-500/10' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{item.question}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">{item.sql}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{new Date(item.asked_at).toLocaleDateString()}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <span className="text-xs text-slate-500">{picked.length ? `${picked.length} selected (up to 8)` : 'Pick one or more'}</span>
          <button type="button" onClick={() => onAdd(picked)} disabled={!picked.length}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {actionLabel}{picked.length ? ` (${picked.length})` : ''}
          </button>
        </footer>
      </div>
    </div>
  );
}
