import React from 'react';
import { AlertTriangle, BadgeCheck, Check, HelpCircle, ShieldCheck, UserCheck, X } from 'lucide-react';
import EvidencePanel from './EvidencePanel';
import ClarifyOptions from './ClarifyOptions';

// The answer's verdict as one card: what SlayQL decided, how sure it is against the business
// threshold, and each check it ran on the real data (ticked, or flagged with why).

const OUTCOME = {
  confident: {
    label: 'Checks passed', Icon: ShieldCheck,
    sub: 'Verified against your data before it was shown.',
    light: 'border-emerald-200 bg-emerald-50/60', dark: 'border-emerald-900/60 bg-emerald-950/25',
    head: 'text-emerald-800', headDark: 'text-emerald-300', bar: '#059669',
  },
  caveat: {
    label: 'Answer with a caveat', Icon: AlertTriangle,
    sub: 'The figure stands, with a limitation you should know about.',
    light: 'border-amber-200 bg-amber-50/60', dark: 'border-amber-900/60 bg-amber-950/25',
    head: 'text-amber-800', headDark: 'text-amber-300', bar: '#d97706',
  },
  clarify: {
    label: 'Needs your input', Icon: HelpCircle,
    sub: 'This question has more than one meaning. Pick the one you mean.',
    light: 'border-sky-200 bg-sky-50/60', dark: 'border-sky-900/60 bg-sky-950/25',
    head: 'text-sky-800', headDark: 'text-sky-300', bar: '#0284c7',
  },
  handoff: {
    label: 'Sent to an analyst', Icon: UserCheck,
    sub: 'Not sure enough to state a figure. An analyst will answer, and you will be notified.',
    light: 'border-slate-200 bg-slate-50', dark: 'border-slate-700 bg-slate-800/40',
    head: 'text-slate-800', headDark: 'text-slate-200', bar: '#d97706',
  },
};

// The checks run on every answer (backend/app/verification/checks.py), in plain words.
const CHECKS = [
  { id: 'grain', label: 'No double counting' },
  { id: 'definition', label: 'Meaning is clear' },
  { id: 'filter', label: 'Filters match real values' },
  { id: 'period', label: 'Dates are in the data' },
  { id: 'coverage', label: 'Data covers the question' },
  { id: 'sanity', label: 'Result looks sane' },
];

function checkState(findings, id) {
  const hits = findings.filter((f) => f.check === id);
  if (hits.some((f) => f.severity === 'blocking')) return { state: 'fail', note: hits[0].title };
  if (hits.some((f) => f.severity === 'ambiguity' || f.severity === 'warning')) return { state: 'warn', note: hits[0].title };
  return { state: 'pass' };
}

export default function TrustPanel({ verification, dataSent, runId, isDark = false, canApprove = false }) {
  if (!verification) return null;
  const style = OUTCOME[verification.outcome] || OUTCOME.confident;
  const { Icon } = style;
  const findings = verification.findings || [];
  const approved = Boolean(verification.verified_query || (verification.definitions_used || []).length);
  const p = typeof verification.probability === 'number' ? verification.probability : null;
  const t = typeof verification.threshold === 'number' ? verification.threshold : null;
  const consensus = verification.consensus || {};
  // Only candidates that passed the checks get a vote; if none did, say so plainly.
  const voters = Math.max(0, (consensus.succeeded || 0) - (consensus.excluded_by_checks || 0));
  const agreeing = consensus.candidates > 1 ? (voters ? Math.min(voters, Math.round((consensus.agreement || 0) * (consensus.succeeded || 0))) : 0) : null;
  const readsNoData = findings.some((f) => f.check === 'sanity' && /does not read any data/i.test(f.title || ''));
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`overflow-hidden rounded-2xl border ${isDark ? style.dark : style.light}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3.5">
        <div className="flex items-start gap-2.5">
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white`} style={{ background: style.bar }}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className={`flex flex-wrap items-center gap-2 text-sm font-semibold ${isDark ? style.headDark : style.head}`}>
              {style.label}
              {approved && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${isDark ? 'bg-indigo-500/15 text-indigo-200' : 'bg-indigo-100 text-indigo-700'}`}>
                  <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Approved definition
                </span>
              )}
            </p>
            <p className={`text-xs ${muted}`}>{style.sub}</p>
          </div>
        </div>
        {p !== null && t !== null && verification.outcome !== 'clarify' && (
          <div className="w-44" title={`Answers are given above ${Math.round(t * 100)}% confidence`}>
            <div className={`flex justify-between text-[11px] ${muted}`}>
              <span>Confidence</span>
              <span className={`font-semibold tabular-nums ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{Math.round(p * 100)}%</span>
            </div>
            <div className={`relative mt-1 h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-white'}`}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, p * 100)}%`, background: p >= t ? style.bar : '#d97706' }} />
              <span className={`absolute -top-1 h-3.5 w-0.5 rounded ${isDark ? 'bg-slate-300' : 'bg-slate-700'}`} style={{ left: `${t * 100}%` }} aria-hidden="true" />
            </div>
            <p className={`mt-0.5 text-[10px] ${muted}`}>Bar at {Math.round(t * 100)}%</p>
          </div>
        )}
      </div>

      {/* each check, ticked or flagged */}
      <ul className="grid gap-x-4 gap-y-1.5 px-4 pb-3 pt-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Checks run on this answer">
        {CHECKS.map(({ id, label }) => {
          const { state, note } = id === 'sanity' && readsNoData
            ? { state: 'fail', note: 'Returned fixed text instead of data' }
            : checkState(findings, id);
          return (
            <li key={id} className="flex items-start gap-1.5 text-xs" title={note || 'Passed'}>
              {state === 'pass' ? (
                <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} aria-label="Passed" />
              ) : state === 'warn' ? (
                <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} aria-label="Needs attention" />
              ) : (
                <X className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} aria-label="Failed" />
              )}
              <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>
                {label}
                {state !== 'pass' && note && <span className={`block ${muted}`}>{note}</span>}
              </span>
            </li>
          );
        })}
        {agreeing !== null && (
          <li className="flex items-start gap-1.5 text-xs">
            {agreeing && agreeing === consensus.candidates
              ? <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} aria-label="Passed" />
              : <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} aria-label="Partial agreement" />}
            <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{agreeing ? `${agreeing} of ${consensus.candidates} queries agree` : `None of ${consensus.candidates} queries passed the checks`}</span>
          </li>
        )}
      </ul>

      {(findings.filter((f) => f.data?.assumption).length > 0 || verification.outcome === 'clarify') && (
        <div className="space-y-2 px-4 pb-3">
          {findings.filter((f) => f.data?.assumption).map((f) => (
            <p key={f.title} className={`text-xs ${muted}`}>
              <span className="font-semibold">Assumption:</span> {f.title}. {f.detail}
            </p>
          ))}
          {verification.outcome === 'clarify' && (
            <ClarifyOptions runId={runId} options={verification.clarify_options || []} isDark={isDark} canApprove={canApprove} />
          )}
        </div>
      )}

      <div className={`border-t px-1 ${isDark ? 'border-white/5' : 'border-black/5'}`}>
        <EvidencePanel
          verification={verification}
          dataSent={dataSent}
          isDark={isDark}
          defaultOpen={verification.outcome === 'handoff' || verification.outcome === 'caveat'}
          embedded
        />
      </div>
    </div>
  );
}
