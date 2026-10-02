import React from 'react';
import { AlertTriangle, BadgeCheck, HelpCircle, ShieldCheck, UserCheck } from 'lucide-react';

export const OUTCOME_STYLES = {
  confident: {
    label: 'Checks passed',
    Icon: ShieldCheck,
    light: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dark: 'bg-emerald-950/40 text-emerald-300 border-emerald-900/60',
  },
  caveat: {
    label: 'Answer with a caveat',
    Icon: AlertTriangle,
    light: 'bg-amber-50 text-amber-800 border-amber-200',
    dark: 'bg-amber-950/40 text-amber-300 border-amber-900/60',
  },
  clarify: {
    label: 'Needs your input',
    Icon: HelpCircle,
    light: 'bg-sky-50 text-sky-800 border-sky-200',
    dark: 'bg-sky-950/40 text-sky-300 border-sky-900/60',
  },
  handoff: {
    label: 'Sent to an analyst',
    Icon: UserCheck,
    light: 'bg-slate-100 text-slate-700 border-slate-300',
    dark: 'bg-slate-800/70 text-slate-200 border-slate-700',
  },
};

export default function TrustBadge({ outcome, probability, threshold, approved = false, isDark = false, size = 'md', compact = false }) {
  const style = OUTCOME_STYLES[outcome];
  if (!style) return null;
  const { Icon } = style;
  if (compact) {
    // An icon chip for dense layouts (report cards); the label stays available on hover and to screen readers.
    const label = `${style.label}${approved ? ' · approved definition' : ''}`;
    return (
      <span title={label} className={`inline-flex h-6 items-center gap-1 rounded-full border px-1.5 ${isDark ? style.dark : style.light}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {approved && <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${padding} ${isDark ? style.dark : style.light}`}>
        <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
        {style.label}
      </span>
      {approved && (
        <span className={`inline-flex items-center gap-1 rounded-full border font-semibold ${padding} ${isDark ? 'border-indigo-900/60 bg-indigo-950/40 text-indigo-300' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Approved definition
        </span>
      )}
      {typeof probability === 'number' && typeof threshold === 'number' && outcome !== 'clarify' && (
        <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Confidence {Math.round(probability * 100)}% (answers above {Math.round(threshold * 100)}%)
        </span>
      )}
    </span>
  );
}
