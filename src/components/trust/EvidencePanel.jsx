import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, HelpCircle, Info, Send, Users } from 'lucide-react';

const SEVERITY = {
  blocking: { Icon: AlertOctagon, light: 'text-rose-600', dark: 'text-rose-400', label: 'Problem' },
  ambiguity: { Icon: HelpCircle, light: 'text-sky-600', dark: 'text-sky-400', label: 'Ambiguous' },
  warning: { Icon: AlertTriangle, light: 'text-amber-600', dark: 'text-amber-400', label: 'Note' },
  info: { Icon: Info, light: 'text-slate-500', dark: 'text-slate-400', label: 'Info' },
};

function consensusText(consensus) {
  if (!consensus || !consensus.candidates) return null;
  if (consensus.candidates <= 1) return 'One query was generated; no independent comparison at this effort level.';
  const agreeing = Math.round((consensus.agreement || 0) * (consensus.succeeded || 0));
  const excluded = consensus.excluded_by_checks
    ? ` ${consensus.excluded_by_checks} failed a check and did not get a vote.`
    : '';
  return `${agreeing} of ${consensus.candidates} independently written queries returned the same answer.${excluded}`;
}

export default function EvidencePanel({ verification, dataSent, isDark = false, defaultOpen = false }) {
  if (!verification) return null;
  const findings = verification.findings || [];
  const consensus = consensusText(verification.consensus);
  const definitions = verification.definitions_used || [];
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <details
      open={defaultOpen}
      className={`rounded-xl border px-3.5 py-2 text-xs ${isDark ? 'border-slate-800 bg-[#121622] text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
    >
      <summary className={`cursor-pointer font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
        Why SlayQL says this
      </summary>
      <div className="mt-2 space-y-2.5">
        {findings.length === 0 ? (
          <p className="flex items-start gap-2">
            <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} aria-hidden="true" />
            No double counting from joins, no silently included cancelled records, and no dates outside the data were found.
          </p>
        ) : (
          <ul className="space-y-2">
            {findings.map((finding, index) => {
              const style = SEVERITY[finding.severity] || SEVERITY.info;
              const { Icon } = style;
              return (
                <li key={`${finding.check}-${index}`} className="flex items-start gap-2">
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? style.dark : style.light}`} aria-hidden="true" />
                  <span>
                    <span className="font-semibold">{finding.title}.</span>{' '}
                    <span className={muted}>{finding.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {consensus && (
          <p className="flex items-start gap-2">
            <Users className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${muted}`} aria-hidden="true" />
            {consensus}
          </p>
        )}
        {verification.verified_query && (
          <p className="flex items-start gap-2">
            <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} aria-hidden="true" />
            Answered with a query an analyst verified for this question
            {verification.verified_query.approved_by ? ` (${verification.verified_query.approved_by})` : ''}.
          </p>
        )}
        {definitions.length > 0 && (
          <p className="flex items-start gap-2">
            <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} aria-hidden="true" />
            Uses the approved definition{definitions.length > 1 ? 's' : ''}:{' '}
            {definitions.map((d) => `${d.term} v${d.version}${d.filter_sql ? ` (${d.filter_sql})` : ''}`).join('; ')}.
          </p>
        )}
        {dataSent && (
          <p className={`flex items-start gap-2 ${muted}`}>
            <Send className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Sent to the AI provider: {dataSent.sent.join(', ')}.
            {dataSent.privacy_mode ? ' Privacy mode is on.' : ''}
          </p>
        )}
      </div>
    </details>
  );
}
