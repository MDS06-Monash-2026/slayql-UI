import React from 'react';
import { GraduationCap } from 'lucide-react';

const pct = (value) => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);

/**
 * What SlayQL has learned about its own reliability on one data source,
 * from the analyst's review decisions.
 */
export default function LearningPanel({ status, connections, connectionId, onConnectionChange }) {
  if (!status) return null;
  const progress = Math.min(1, status.labels / status.min_labels);
  const answersClean = status.clean_answer_confidence >= status.threshold;
  const answeredDefault = status.clean_answer_confidence_default >= status.threshold;

  return (
    <section className="rounded-2xl border border-indigo-100 bg-white p-5 dark:border-indigo-900/40 dark:bg-[#121622]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">What SlayQL has learned from your reviews</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Each answer you confirm or correct teaches SlayQL how reliable it is on this data source.
            </p>
          </div>
        </div>
        {connections.length > 1 && (
          <select
            value={connectionId}
            onChange={(e) => onConnectionChange(e.target.value)}
            aria-label="Data source"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
          <dt className="text-xs font-semibold text-slate-500">Answers reviewed</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{status.labels}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
          <dt className="text-xs font-semibold text-slate-500">Right / wrong</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            <span className="text-emerald-700 dark:text-emerald-400">{status.correct}</span>
            <span className="text-slate-300"> / </span>
            <span className="text-rose-700 dark:text-rose-400">{status.wrong}</span>
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
          <dt className="text-xs font-semibold text-slate-500">Given as fact, then found wrong</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {status.reviewed_answers.wrong}<span className="text-sm font-medium text-slate-400"> of {status.reviewed_answers.n}</span>
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
          <dt className="text-xs font-semibold text-slate-500">Confidence when all checks pass</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {pct(status.clean_answer_confidence)}
            {status.active && (
              <span className="ml-1 text-sm font-medium text-slate-400 line-through">{pct(status.clean_answer_confidence_default)}</span>
            )}
          </dd>
        </div>
      </dl>

      {status.active ? (
        <p className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
          <b>Recalibrated from {status.labels} reviews.</b>{' '}
          {answersClean === answeredDefault
            ? `Answers that pass every check still ${answersClean ? 'go straight to the user' : 'come to you first'}, but SlayQL's confidence now reflects how often it is right here.`
            : answersClean
              ? 'Your reviews show SlayQL is reliable here, so answers that pass every check now go straight to the user instead of coming to you.'
              : `Your reviews show clean-looking answers are wrong too often here, so they now come to you before anyone sees them (they need ${pct(status.threshold)} confidence).`}
        </p>
      ) : (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={status.labels} aria-valuemin={0} aria-valuemax={status.min_labels}>
            <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Using the default confidence model. SlayQL recalibrates for this data source after {status.min_labels} reviewed answers,
            with at least {status.min_each} right and {status.min_each} wrong ({status.needed} more needed). Dismissed items do not count.
          </p>
        </div>
      )}
    </section>
  );
}
