import React, { useRef, useState } from 'react';
import { BookCheck, Code2, Cpu, Database, FileCode2, GitCompareArrows, Gauge, ListChecks, MessageSquareText, Network, RefreshCcw, Signpost } from 'lucide-react';
import { RESEARCH_NAME } from '../../content/projectInfo';
import { Reveal } from './motion';

// "Inside the pipeline": the real stages a question passes through in the app, grouped into four
// phases, with the analyst feedback loop. Each stage names the module that implements it.

const PHASES = [
  {
    id: 'understand', name: 'Understand', tone: 'from-sky-500 to-indigo-500',
    nodes: [
      {
        id: 'question', icon: MessageSquareText, title: 'Question', short: 'English or Bahasa Malaysia',
        text: 'A business question arrives from the chat, a saved report or the weekly pack, along with the connected data source.',
        code: ['backend/app/agent/pipeline.py'],
      },
      {
        id: 'linking', icon: Network, title: 'Schema linking', short: `${RESEARCH_NAME}: tables, joins, values`,
        text: 'Relevance spreads along foreign keys to find the tables and joins the question needs, and BM25 matches its words to real values in the data.',
        code: ['backend/app/agent/rbp.py', 'backend/app/agent/retrieval.py'],
      },
      {
        id: 'definitions', icon: BookCheck, title: 'Approved meanings', short: 'What "sales" means here',
        text: 'Definitions the business has approved (for example sales excluding SST and cancelled invoices) are given to the model and applied to every answer.',
        code: ['backend/app/knowledge/store.py'],
      },
    ],
  },
  {
    id: 'generate', name: 'Generate', tone: 'from-indigo-500 to-violet-500',
    nodes: [
      {
        id: 'candidates', icon: Code2, title: 'Three candidate queries', short: 'Written independently',
        text: 'The model writes three SQL candidates, each nudged to reason from scratch, so their agreement means something. Everyday work uses GPT-5.6 Luna and harder work GPT-6.1 Sol, with fallbacks.',
        code: ['backend/app/agent/candidates.py', 'backend/app/providers/llm_client.py'],
      },
      {
        id: 'execute', icon: Database, title: 'Validate and run read-only', short: 'Never writes to your data',
        text: 'Each query is parsed, limited to reading, and run against the connected database. What was sent to the AI is logged for PDPA.',
        code: ['backend/app/queries/validator.py', 'backend/app/queries/executor.py', 'backend/app/privacy.py'],
      },
    ],
  },
  {
    id: 'verify', name: 'Verify', tone: 'from-violet-500 to-fuchsia-500',
    nodes: [
      {
        id: 'checks', icon: ListChecks, title: '11 checks on the real data', short: 'Probe queries, then repair',
        text: 'Probe queries look for joins that count rows twice, unclear meanings, periods the data does not cover, values that do not exist and questions the data cannot answer. Some problems are repaired automatically.',
        code: ['backend/app/verification/checks.py', 'backend/app/verification/repairs.py'],
      },
      {
        id: 'consensus', icon: GitCompareArrows, title: 'Consensus', short: 'Do the candidates agree?',
        text: 'Candidates that pass the checks are compared by the results they return, not by their SQL text. Disagreement lowers confidence.',
        code: ['backend/app/verification/consensus.py'],
      },
    ],
  },
  {
    id: 'decide', name: 'Decide', tone: 'from-fuchsia-500 to-rose-400',
    nodes: [
      {
        id: 'confidence', icon: Gauge, title: 'Calibrated confidence', short: 'Weighed against your threshold',
        text: 'Agreement, check results and repairs combine into a calibrated probability, compared with a threshold set from what a wrong figure costs the business.',
        code: ['backend/app/verification/confidence.py'],
      },
      {
        id: 'outcome', icon: Signpost, title: 'Answer, caveat, ask or hand off', short: 'One of four outcomes',
        text: 'Confident answers are given; answers with a known limit carry a caveat; two meanings become a question back; everything else goes to an analyst.',
        code: ['backend/app/verification/engine.py'],
      },
    ],
  },
];

const LOOP = {
  id: 'learning', icon: RefreshCcw, title: 'Analyst review recalibrates confidence',
  text: 'Every confirm or correct in the review queue is a labelled example. Confidence is refitted per data source, starting from a cautious prior, so the system answers more over time without guessing more.',
  code: ['backend/app/feedback/store.py', 'backend/app/verification/learning.py'],
};

