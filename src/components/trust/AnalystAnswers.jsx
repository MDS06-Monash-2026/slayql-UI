import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Inbox, Loader2 } from 'lucide-react';
import { fetchMyAnswerResult, fetchMyAnswers } from '../../services/api';

const SEEN_KEY = 'slayql_answers_seen_at';
const VERDICT = {
  confirmed: { label: 'Confirmed', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  corrected: { label: 'Corrected', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  dismissed: { label: 'Not answerable', tone: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

function formatCell(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}

// Questions the user asked that went to an analyst, and what the analyst decided.
export default function AnalystAnswers({ enabled = true }) {
  const [answers, setAnswers] = useState([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(() => localStorage.getItem(SEEN_KEY) || '');
  const [results, setResults] = useState({});

  const load = useCallback(() => {
    if (!enabled) return;
    fetchMyAnswers().then(setAnswers).catch(() => {});
  }, [enabled]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  if (!answers.length) return null;
  const unseen = answers.filter((a) => a.answered_at > seenAt).length;

  const toggle = () => {
    if (!open && answers[0]) {
      localStorage.setItem(SEEN_KEY, answers[0].answered_at);
      setSeenAt(answers[0].answered_at);
    }
    setOpen(!open);
  };

  const showResult = async (id) => {
    setResults((r) => ({ ...r, [id]: { loading: true } }));
    try {
      const data = await fetchMyAnswerResult(id);
      setResults((r) => ({ ...r, [id]: { data } }));
    } catch (err) {
      setResults((r) => ({ ...r, [id]: { error: err.message } }));
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200/60 transition-all"
      >
        <Inbox className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
        <span className="flex-1 text-left">Answers from your analyst</span>
        {unseen > 0 && (
          <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white" aria-label={`${unseen} new`}>{unseen}</span>
        )}
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="mt-1 space-y-1.5 px-1">
          {answers.map((answer) => {
            const verdict = VERDICT[answer.resolution] || { label: answer.resolution, tone: VERDICT.dismissed.tone };
            const result = results[answer.id];
            const rows = result?.data?.rows || [];
            const single = rows.length === 1 && rows[0].length === 1;
            return (
              <li key={answer.id} className="rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <div className="flex items-start gap-1.5">
                  <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${verdict.tone}`}>{verdict.label}</span>
                  <span className="font-medium leading-snug">{answer.question}</span>
                </div>
                {answer.note && <p className="mt-1 italic text-slate-500 dark:text-slate-400">“{answer.note}”</p>}
                {answer.has_answer && !result && (
                  <button type="button" onClick={() => showResult(answer.id)} className="mt-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                    Show answer
                  </button>
                )}
                {result && !result.data && !result.error && <Loader2 className="mt-1 h-3 w-3 animate-spin" aria-label="Loading" />}
                {result?.error && <p className="mt-1 text-rose-600">{result.error}</p>}
                {result?.data && (single ? (
                  <p className="mt-1 font-mono text-base tabular-nums text-slate-900 dark:text-slate-100">{formatCell(rows[0][0])}</p>
                ) : (
                  <table className="mt-1 w-full font-mono text-[10px]">
                    <thead><tr>{result.data.columns.map((c) => <th key={c} className="pr-2 text-left font-semibold">{c}</th>)}</tr></thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, i) => (
                        <tr key={i}>{row.map((cell, j) => <td key={j} className="pr-2">{formatCell(cell)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
