import React, { useState } from 'react';
import { BadgeCheck, Check, Loader2 } from 'lucide-react';
import { chooseClarification, saveClarificationAsDefinition } from '../../services/api';

function formatCell(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    const digits = Number.isInteger(value) ? 0 : 2;
    return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  return String(value);
}

export default function ClarifyOptions({ runId, options = [], isDark = false, canApprove = false }) {
  const [chosen, setChosen] = useState(null);
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  if (!options.length) return null;

  const choose = async (index) => {
    if (loading !== null) return;
    setLoading(index);
    setError('');
    try {
      const response = await chooseClarification(runId, index);
      setChosen(index);
      setResult(response);
    } catch (err) {
      setError(err.status === 404
        ? 'This choice is no longer available. Ask the question again, adding the meaning you intend.'
        : err.message);
    } finally {
      setLoading(null);
    }
  };

  const saveAsDefinition = async () => {
    setSaving(true);
    setError('');
    try {
      const definition = await saveClarificationAsDefinition(runId, chosen);
      setSaved(definition.term);
    } catch (err) {
      setError(err.status === 403 ? 'Only an owner or analyst can set company definitions.' : err.message);
    } finally {
      setSaving(false);
    }
  };

  const rows = result?.rows || [];
  const chosenDefinition = chosen !== null ? options[chosen]?.definition : null;
  const single = rows.length === 1 && rows[0].length === 1;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option, index) => {
          const isChosen = chosen === index;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => choose(index)}
              disabled={loading !== null}
              className={`rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-wait ${
                isChosen
                  ? isDark ? 'border-sky-500 bg-sky-950/40' : 'border-sky-500 bg-sky-50'
                  : isDark ? 'border-slate-700 bg-slate-900 hover:border-sky-700' : 'border-slate-200 bg-white hover:border-sky-300'
              }`}
            >
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                {loading === index && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {isChosen && <Check className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />}
                {option.label}
              </span>
              <span className={`mt-0.5 block font-mono text-sm tabular-nums ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {option.preview}
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
      {result && (
        <div className={`rounded-xl border px-3 py-2 text-xs ${isDark ? 'border-sky-900/60 bg-sky-950/30 text-slate-200' : 'border-sky-200 bg-sky-50/60 text-slate-700'}`}>
          <p className="font-semibold">Using: {result.label}</p>
          {single ? (
            <p className="mt-1 font-mono text-lg tabular-nums">{formatCell(rows[0][0])}</p>
          ) : (
            <table className="mt-1 w-full text-left font-mono text-[11px]">
              <thead>
                <tr>{(result.columns || []).map((c) => <th key={c} className="pr-3 font-semibold">{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => <td key={j} className="pr-3">{formatCell(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
          {saved ? (
            <p className={`mt-2 flex items-center gap-1 text-[11px] font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Saved. Every answer about "{saved}" now uses this meaning.
            </p>
          ) : canApprove && chosenDefinition ? (
            <button
              type="button"
              onClick={saveAsDefinition}
              disabled={saving}
              className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60 ${
                isDark ? 'border-sky-700 text-sky-300 hover:bg-sky-950/60' : 'border-sky-300 text-sky-700 hover:bg-sky-100'
              }`}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              Always use this for "{chosenDefinition.term}"
            </button>
          ) : (
            <p className={`mt-1 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              An owner or analyst can save this choice as the company's definition, so everyone gets the same number.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
