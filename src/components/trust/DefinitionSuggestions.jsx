import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Loader2, Sparkles } from 'lucide-react';
import { createDefinition, fetchDefinitionSuggestions } from '../../services/api';

// Terms in this data source that give different numbers depending on their meaning.
// Approving one meaning each means every later answer uses it, instead of asking every time.
export default function DefinitionSuggestions({ connectionId, onApproved }) {
  const [suggestions, setSuggestions] = useState(null);
  const [choices, setChoices] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!connectionId) return;
    setSuggestions(null);
    setError('');
    try {
      const list = await fetchDefinitionSuggestions(connectionId);
      setSuggestions(list);
      setChoices(Object.fromEntries(list.map((s) => [s.term, s.recommended])));
    } catch (err) {
      setSuggestions([]);
      setError(err.message);
    }
  }, [connectionId]);

  useEffect(() => { load(); }, [load]);

  const approve = async (items) => {
    setBusy(items.length > 1 ? '*' : items[0].term);
    setError('');
    try {
      for (const suggestion of items) {
        const option = suggestion.options[choices[suggestion.term] ?? suggestion.recommended];
        await createDefinition(connectionId, { ...option.definition, approve: true });
      }
      onApproved?.();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  if (suggestions === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking this data source for terms that need a meaning…
      </p>
    );
  }
  if (!suggestions.length) {
    return error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null;
  }

  const allRecommended = suggestions.every((s) => (choices[s.term] ?? s.recommended) === s.recommended);

  return (
    <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 dark:border-indigo-900/60 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" /> Set up your definitions
          </h2>
          <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            These terms give different numbers depending on what they mean. Approve one meaning each, and every answer and report uses it instead of asking.
          </p>
        </div>
        <button
          type="button"
          onClick={() => approve(suggestions)}
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy === '*' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4" aria-hidden="true" />}
          {allRecommended ? `Approve all recommended (${suggestions.length})` : `Approve all selected (${suggestions.length})`}
        </button>
      </div>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {suggestions.map((suggestion) => {
          const selected = choices[suggestion.term] ?? suggestion.recommended;
          return (
            <article key={suggestion.term} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121622]">
              <span className="self-start rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {suggestion.source}
              </span>
              <h3 className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{suggestion.question}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{suggestion.detail}</p>
              <fieldset className="mt-3 space-y-1.5">
                <legend className="sr-only">{suggestion.question}</legend>
                {suggestion.options.map((option, index) => (
                  <label
                    key={option.label}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                      selected === index
                        ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/40'
                        : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`suggestion-${suggestion.term}`}
                      checked={selected === index}
                      onChange={() => setChoices({ ...choices, [suggestion.term]: index })}
                      className="mt-1 accent-indigo-600"
                    />
                    <span className="flex-1 text-slate-700 dark:text-slate-200">
                      {option.label}
                      {index === suggestion.recommended && (
                        <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          Recommended
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100">{option.value}</span>
                  </label>
                ))}
              </fieldset>
              <button
                type="button"
                onClick={() => approve([suggestion])}
                disabled={Boolean(busy)}
                className="mt-3 inline-flex items-center justify-center gap-1.5 self-end rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
              >
                {busy === suggestion.term && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Approve this meaning
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
