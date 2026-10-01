import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, UserRound } from 'lucide-react';
import { Cell, Legend, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { pct } from '../../services/useResearchSummary';
import { useCountFromTo } from './motion';
import { RESEARCH_NAME } from '../../content/projectInfo';

// Validated palettes (dataviz validator, light mode): plain vs SlayQL is one hue in two steps;
// outcomes are four categorical hues and always carry a label and an icon.
export const BEFORE = '#7a83f2';
export const AFTER = '#4338ca';
export const OUTCOME = {
  correct: { color: '#4338ca', label: 'Answered correctly', icon: CheckCircle2 },
  clarified: { color: '#0891b2', label: 'Asked which meaning', icon: HelpCircle },
  handed_off: { color: '#d97706', label: 'Handed to an analyst', icon: UserRound },
  wrong: { color: '#e11d48', label: 'Wrong, stated as fact', icon: AlertTriangle },
};

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 12px 30px -16px rgba(15,23,42,0.35)', fontSize: 12 };

// Radar: share of each trap type handled the right way, plain pipeline vs SlayQL.
export function TrapRadar({ types, play = true, height = 360, compact = false }) {
  if (!types?.length) return null;
  const data = types.map((t) => ({ label: t.label, n: t.n, Plain: Math.round(t.before * 1000) / 10, SlayQL: Math.round(t.after * 1000) / 10 }));
  return (
    <figure className="w-full">
      <div style={{ height }} aria-hidden="true">
        {play && (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius={compact ? '44%' : '72%'} margin={compact ? { top: 0, right: 0, bottom: 0, left: 0 } : { top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="label" tick={{ fontSize: compact ? 10 : 12, fill: '#334155' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="Plain AI pipeline" dataKey="Plain" stroke={BEFORE} strokeWidth={2} fill={BEFORE} fillOpacity={0.12} animationDuration={1200} />
              <Radar name="SlayQL" dataKey="SlayQL" stroke={AFTER} strokeWidth={2} fill={AFTER} fillOpacity={0.22} animationDuration={1600} animationBegin={300} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>
      <table className="sr-only">
        <caption>Share of each question type handled the right way</caption>
        <thead><tr><th>Question type</th><th>Questions</th><th>Plain AI</th><th>SlayQL</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{d.n}</td><td>{d.Plain}%</td><td>{d.SlayQL}%</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

// Progress ring for one headline share.
export function RingStat({ value, play, caption }) {
  const r = 84;
  const length = 2 * Math.PI * r;
  const shown = useCountFromTo(0, value, play, 1800);
  return (
    <figure className="flex flex-col items-center text-center">
      <div className="relative h-56 w-56">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="100" cy="100" r={r} fill="none" stroke="#eef2ff" strokeWidth="14" />
          <circle
            cx="100" cy="100" r={r} fill="none" stroke={AFTER} strokeWidth="14" strokeLinecap="round"
            strokeDasharray={length} strokeDashoffset={play ? length * (1 - value) : length} className="ring-draw"
          />
        </svg>
        <p className="absolute inset-0 flex items-center justify-center text-5xl font-semibold tracking-[-0.04em] text-slate-950 tabular-nums">{pct(shown, 2)}</p>
      </div>
      <figcaption className="mt-4 max-w-xs text-sm text-slate-600">{caption}</figcaption>
    </figure>
  );
}

// Two bars without background tracks: the share where a correct query was written vs chosen.
export function GapBars({ rows, play }) {
  return (
    <figure className="w-full space-y-7">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium text-slate-700">{row.label}</p>
            <p className="text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">{pct(row.value, 2)}</p>
          </div>
          <div className="mt-2 h-4">
            <div className="bar-grow h-4 rounded-full" style={{ width: play ? `${row.value * 100}%` : '0%', background: row.color }} />
          </div>
        </div>
      ))}
      <figcaption className="text-xs text-slate-500">BIRD dev, {RESEARCH_NAME} research runs (deepseek-v4-flash).</figcaption>
    </figure>
  );
}

// Semi-circle confidence gauge with the business threshold marked.
export function ConfidenceGauge({ p, threshold, play }) {
  const angle = (v) => -90 + v * 180;
  const point = (v, radius) => {
    const a = ((angle(v) - 90) * Math.PI) / 180;
    return [100 + radius * Math.cos(a), 100 + radius * Math.sin(a)];
  };
  const arc = (from, to, radius) => {
    const [x1, y1] = point(from, radius);
    const [x2, y2] = point(to, radius);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  };
  const [tx1, ty1] = point(threshold, 64);
  const [tx2, ty2] = point(threshold, 96);
  const shown = useCountFromTo(0, p, play, 1600);
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 200 112" className="w-full max-w-sm" role="img" aria-label={`Confidence ${pct(p, 0)}, threshold ${pct(threshold, 0)}: answered`}>
        <path d={arc(0, threshold, 80)} fill="none" stroke="#fde68a" strokeWidth="16" />
        <path d={arc(threshold, 1, 80)} fill="none" stroke="#c7d2fe" strokeWidth="16" />
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#0f172a" strokeWidth="2" />
        {/* SVG rotate pivots exactly on the hub (100, 100); the angle follows the same counter as the number. */}
        <g transform={`rotate(${angle(shown)} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="24" stroke={AFTER} strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="7" fill={AFTER} />
      </svg>
      <p className="-mt-1 text-5xl font-semibold tracking-[-0.04em] text-slate-950 tabular-nums">{pct(shown, 0)}</p>
      <figcaption className="mt-2 max-w-xs text-center text-sm text-slate-600">
        Confidence on "completed orders in March 2026". The business threshold is {pct(threshold, 0)}, so it answers.
      </figcaption>
    </figure>
  );
}

function Donut({ title, counts, n, play }) {
  const data = Object.entries(OUTCOME).map(([key, o]) => ({ key, name: o.label, value: counts[key] || 0, color: o.color })).filter((d) => d.value > 0);
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-56 w-56" aria-hidden="true">
        {play && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="#ffffff" strokeWidth={2} startAngle={90} endAngle={-270} animationDuration={1200}>
                {data.map((d) => <Cell key={d.key} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${v} of ${n}`, name]} />
            </PieChart>
          </ResponsiveContainer>
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-4xl font-semibold tracking-tight text-slate-950 tabular-nums">{counts.wrong}</p>
          <p className="text-xs text-slate-500">wrong as fact</p>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
    </div>
  );
}

// Where every question ended up, plain pipeline vs SlayQL, with a test-set switch.
export function OutcomeDonuts({ outcomes, play }) {
  const sets = [
    outcomes?.trap && { key: 'trap', label: 'Business trap set', ...outcomes.trap },
    outcomes?.distributor && { key: 'distributor', label: 'Malaysian distributor', ...outcomes.distributor },
  ].filter(Boolean);
  const [active, setActive] = useState(0);
  if (!sets.length) return null;
  const set = sets[Math.min(active, sets.length - 1)];
  return (
    <figure className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <figcaption>
          <h3 className="text-lg font-semibold text-slate-950">Where every question ended up</h3>
          <p className="text-sm text-slate-500">{set.n} questions, same generated queries. Source: {set.source}</p>
        </figcaption>
        <div role="tablist" aria-label="Test set" className="inline-flex rounded-xl bg-slate-100 p-1">
          {sets.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${i === active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div key={set.key} className="mt-8 grid items-center gap-8 md:grid-cols-[1fr_1fr_auto]">
        <Donut title="Plain AI pipeline" counts={set.before} n={set.n} play={play} />
        <Donut title="SlayQL" counts={set.after} n={set.n} play={play} />
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-1">
          {Object.entries(OUTCOME).map(([key, o]) => {
            const Icon = o.icon;
            return (
              <li key={key} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: o.color }} aria-hidden="true" />
                <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                {o.label}
              </li>
            );
          })}
        </ul>
      </div>
      <table className="sr-only">
        <caption>Outcomes on the {set.label}</caption>
        <thead><tr><th>Outcome</th><th>Plain AI</th><th>SlayQL</th></tr></thead>
        <tbody>{Object.entries(OUTCOME).map(([key, o]) => <tr key={key}><td>{o.label}</td><td>{set.before[key]}</td><td>{set.after[key]}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
