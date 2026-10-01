import React from 'react';
import { ArrowRight, Ban, BookOpenCheck, CalendarX, Check, CheckCheck, Copy, Languages, ListChecks, Microscope, Scale, SearchX } from 'lucide-react';
import { pct, useResearchSummary } from '../../services/useResearchSummary';
import { AFTER, BEFORE, ConfidenceGauge, GapBars, OUTCOME, RingStat, TrapRadar } from './charts';
import { Reveal, useInView, useScrollPosition } from './motion';
import { BENCHMARKS, LINKING, ORACLE_AT_K, SELECTED_EX } from '../../content/researchResults';
import { RESEARCH_NAME } from '../../content/projectInfo';

// How it works: a vertical timeline. Each stage is a roomy row (text left, chart right); the line
// on the left fills as you scroll and each stage's dot lights up when you reach it.

// Research figures (see content/researchResults.js for sources).
const spider2 = BENCHMARKS.find((b) => b.name === 'Spider 2.0-Lite');
const RESEARCH = { spiderEx: spider2.ex, spiderCorrect: 251, spiderTotal: spider2.n, generated: ORACLE_AT_K[ORACLE_AT_K.length - 1].oracle, chosen: SELECTED_EX };
// One real run from results/trap.json (item period-03): confidence 0.8808 against the 0.8 threshold.
const EXAMPLE = { p: 0.8808, threshold: 0.8 };

function AskVisual() {
  return (
    <div className="w-full max-w-md space-y-4">
      <p className="ml-auto w-fit max-w-[88%] rounded-3xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-3.5 text-lg text-white shadow-[0_18px_40px_-20px_rgba(67,56,202,0.8)]">
        What was the total value of completed orders last month?
      </p>
      <p className="w-fit max-w-[88%] rounded-3xl rounded-bl-md border border-slate-200 bg-white px-5 py-3.5 text-lg text-slate-800 shadow-sm">
        Berapa jumlah jualan kita?
      </p>
      <p className="ml-auto w-fit max-w-[88%] rounded-3xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 px-5 py-3.5 text-lg text-white shadow-[0_18px_40px_-20px_rgba(67,56,202,0.8)]">
        Which customer owes us the most?
      </p>
    </div>
  );
}

// Shown when the per-trap-type results are not available (for example an older API).
const CHECKS = [
  { icon: Copy, text: 'Totals counted twice by a join' },
  { icon: SearchX, text: '"How many customers" answered with an order count' },
  { icon: Ban, text: 'Cancelled records left in a total' },
  { icon: CalendarX, text: 'Periods the data does not cover' },
];

function ChecksFallback() {
  return (
    <ul className="w-full max-w-md space-y-3">
      {CHECKS.map(({ icon: Icon, text }, i) => (
        <li key={text} className="tick-in flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-[0_10px_30px_-20px_rgba(67,56,202,0.6)]" style={{ animationDelay: `${i * 180}ms` }}>
          <Icon className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
          <span className="flex-1 text-sm text-slate-800">{text}</span>
          <span className="check-pop flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white" style={{ animationDelay: `${i * 180 + 350}ms` }}>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </li>
      ))}
    </ul>
  );
}

const STEPS = [
  {
    id: 'ask', stage: 'Ask', icon: Languages, title: 'Ask in plain words',
    text: 'Type the question the way you would ask a colleague, in English or Bahasa Malaysia. No SQL, no table names.',
    facts: (h) => (h?.languages?.bm ? [
      { value: String(h.languages.en.n + h.languages.bm.n), label: 'evaluation questions' },
      { value: String(h.languages.bm.n), label: 'of them in Bahasa Malaysia' },
    ] : []),
    visual: () => <AskVisual />,
  },
  {
    id: 'find', stage: 'Find', layerStart: { name: RESEARCH_NAME, text: 'Our research: schema linking for large databases.' },
    icon: Microscope, title: 'Find the right data',
    text: `${RESEARCH_NAME} links the question to the tables, joins and values it needs, even in enterprise databases with hundreds of columns.`,
    facts: () => [
      { value: pct(LINKING.tableRecall), label: 'of needed tables found' },
      { value: pct(LINKING.columnRecall), label: 'of needed columns found' },
    ],
    visual: (play) => (
      <RingStat value={RESEARCH.spiderEx} play={play} caption={`Execution accuracy on Spider 2.0-Lite: ${RESEARCH.spiderCorrect} of ${RESEARCH.spiderTotal} enterprise questions.`} />
    ),
  },
  {
    id: 'choose', stage: 'Choose', icon: Scale, title: 'Write several, then choose',
    text: 'The model writes several candidate queries. A correct one is often among them and still not the one chosen. That gap is where wrong answers come from.',
    facts: () => [
      { value: `${((RESEARCH.generated - RESEARCH.chosen) * 100).toFixed(1)} pts`, label: 'between written and chosen' },
    ],
    visual: (play) => (
      <GapBars
        play={play}
        rows={[
          { label: 'A correct query was written', value: RESEARCH.generated, color: BEFORE },
          { label: 'The correct query was chosen', value: RESEARCH.chosen, color: AFTER },
        ]}
      />
    ),
  },
  {
    id: 'check', stage: 'Check', layerStart: { name: 'Trust layer', text: 'What the software adds on top.' },
    icon: ListChecks, title: 'Check against the real data',
    text: 'Probe queries run on your data to catch double counting, unclear meanings, date traps and questions the data cannot answer.',
    facts: (h) => {
      const types = h?.trap_types?.types || [];
      const meanings = types.find((t) => t.type === 'definition');
      return meanings ? [{ value: `${pct(meanings.before, 0)} to ${pct(meanings.after, 0)}`, label: 'two-meaning questions handled right' }] : [];
    },
    visual: (play, h) => (h?.trap_types?.types?.length
      ? <TrapRadar types={h.trap_types.types} play={play} height={340} />
      : <ChecksFallback />),
  },
  {
    id: 'decide', stage: 'Decide', icon: BookOpenCheck, title: 'Answer, ask, or hand off',
    text: 'A calibrated confidence is weighed against what a wrong figure costs your business. Above the bar it answers; below it, it asks or hands the question to your analyst.',
    facts: (h) => (h?.trap ? [{ value: pct(h.trap.after, 0), label: `wrong answers stated as fact, from ${pct(h.trap.before)}` }] : []),
    visual: (play) => <ConfidenceGauge p={EXAMPLE.p} threshold={EXAMPLE.threshold} play={play} />,
  },
];

