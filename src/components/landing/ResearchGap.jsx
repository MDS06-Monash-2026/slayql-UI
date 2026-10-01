import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { pct } from '../../services/useResearchSummary';
import { LINKING, ORACLE_AT_K, SELECTED_EX, VERSIONS } from '../../content/researchResults';
import { AFTER, BEFORE } from './charts';
import { Reveal, spotlight, useCountFromTo, useInView } from './motion';

// Research results under the benchmark rings: the written-versus-chosen gap (full width), then
// pipeline progress and schema-linking recall. Figures from content/researchResults.js.

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 12px 30px -16px rgba(15,23,42,0.35)', fontSize: 12 };
const GAP = '#a78bfa';

function CountUp({ value, from = 0, digits = 1, play }) {
  const shown = useCountFromTo(from, value, play);
  return <span className="tabular-nums">{pct(shown, digits)}</span>;
}

// Direct label at the end of a line instead of a legend box.
const endLabel = (text, color) => function EndLabel({ x, y, index }) {
  if (index !== ORACLE_AT_K.length - 1) return null;
  return <text x={x + 10} y={y + 4} fill={color} fontSize={12} fontWeight={600}>{text}</text>;
};

export function GapChart() {
  const [ref, play] = useInView({ threshold: 0.3 });
  const last = ORACLE_AT_K[ORACLE_AT_K.length - 1];
  const gap = last.oracle - last.vote;
  const data = ORACLE_AT_K.map((p) => ({ k: p.k, oracle: p.oracle * 100, vote: p.vote * 100, gap: (p.oracle - p.vote) * 100 }));

  return (
    <figure ref={ref} className="stage-frame">
      <div className="stage-fill relative overflow-hidden p-8 sm:p-12">
        <div aria-hidden="true" className="aurora glow pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full" style={{ '--glow': 'rgba(196,181,253,0.55)' }} />

        <figcaption className="relative">
          <h3 className="max-w-2xl text-2xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-3xl">More candidates, more correct queries. Picking them is the hard part.</h3>
          <p className="mt-2 max-w-2xl text-slate-600">BIRD dev, 1,534 questions. With k candidate queries, is a correct one among them, and does a majority vote choose it?</p>
        </figcaption>

        <dl className="relative mt-10 grid gap-8 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-slate-600">A correct query was written (5 candidates)</dt>
            <dd className="mt-1 text-5xl font-semibold tracking-[-0.04em] text-slate-950"><CountUp value={last.oracle} play={play} /></dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">The majority vote picked it</dt>
            <dd className="mt-1 text-5xl font-semibold tracking-[-0.04em] text-slate-950"><CountUp value={last.vote} play={play} /></dd>
          </div>
          <div className="rounded-2xl bg-white/80 p-4 shadow-[0_12px_30px_-20px_rgba(109,40,217,0.6)] ring-1 ring-violet-100">
            <dt className="text-sm font-medium text-violet-700">The gap: written, then not chosen</dt>
            <dd className="mt-1 text-5xl font-semibold tracking-[-0.04em] text-violet-700 tabular-nums">{(gap * 100).toFixed(1)} pts</dd>
          </div>
        </dl>

        <div className="relative mt-10 h-80" aria-hidden="true">
          {play && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 150, bottom: 24, left: 0 }}>
                <defs>
                  <linearGradient id="gap-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GAP} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={GAP} stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="k" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} label={{ value: 'Candidate queries written (k)', position: 'insideBottom', offset: -16, fontSize: 12, fill: '#475569' }} />
                <YAxis domain={[50, 72]} allowDataOverflow ticks={[50, 55, 60, 65, 70]} tickFormatter={(v) => `${v}%`} width={44} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(k) => `${k} candidate${k > 1 ? 's' : ''}`}
                  formatter={(v, name) => (name === 'gap' ? null : [`${v.toFixed(1)}%`, name === 'oracle' ? 'Correct query written' : 'Majority vote picked it'])}
                />
                {/* the gap: an invisible base up to the vote line, then the gap stacked on top */}
                <Area type="monotone" dataKey="vote" stackId="g" stroke="none" fill="transparent" isAnimationActive={false} />
                <Area type="monotone" dataKey="gap" stackId="g" stroke="none" fill="url(#gap-fill)" animationDuration={1800} animationBegin={600} />
                <ReferenceLine y={SELECTED_EX * 100} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: `Chosen today ${pct(SELECTED_EX)}`, fontSize: 11, fill: '#64748b', position: 'insideBottomRight' }} />
                <Line type="monotone" dataKey="oracle" stroke={AFTER} strokeWidth={3} dot={{ r: 5, fill: '#fff', strokeWidth: 2.5 }} animationDuration={1600} label={endLabel('Correct query written', AFTER)} />
                <Line type="monotone" dataKey="vote" stroke={BEFORE} strokeWidth={3} dot={{ r: 5, fill: '#fff', strokeWidth: 2.5 }} animationDuration={1600} animationBegin={300} label={endLabel('Majority vote picked it', '#5b63d6')} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="relative mt-2 text-sm text-slate-600">The shaded gap is what the trust layer works on: checking candidates against the data instead of trusting the vote.</p>

        <table className="sr-only">
          <caption>Correct query written versus chosen by vote, by number of candidates</caption>
          <thead><tr><th>Candidates</th><th>Written</th><th>Voted</th></tr></thead>
          <tbody>{ORACLE_AT_K.map((p) => <tr key={p.k}><td>{p.k}</td><td>{pct(p.oracle)}</td><td>{pct(p.vote)}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  );
}

