import React from 'react';
import { Loader2 } from 'lucide-react';
import { pct } from '../../services/useResearchSummary';
import { ABLATION, BENCHMARKS } from '../../content/researchResults';
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
      <p className="mt-1 text-sm text-slate-500">Each run removes or changes one part of {RESEARCH_NAME}. Results appear here when the runs finish.</p>
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
          <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl">The research underneath: {RESEARCH_NAME}</h2>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">Schema linking for large databases, tested on three public benchmarks.</p>
        </Reveal>

        <div className="mt-14 grid gap-12 sm:grid-cols-3">
          {BENCHMARKS.map((bench, i) => <Benchmark key={bench.name} bench={bench} index={i} />)}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Execution accuracy: the query returns exactly the right result. Model: deepseek-v4-flash.</p>

        <Reveal variant="scale" className="mt-16"><GapChart /></Reveal>
        <div className="mt-4"><ResearchCards /></div>

        <Reveal className="mt-4"><AblationGrid /></Reveal>
      </div>
    </section>
  );
}