function LayerMarker({ name, text }) {
  return (
    <Reveal as="li" variant="left" className="relative pl-20 lg:pl-28">
      <span className="absolute left-[1.75rem] top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-violet-500 shadow" aria-hidden="true" />
      <p className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-1 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(109,40,217,0.8)]">{name}</span>
        <span className="text-sm text-slate-600">{text}</span>
      </p>
    </Reveal>
  );
}

function Step({ step, h }) {
  const [dotRef, position] = useScrollPosition({ threshold: 0.3 });
  const [visualRef, play] = useInView({ threshold: 0.35 });
  const Icon = step.icon;
  const facts = step.facts(h);
  return (
    <li ref={dotRef} className="relative grid gap-10 pl-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16 lg:pl-28">
      <span
        className={`tl-dot absolute left-0 top-0 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-100 bg-white text-indigo-600 lg:top-1/2 lg:-translate-y-1/2 ${position !== 'below' ? 'is-on' : ''}`}
        aria-hidden="true"
      >
        <Icon className="h-6 w-6" />
      </span>

      <Reveal variant="up">
        <p className="text-base font-semibold text-indigo-600">{step.stage}</p>
        <h3 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">{step.title}</h3>
        <p className="mt-4 max-w-lg text-lg leading-relaxed text-slate-600">{step.text}</p>
        {facts.length > 0 && (
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-5">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="sr-only">{f.label}</dt>
                <dd className="text-4xl font-semibold tracking-[-0.03em] text-slate-950 tabular-nums">{f.value}</dd>
                <dd className="mt-1 max-w-[14rem] text-sm text-slate-500">{f.label}</dd>
              </div>
            ))}
          </dl>
        )}
      </Reveal>

      <Reveal variant="right" delay={120}>
        <div ref={visualRef} className="stage-frame">
          <div className="stage-fill relative flex min-h-[24rem] items-center justify-center overflow-hidden p-8 sm:p-12">
            <div aria-hidden="true" className="aurora pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full glow" style={{ '--glow': 'rgba(165,180,252,0.55)' }} />
            <div aria-hidden="true" className="aurora-slow pointer-events-none absolute -bottom-20 -left-12 h-56 w-56 rounded-full glow" style={{ '--glow': 'rgba(186,230,253,0.7)' }} />
            <div className="relative flex w-full justify-center">{step.visual(play, h)}</div>
          </div>
        </div>
      </Reveal>
    </li>
  );
}

// The end of the timeline: where every business question ended up, and what to do next.
const RESULT_OUTCOMES = ['correct', 'clarified', 'handed_off'];
const RESULT_TEXT = {
  correct: 'Checks passed, confidence high: you get the figure.',
  clarified: 'Two meanings give different numbers: you choose.',
  handed_off: 'Not sure enough: your analyst answers instead.',
};