function MiniRing({ value, label, play, delay = 0 }) {
  const r = 42;
  const length = 2 * Math.PI * r;
  return (
    <figure className="flex flex-col items-center text-center">
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#eef2ff" strokeWidth="9" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={AFTER} strokeWidth="9" strokeLinecap="round" strokeDasharray={length} strokeDashoffset={play ? length * (1 - value) : length} className="ring-draw" style={{ transitionDelay: `${delay}ms` }} />
        </svg>
        <p className="absolute inset-0 flex items-center justify-center text-2xl font-semibold tracking-tight text-slate-950"><CountUp value={value} play={play} /></p>
      </div>
      <figcaption className="mt-3 text-sm text-slate-600">{label}</figcaption>
    </figure>
  );
}

export function ResearchCards() {
  const [ref, play] = useInView({ threshold: 0.35 });
  const [v10, v18] = VERSIONS;
  const max = 0.7;
  return (
    <div ref={ref} className="grid gap-4 lg:grid-cols-2">
      <Reveal variant="left" className="spotlight rounded-[2rem] border border-slate-200 bg-white p-8 sm:p-10" onMouseMove={spotlight}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">BIRD dev accuracy, pipeline v1.0 to v1.8</h3>
            <p className="mt-1 text-sm text-slate-500">Execution accuracy on the same 1,534 questions.</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            +{((v18.ex - v10.ex) * 100).toFixed(1)} points
          </span>
        </div>
        <div className="mt-8 flex h-56 items-end justify-around gap-6 border-b border-slate-200" aria-hidden="true">
          {VERSIONS.map((v, i) => (
            <div key={v.version} className="flex h-full w-full max-w-[9rem] flex-col justify-end text-center">
              <p className="mb-2 text-2xl font-semibold tracking-tight text-slate-950"><CountUp value={v.ex} play={play} /></p>
              <div
                className="rounded-t-2xl transition-[height] duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ height: play ? `${(v.ex / max) * 75}%` : '0%', background: i === VERSIONS.length - 1 ? `linear-gradient(180deg, #6366f1, ${AFTER})` : '#c7d2fe', transitionDelay: `${i * 200}ms` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-around gap-6">
          {VERSIONS.map((v) => (
            <p key={v.version} className="w-full max-w-[9rem] text-center">
              <span className="block text-sm font-semibold text-slate-800">{v.version}</span>
              <span className="block text-xs text-slate-500">US${v.costPerQuestion.toFixed(4)} per question</span>
            </p>
          ))}
        </div>
        <p className="sr-only">BIRD dev execution accuracy: v1.0 {pct(v10.ex)}, v1.8 {pct(v18.ex)}.</p>
      </Reveal>

      <Reveal variant="right" delay={120} className="spotlight rounded-[2rem] border border-slate-200 bg-white p-8 sm:p-10" onMouseMove={spotlight}>
        <h3 className="text-lg font-semibold text-slate-950">Spider 2.0-Lite schema linking</h3>
        <p className="mt-1 text-sm text-slate-500">{LINKING.n} enterprise questions, checked against the official answer queries.</p>
        <div className="mt-8 flex flex-wrap items-center justify-around gap-8">
          <MiniRing value={LINKING.tableRecall} label="of the tables each answer needs" play={play} />
          <MiniRing value={LINKING.columnRecall} label="of the columns each answer needs" play={play} delay={200} />
        </div>
        <p className="mt-8 text-sm text-slate-600">Finding the right tables and columns comes first: a query cannot be right if the data it needs was never found.</p>
      </Reveal>
    </div>
  );
}
