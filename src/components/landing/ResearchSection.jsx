import React from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { pct } from '../../services/useResearchSummary';
import { ABLATION, BENCHMARKS, LINKING, ORACLE_AT_K, SELECTED_EX, VERSIONS } from '../../content/researchResults';
import { AFTER, BEFORE, RingStat } from './charts';
import { Reveal, spotlight, useCountFromTo, useInView } from './motion';

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 12px 30px -16px rgba(15,23,42,0.35)', fontSize: 12 };

function Benchmark({ bench, index }) {
  const [ref, play] = useInView({ threshold: 0.4 });
  return (
    <Reveal delay={index * 140} className="flex flex-col items-center">
      <div ref={ref}>
        <RingStat value={bench.ex} play={play} caption={null} />
      </div>
      <p className="mt-2 text-lg font-semibold text-slate-950">{bench.name}</p>
      <p className="text-sm text-slate-500">{bench.detail}, {bench.n.toLocaleString()} questions</p>
      {bench.ci && <p className="mt-1 text-xs text-slate-400">95% interval {pct(bench.ci[0])} to {pct(bench.ci[1])}</p>}
    </Reveal>
  );
}

function OracleChart() {
  const [ref, play] = useInView({ threshold: 0.3 });
  const data = ORACLE_AT_K.map((p) => ({ k: p.k, oracle: p.oracle * 100, vote: p.vote * 100 }));
  return (
    <figure ref={ref} className="h-full rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
      <figcaption>
        <h3 className="text-lg font-semibold text-slate-950">More candidates, more correct queries. Picking them is the hard part.</h3>
        <p className="mt-1 text-sm text-slate-500">BIRD dev, 1,534 questions: is a correct query among the first k, and does a majority vote choose it?</p>
      </figcaption>
      <div className="mt-6 h-72" aria-hidden="true">
        {play && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="k" tick={{ fontSize: 11, fill: '#64748b' }} label={{ value: 'Candidate queries written (k)', position: 'insideBottom', offset: -12, fontSize: 12, fill: '#475569' }} />
              <YAxis domain={[50, 72]} tickFormatter={(v) => `${v}%`} width={44} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v.toFixed(1)}%`} labelFormatter={(k) => `k = ${k}`} />
              <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={SELECTED_EX * 100} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: `Chosen today ${pct(SELECTED_EX)}`, fontSize: 11, fill: '#64748b', position: 'insideBottomRight' }} />
              <Line type="monotone" dataKey="oracle" name="A correct query was written" stroke={AFTER} strokeWidth={2} dot={{ r: 4 }} animationDuration={1600} />
              <Line type="monotone" dataKey="vote" name="Majority vote picked it" stroke={BEFORE} strokeWidth={2} dot={{ r: 4 }} animationDuration={1600} animationBegin={400} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <table className="sr-only">
        <caption>Correct query written versus chosen by vote, by number of candidates</caption>
        <thead><tr><th>k</th><th>Written</th><th>Voted</th></tr></thead>
        <tbody>{ORACLE_AT_K.map((p) => <tr key={p.k}><td>{p.k}</td><td>{pct(p.oracle)}</td><td>{pct(p.vote)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

function CountUp({ value, from = 0, digits = 1 }) {
  const [ref, play] = useInView({ threshold: 0.5 });
  const shown = useCountFromTo(from, value, play);
  return <span ref={ref} className="tabular-nums">{pct(shown, digits)}</span>;
}

function SideStats() {
  const [v10, v18] = VERSIONS;
  return (
    <div className="grid h-full gap-4">
      <div className="spotlight rounded-3xl border border-slate-200 bg-white p-6" onMouseMove={spotlight}>
        <p className="text-sm font-medium text-slate-600">BIRD dev, pipeline v1.0 to v1.8</p>
        <p className="mt-3 flex items-baseline gap-3 text-5xl font-semibold tracking-[-0.04em] text-slate-950">
          <CountUp value={v18.ex} from={v10.ex} />
          <span className="inline-flex items-center gap-0.5 text-base font-semibold text-emerald-700">
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            {((v18.ex - v10.ex) * 100).toFixed(1)} points
          </span>
        </p>
        <p className="mt-2 text-sm text-slate-500">from {pct(v10.ex)}, at US${v18.costPerQuestion.toFixed(4)} per question</p>
      </div>
      <div className="spotlight rounded-3xl border border-slate-200 bg-white p-6" onMouseMove={spotlight}>
        <p className="text-sm font-medium text-slate-600">Spider 2.0-Lite schema linking, {LINKING.n} questions</p>
        <div className="mt-3 flex gap-8">
          <div>
            <p className="text-5xl font-semibold tracking-[-0.04em] text-slate-950"><CountUp value={LINKING.tableRecall} /></p>
            <p className="mt-1 text-sm text-slate-500">of needed tables found</p>
          </div>
          <div>
            <p className="text-5xl font-semibold tracking-[-0.04em] text-slate-950"><CountUp value={LINKING.columnRecall} /></p>
            <p className="mt-1 text-sm text-slate-500">of needed columns found</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AblationGrid() {
  const running = ABLATION.some((a) => a.pending);
  return (
    <div className="rounded-3xl border border-dashed border-indigo-200 bg-indigo-50/40 p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold text-slate-950">What each research component adds</h3>
        {running && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-indigo-700 shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Running on all 1,534 BIRD dev questions
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">Each run removes or changes one part of C-CaSE. Results appear here when the runs finish.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ABLATION.map((a, i) => (
          <Reveal as="li" key={a.id} delay={i * 70} className="rounded-2xl border border-white bg-white/80 p-4 shadow-[0_8px_24px_-18px_rgba(67,56,202,0.5)]">
            <p className="text-sm font-semibold text-slate-900">{a.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{a.what}</p>
            {a.pending ? (
              <div className="mt-4 space-y-2" aria-label="In progress">
                <div className="h-6 w-20 animate-pulse rounded-md bg-indigo-100" />
                <p className="text-[11px] font-medium text-indigo-700">In progress</p>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-2xl font-semibold text-slate-950">{pct(a.ex)}</p>
                {a.tokens && <p className="text-[11px] text-slate-500">{a.tokens.toLocaleString()} tokens per question</p>}
              </div>
            )}
          </Reveal>
        ))}
      </ul>
    </div>
  );
}

export default function ResearchSection() {
  return (
    <section id="research" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal variant="blur">
          <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl">The research underneath: C-CaSE</h2>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">Schema linking for large databases, tested on three public benchmarks.</p>
        </Reveal>

        <div className="mt-14 grid gap-12 sm:grid-cols-3">
          {BENCHMARKS.map((bench, i) => <Benchmark key={bench.name} bench={bench} index={i} />)}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Execution accuracy: the query returns exactly the right result. Model: deepseek-v4-flash.</p>

        <div className="mt-14 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Reveal variant="left"><OracleChart /></Reveal>
          <Reveal variant="right" delay={120}><SideStats /></Reveal>
        </div>

        <Reveal className="mt-4"><AblationGrid /></Reveal>
      </div>
    </section>
  );
}