const ALL = [...PHASES.flatMap((p) => p.nodes.map((n) => ({ ...n, phase: p.name }))), { ...LOOP, phase: 'Learn' }];

function NodeButton({ node, active, onSelect }) {
  const Icon = node.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      aria-pressed={active}
      className={`group flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        active
          ? 'border-indigo-200 bg-white shadow-[0_18px_40px_-24px_rgba(67,56,202,0.7)]'
          : 'border-white/70 bg-white/60 hover:-translate-y-0.5 hover:border-indigo-100 hover:bg-white'
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${active ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-slate-900">{node.title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{node.short}</span>
      </span>
    </button>
  );
}

export default function PipelineMap() {
  const [selected, setSelected] = useState('linking');
  const detailsRef = useRef(null);
  const node = ALL.find((n) => n.id === selected);
  // Where the phases stack (below xl), bring the details into view after a selection.
  const select = (id) => {
    setSelected(id);
    if (window.matchMedia('(max-width: 1279px)').matches) {
      requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  };
  const Icon = node.icon;

  return (
    <section id="architecture" className="relative overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f5f3ff_45%,#f8fafc_100%)] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal variant="blur">
          <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-6xl">Inside the pipeline</h2>
          <p className="mt-5 max-w-2xl text-xl text-slate-600">Every stage a question passes through, and where it lives in the code. Select a stage.</p>
        </Reveal>

        {/* the map: four phases, left to right */}
        <div className="relative mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PHASES.map((phase, i) => (
            <Reveal key={phase.id} delay={i * 110} className="relative">
              <div className="h-full rounded-[1.75rem] border border-indigo-100/80 bg-white/50 p-4 backdrop-blur">
                <div className="mb-4 flex items-center gap-2 px-1">
                  <span className={`h-2 w-8 rounded-full bg-gradient-to-r ${phase.tone}`} aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-900">{phase.name}</h3>
                </div>
                <div className="space-y-2.5">
                  {phase.nodes.map((n) => <NodeButton key={n.id} node={n} active={n.id === selected} onSelect={select} />)}
                </div>
              </div>
              {i < PHASES.length - 1 && (
                <span aria-hidden="true" className="pipeline-flow absolute -right-3 top-1/2 z-10 hidden h-0.5 w-6 -translate-y-1/2 xl:block" />
              )}
            </Reveal>
          ))}
        </div>

        {/* the learning loop, back from the outcome to confidence */}
        <Reveal className="mt-4">
          <button
            type="button"
            onClick={() => select(LOOP.id)}
            aria-pressed={selected === LOOP.id}
            className={`group flex w-full items-center gap-4 rounded-[1.75rem] border border-dashed px-5 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${selected === LOOP.id ? 'border-emerald-300 bg-emerald-50/80' : 'border-emerald-200 bg-white/60 hover:bg-emerald-50/60'}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <RefreshCcw className="loop-spin h-4 w-4" aria-hidden="true" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-slate-900">{LOOP.title}</span>
              <span className="block text-xs text-slate-600">Hand-offs go to the review queue; every review feeds back into the Decide phase.</span>
            </span>
          </button>
        </Reveal>

        {/* details of the selected stage */}
        <Reveal className="mt-6">
          <div ref={detailsRef} className="stage-frame scroll-mt-24" aria-live="polite">
            <div key={node.id} className="stage-fill stage-in relative grid gap-8 overflow-hidden p-8 sm:p-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-14">
              <div>
                <p className="text-sm font-semibold text-indigo-700">{node.phase}</p>
                <h3 className="mt-2 flex items-center gap-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-3xl">
                  <Icon className="h-7 w-7 text-indigo-600" aria-hidden="true" />
                  {node.title}
                </h3>
                <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">{node.text}</p>
              </div>
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileCode2 className="h-4 w-4 text-slate-500" aria-hidden="true" /> In the code
                </p>
                <ul className="mt-3 space-y-2">
                  {node.code.map((path) => (
                    <li key={path} className="flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 font-mono text-[13px] text-indigo-200">
                      <Cpu className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                      <span className="truncate">{path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
