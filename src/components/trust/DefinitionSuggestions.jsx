import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Check, Loader2 } from 'lucide-react';
import { createDefinition, fetchDefinitionSuggestions } from '../../services/api';
import { getClientCache } from '../../services/clientCache';

// Terms in this data source that give different numbers depending on their meaning.
// Approving one meaning each means every later answer uses it, instead of asking every time.
export default function DefinitionSuggestions({ connectionId, onApproved, onCount }) {
  const cacheKey = `definition-suggestions:${connectionId}`;
  const [suggestions, setSuggestions] = useState(() => getClientCache(cacheKey, 24 * 3600 * 1000) || null);
  const [choices, setChoices] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (force = false) => {
    if (!connectionId) return;
    setError('');
    try {
      const list = await fetchDefinitionSuggestions(connectionId, { force });
      setSuggestions(list);
      setChoices((current) => ({ ...Object.fromEntries(list.map((s) => [s.term, s.recommended])), ...current }));
    } catch (err) {
      setSuggestions((current) => current || []);
      setError(err.message);
    }
  }, [connectionId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { onCount?.(suggestions ? suggestions.length : null); }, [suggestions, onCount]);

  const approve = async (items) => {
    setBusy(items.length > 1 ? '*' : items[0].term);
    setError('');
    try {
      for (const suggestion of items) {
        const option = suggestion.options[choices[suggestion.term] ?? suggestion.recommended];
        await createDefinition(connectionId, { ...option.definition, approve: true });
      }
      onApproved?.();
      await load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  if (suggestions === null) {
    return (
      <div className="space-y-3" aria-label="Checking this data source for terms that need a meaning">
        {[0, 1].map((i) => <div key={i} className="skel h-36 rounded-2xl" />)}
      </div>
    );
  }
  if (!suggestions.length) {
    return error ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : (
      <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
        <Check className="h-4 w-4" aria-hidden="true" /> Every term SlayQL found has a meaning. Nothing to settle.
      </p>
    );
  }

  const allRecommended = suggestions.every((s) => (choices[s.term] ?? s.recommended) === s.recommended);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Each of these gives a different number depending on what it means. Pick one meaning and every answer and report uses it.
        </p>
        <button
          type="button"
          onClick={() => approve(suggestions)}
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.8)] transition hover:brightness-110 disabled:opacity-60"
        >
          {busy === '*' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4" aria-hidden="true" />}
          {allRecommended ? `Approve all recommended (${suggestions.length})` : `Approve all selected (${suggestions.length})`}
        </button>
      </div>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="space-y-3">
        {suggestions.map((suggestion) => {
          const selected = choices[suggestion.term] ?? suggestion.recommended;
          return (
            <article key={suggestion.term} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(49,46,129,0.6)] md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-6 dark:border-slate-800 dark:bg-[#121622]">
              <div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-sm font-semibold text-white">{suggestion.term}</span>
                <span className="text-xs text-slate-500">{suggestion.source}</span>
              </div>
              <h3 className="mt-2.5 font-semibold text-slate-900 dark:text-slate-100">{suggestion.question}</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{suggestion.detail}</p>
              </div>
              <div className="flex flex-col">
              <fieldset className="space-y-1.5">
                <legend className="sr-only">{suggestion.question}</legend>
                {suggestion.options.map((option, index) => {
                  const on = selected === index;
                  return (
                    <label
                      key={option.label}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                        on
                          ? 'border-indigo-300 bg-gradient-to-r from-indigo-50 to-violet-50 dark:border-indigo-500/60 dark:from-indigo-500/15 dark:to-violet-500/10'
                          : 'border-slate-200 hover:border-indigo-200 dark:border-slate-700 dark:hover:border-indigo-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`suggestion-${suggestion.term}`}
                        checked={on}
                        onChange={() => setChoices({ ...choices, [suggestion.term]: index })}
                        className="accent-indigo-600"
                      />
                      <span className="flex-1 text-slate-700 dark:text-slate-200">
                        {option.label}
                        {index === suggestion.recommended && (
                          <span className="ml-1.5 rounded-md bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Recommended</span>
                        )}
                      </span>
                      <span className="text-base font-semibold tabular-nums text-slate-950 dark:text-white">{option.value}</span>
                    </label>
                  );
                })}
              </fieldset>
              <button
                type="button"
                onClick={() => approve([suggestion])}
                disabled={Boolean(busy)}
                className="mt-3 inline-flex items-center justify-center gap-1.5 self-end rounded-xl border border-indigo-200 px-3 py-1.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
              >
                {busy === suggestion.term && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Approve this meaning
              </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