function ResultStep({ h, setView }) {
  const [dotRef, position] = useScrollPosition({ threshold: 0.3 });
  const [barRef, play] = useInView({ threshold: 0.4 });
  const o = h?.outcomes?.trap;
  return (
    <li ref={dotRef} className="relative pl-20 lg:pl-28">
      <span
        className={`tl-dot absolute left-0 top-0 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-600 ${position !== 'below' ? 'is-on' : ''}`}
        aria-hidden="true"
      >
        <CheckCheck className="h-6 w-6" />
      </span>

      <Reveal variant="up">
        <div className="relative overflow-hidden rounded-[2rem] border border-indigo-100 bg-white shadow-[0_40px_90px_-55px_rgba(49,46,129,0.55)]">
          <div aria-hidden="true" className="glow pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full" style={{ '--glow': 'rgba(199,210,254,0.7)' }} />
          <div aria-hidden="true" className="glow pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full" style={{ '--glow': 'rgba(167,243,208,0.45)' }} />

          <div className="relative grid gap-12 p-8 sm:p-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16 lg:p-14">
            <div className="flex flex-col">
              <p className="text-base font-semibold text-emerald-700">The result</p>
              <h3 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl">
                An answer you can act on, or an honest "not sure".
              </h3>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-slate-600">
                Never a wrong number stated as fact. When it cannot be sure, it says so and routes the question.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row lg:mt-auto lg:pt-10">
                {setView && (
                  <button
                    type="button"
                    onClick={() => setView('demo')}
                    className="group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-[0_12px_32px_-12px_rgba(67,56,202,0.75)] transition hover:bg-indigo-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  >
                    Try the demo
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                )}
                <a
                  href="#results"
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-base font-semibold text-slate-800 transition hover:border-slate-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  See the results
                </a>
              </div>
            </div>

            <div ref={barRef} className="flex flex-col justify-center">
              {o ? (
                <>
                  <div className="flex items-end gap-6">
                    <p className="text-[5.5rem] font-semibold leading-none tracking-[-0.05em] text-slate-950 tabular-nums">{o.after.wrong}</p>
                    <div className="pb-2">
                      <p className="text-lg font-semibold text-slate-900">wrong answers stated as fact</p>
                      <p className="text-sm text-slate-500">
                        on {o.n} business questions with known traps. Plain AI:{' '}
                        <span className="text-base font-semibold text-rose-600 line-through decoration-2">{o.before.wrong}</span>
                      </p>
                    </div>
                  </div>

                  <p className="mt-10 text-sm font-medium text-slate-700">Where the {o.n} questions ended up</p>
                  <div className="mt-3 flex h-12 gap-1 overflow-hidden rounded-2xl" aria-hidden="true">
                    {RESULT_OUTCOMES.map((key, i) => (
                      <div
                        key={key}
                        className="seg-grow flex items-center justify-center text-sm font-semibold text-white"
                        style={{ width: play ? `${(o.after[key] / o.n) * 100}%` : '0%', background: OUTCOME[key].color, transitionDelay: `${i * 150}ms` }}
                      >
                        {o.after[key]}
                      </div>
                    ))}
                  </div>
                  <ul className="mt-6 grid gap-4 sm:grid-cols-3">
                    {RESULT_OUTCOMES.map((key) => {
                      const Icon = OUTCOME[key].icon;
                      return (
                        <li key={key}>
                          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: OUTCOME[key].color }} aria-hidden="true" />
                            {o.after[key]} {OUTCOME[key].label.toLowerCase()}
                          </p>
                          <p className="mt-1 flex gap-1.5 text-sm leading-snug text-slate-600">
                            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                            {RESULT_TEXT[key]}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <ul className="space-y-4">
                  {RESULT_OUTCOMES.map((key, i) => {
                    const Icon = OUTCOME[key].icon;
                    return (
                      <li key={key} className="tick-in flex items-start gap-4 rounded-2xl border border-slate-100 bg-white/80 p-4" style={{ animationDelay: `${i * 160}ms` }}>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: OUTCOME[key].color }}>
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span>
                          <span className="block font-semibold text-slate-900">{OUTCOME[key].label}</span>
                          <span className="block text-sm text-slate-600">{RESULT_TEXT[key]}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </li>
  );
}

export default function JourneySection({ setView }) {
  const { summary } = useResearchSummary();
  const h = summary?.highlights;

  return (
    <section id="how-it-works" className="relative overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f5f3ff_40%,#f8fafc_100%)] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal variant="blur">
          <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-6xl">From question to checked answer</h2>
          <p className="mt-5 max-w-2xl text-xl text-slate-600">Research finds the data. The trust layer decides whether the answer is safe to give.</p>
        </Reveal>

        <div className="tl relative mt-20">
          {/* the line, filling as you scroll */}
          <div aria-hidden="true" className="absolute bottom-0 left-[1.75rem] top-0 w-0.5 -translate-x-1/2 rounded-full bg-indigo-100">
            <div className="tl-fill h-full w-full rounded-full bg-gradient-to-b from-indigo-600 via-violet-500 to-sky-400" />
          </div>

          <ol className="relative space-y-24 lg:space-y-32">
            {STEPS.map((step) => (
              <React.Fragment key={step.id}>
                {step.layerStart && <LayerMarker {...step.layerStart} />}
                <Step step={step} h={h} />
              </React.Fragment>
            ))}
            <ResultStep h={h} setView={setView} />
          </ol>
        </div>

      </div>
    </section>
  );
}
