import React, { useState } from 'react';
import { pct } from '../../services/useResearchSummary';

// Dumbbell: before (plain AI) -> after (SlayQL) per test set. One hue, two validated shades.
const BEFORE = '#7a83f2';
const AFTER = '#4338ca';

export default function ResultsDumbbell({ rows }) {
  const [hover, setHover] = useState(null);
  if (!rows.length) return null;
  const max = Math.max(0.2, Math.ceil(Math.max(...rows.map((r) => r.before)) * 10) / 10 + 0.1);
  const x = (value) => `${(value / max) * 100}%`;
  const ticks = Array.from({ length: Math.round(max / 0.2) + 1 }, (_, i) => i * 0.2).filter((t) => t <= max + 1e-9);

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-6">
      <figcaption>
        <h3 className="text-lg font-bold text-slate-900">Wrong answers stated as fact, before and after the trust layer</h3>
        <p className="text-sm text-slate-500">Share of all questions where the answer was wrong but given without any warning. Lower is better.</p>
      </figcaption>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BEFORE }} />Plain AI pipeline</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AFTER }} />With SlayQL's trust layer</span>
      </div>

      <div className="mt-5 space-y-5" aria-hidden="true">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className="relative grid grid-cols-1 gap-1 sm:grid-cols-[13rem_1fr] sm:items-center sm:gap-4"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">{row.label}</p>
              <p className="text-xs text-slate-500">{row.detail}</p>
            </div>
            <div className="relative h-9">
              {/* recessive guides */}
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 h-full w-px bg-slate-100" style={{ left: x(t) }} />
              ))}
              <span className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-slate-300" style={{ left: x(row.after), width: `calc(${x(row.before)} - ${x(row.after)})` }} />
              <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: x(row.before), background: BEFORE }} />
              <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: x(row.after), background: AFTER }} />
              <span className="absolute -top-1 -translate-x-1/2 text-[11px] font-medium text-slate-500" style={{ left: x(row.before) }}>{pct(row.before)}</span>
              <span className="absolute -bottom-1 -translate-x-1/2 text-[11px] font-semibold text-slate-900" style={{ left: x(row.after) }}>{pct(row.after)}</span>
            </div>
            {hover === index && (
              <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700 shadow-lg">
                <p className="font-semibold text-slate-900">{row.label}</p>
                <p>Plain AI: {pct(row.before)} · SlayQL: {pct(row.after)}</p>
                <p className="mt-1 text-slate-500">{row.source}</p>
              </div>
            )}
          </div>
        ))}
        <div className="grid grid-cols-1 sm:grid-cols-[13rem_1fr] sm:gap-4">
          <span className="hidden sm:block" />
          <div className="relative h-4 text-[10px] text-slate-400">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: x(t) }}>{pct(t, 0)}</span>
            ))}
          </div>
        </div>
      </div>

      {/* The same data as a table, for screen readers. */}
      <table className="sr-only">
        <caption>Wrong answers stated as fact, plain AI pipeline versus SlayQL</caption>
        <thead><tr><th>Test set</th><th>Plain AI</th><th>SlayQL</th><th>Source</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}><td>{row.label} ({row.detail})</td><td>{pct(row.before)}</td><td>{pct(row.after)}</td><td>{row.source}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
