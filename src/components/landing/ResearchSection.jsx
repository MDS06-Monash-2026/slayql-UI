import React from 'react';
import { pct } from '../../services/useResearchSummary';
import { BENCHMARKS, FINDINGS } from '../../content/researchResults';
import { RESEARCH_NAME } from '../../content/projectInfo';
import { RingStat } from './charts';
import { GapChart, ResearchCards } from './ResearchGap';
import { Reveal, useInView } from './motion';

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

function FindingsGrid() {
  return (
    <div className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-slate-950">What the study found</h3>
      <p className="mt-1 text-sm text-slate-500">Where accuracy is lost in an AI SQL pipeline, measured on all 1,534 BIRD dev questions.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FINDINGS.map((f, i) => (
          <Reveal as="li" key={f.id} delay={i * 70} className="rounded-2xl border border-white bg-white/80 p-4 shadow-[0_8px_24px_-18px_rgba(67,56,202,0.5)]">
            <p className="text-sm font-semibold text-slate-900">{f.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{f.value}</p>
            <p className="mt-1 text-xs text-slate-500">{f.what}</p>
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
          <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl">The research underneath: {RESEARCH_NAME}</h2>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">Schema linking for large databases, tested on three public benchmarks.</p>
        </Reveal>

        <div className="mt-14 grid gap-12 sm:grid-cols-3">
          {BENCHMARKS.map((bench, i) => <Benchmark key={bench.name} bench={bench} index={i} />)}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Execution accuracy: the query returns exactly the right result. Model: DeepSeek V4 Flash. BIRD is the final version, v1.9.</p>

        <Reveal variant="scale" className="mt-16"><GapChart /></Reveal>
        <div className="mt-4"><ResearchCards /></div>

        <Reveal className="mt-4"><FindingsGrid /></Reveal>
      </div>
    </section>
  );
}
