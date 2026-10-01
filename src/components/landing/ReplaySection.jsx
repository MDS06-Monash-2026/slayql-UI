import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, HelpCircle, Play, RotateCcw, ShieldCheck, UserRound, Wrench, X } from 'lucide-react';
import { REPLAYS, THRESHOLD } from '../../content/replayExamples';
import { Reveal, prefersReducedMotion, useInView } from './motion';

// "Watch a question become a checked answer": replays real recorded runs from the evaluation
// (content/replayExamples.js). Steps appear one by one; the end shows the plain pipeline's answer
// next to SlayQL's decision. With reduced motion everything is shown at once.

const STEP_MS = 1100;
const STEPS = ['question', 'sql', 'checks', 'confidence', 'decision'];

const SQL_SPLIT = /\b(SELECT|FROM|WHERE|JOIN|ON|AND|OR|NOT|IN|EXISTS|GROUP BY|ORDER BY|LIMIT|AS|SUM|COUNT|DESC)\b/;
const IS_KEYWORD = /^(SELECT|FROM|WHERE|JOIN|ON|AND|OR|NOT|IN|EXISTS|GROUP BY|ORDER BY|LIMIT|AS|SUM|COUNT|DESC)$/;

function Sql({ code }) {
  const parts = code.split(SQL_SPLIT);
  return (
    <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-[13px] leading-relaxed text-slate-200">
      <code>
        {parts.map((part, i) => (IS_KEYWORD.test(part) ? <span key={i} className="font-semibold text-indigo-300">{part}</span> : <span key={i}>{part}</span>))}
      </code>
    </pre>
  );
}

const OUTCOME_UI = {
  confident: { icon: ShieldCheck, label: 'Answered', tone: 'text-indigo-700 bg-indigo-50 ring-indigo-200' },
  caveat: { icon: ShieldCheck, label: 'Answered with a caveat', tone: 'text-amber-800 bg-amber-50 ring-amber-200' },
  clarify: { icon: HelpCircle, label: 'Asked which meaning', tone: 'text-cyan-800 bg-cyan-50 ring-cyan-200' },
  handoff: { icon: UserRound, label: 'Handed to an analyst', tone: 'text-amber-800 bg-amber-50 ring-amber-200' },
};

function Row({ shown, title, children }) {
  return (
    <li className={`relative min-w-0 pl-10 transition-all duration-500 ${shown ? 'opacity-100' : 'translate-y-2 opacity-0'}`}>
      <span className={`absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full transition ${shown ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`} aria-hidden="true">
        <Check className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-2">{children}</div>
    </li>
  );
}

function Replay({ run, step }) {
  const s = run.slayql;
  const at = (name) => step >= STEPS.indexOf(name);
  const outcome = OUTCOME_UI[s.outcome] || OUTCOME_UI.confident;
  const OutcomeIcon = outcome.icon;
  const pctText = `${(s.p * 100).toFixed(1)}%`;
  const above = s.p >= THRESHOLD;

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      {/* the run, step by step */}
      <ol className="min-w-0 space-y-7">
        <Row shown={at('question')} title="The question">
          <p className="rounded-2xl rounded-tl-md bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-3 text-base text-white shadow-[0_14px_30px_-18px_rgba(67,56,202,0.8)]">{run.question}</p>
        </Row>
        <Row shown={at('sql')} title={s.repaired ? 'SQL written, then repaired after the checks' : 'SQL written from the question'}>
          {s.repaired && (
            <div className="mb-3 opacity-60">
              <p className="mb-1.5 text-xs font-medium text-slate-500">First draft</p>
              <Sql code={run.plain.sql} />
            </div>
          )}
          {s.repaired && <p className="mb-1.5 text-xs font-medium text-indigo-700">Repaired</p>}
          <Sql code={s.sql} />
        </Row>
        <Row shown={at('checks')} title="Checked against the real data">
          {s.findings.length ? (
            <ul className="space-y-2">
              {s.findings.map((f) => (
                <li key={f.title} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    {s.repaired ? <Wrench className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                    {f.title}
                  </p>
                  <p className="mt-1 text-sm text-amber-900/80">{f.detail}{s.repaired ? ' The query was rewritten to count each order once.' : ''}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No problems found.</p>
          )}
        </Row>
        <Row shown={at('confidence')} title="Confidence against your threshold">
          <div className="relative h-3 rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-3 rounded-full transition-[width] duration-1000 ease-out" style={{ width: at('confidence') ? `${s.p * 100}%` : '0%', background: above ? '#4338ca' : '#d97706' }} />
            <span className="absolute -top-1 h-5 w-0.5 rounded bg-slate-900" style={{ left: `${THRESHOLD * 100}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{pctText}</span> against the {Math.round(THRESHOLD * 100)}% bar: {above ? 'confident enough to answer.' : 'not confident enough to state a figure.'}
          </p>
        </Row>
      </ol>

      {/* the outcome: plain pipeline vs SlayQL */}
      <div className={`flex flex-col gap-4 transition-all duration-700 ${at('decision') ? 'opacity-100' : 'translate-y-4 opacity-0'}`}>
        <div className="rounded-3xl border border-rose-200 bg-white p-6">
          <p className="text-sm font-medium text-slate-500">A plain AI pipeline would say</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-400 line-through decoration-rose-500 decoration-2">{run.plain.answer}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Wrong, stated as fact
          </p>
        </div>

        <div className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-[0_24px_60px_-36px_rgba(67,56,202,0.7)]">
          <p className="text-sm font-medium text-slate-500">SlayQL</p>
          <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${outcome.tone}`}>
            <OutcomeIcon className="h-4 w-4" aria-hidden="true" /> {outcome.label}
          </p>
          {s.outcome === 'confident' && (
            <p className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">{s.answer}</p>
          )}
          {s.outcome === 'clarify' && (
            <ul className="mt-4 space-y-2">
              {s.options.map((o) => (
                <li key={o.label} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3">
                  <span className="text-sm text-slate-700">{o.label}</span>
                  <span className="text-lg font-semibold text-slate-950">{o.answer}</span>
                </li>
              ))}
              <li className="text-sm text-slate-600">You pick the meaning once; it is remembered.</li>
            </ul>
          )}
          {s.outcome === 'handoff' && (
            <p className="mt-4 text-sm leading-relaxed text-slate-700">No figure is given. The question goes to your analyst with the reason, and the answer comes back to you.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReplaySection() {
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(-1);
  const [runId, setRunId] = useState(0);
  const [ref, inView] = useInView({ threshold: 0.12 });
  const run = REPLAYS[active];

  // Play the steps one by one once the section is on screen (all at once with reduced motion).
  useEffect(() => {
    if (!inView) return undefined;
    if (prefersReducedMotion()) { setStep(STEPS.length - 1); return undefined; }
    setStep(0);
    const timer = setInterval(() => {
      setStep((s) => {
        if (s >= STEPS.length - 1) { clearInterval(timer); return s; }
        return s + 1;
      });
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [inView, active, runId]);

  const done = step >= STEPS.length - 1;

  return (
    <section id="workspace" className="relative overflow-hidden bg-white py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal variant="blur">
          <h2 className="max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-6xl">Watch a question become a checked answer</h2>
          <p className="mt-5 max-w-2xl text-xl text-slate-600">Real runs from our evaluation, replayed. Pick a question.</p>
        </Reveal>

        <Reveal className="mt-12">
          <div role="tablist" aria-label="Recorded questions" className="flex flex-wrap gap-3">
            {REPLAYS.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => { setActive(i); setRunId((n) => n + 1); }}
                className={`group rounded-2xl border px-4 py-3 text-left transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${i === active ? 'border-indigo-200 bg-gradient-to-r from-indigo-50 via-violet-50 to-sky-50 shadow-[0_14px_30px_-22px_rgba(67,56,202,0.8)]' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <span className={`block text-xs font-semibold ${i === active ? 'text-indigo-700' : 'text-slate-500'}`}>{r.tag}</span>
                <span className="mt-0.5 block max-w-[16rem] truncate text-sm font-medium text-slate-900">{r.question}</span>
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal className="mt-6">
          <div ref={ref} className="stage-frame">
            <div className="stage-fill relative overflow-hidden p-6 sm:p-10">
              <div aria-hidden="true" className="aurora glow pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full" style={{ '--glow': 'rgba(196,181,253,0.5)' }} />
              <div className="relative">
                <Replay key={`${run.id}-${runId}`} run={run} step={step} />
                <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-indigo-100 pt-6">
                  <p className="text-xs text-slate-500">Recorded run {run.id} from results/trap.json. Both start from the same generated SQL; SlayQL adds the checks and the decision.</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setRunId((n) => n + 1)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      {done ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                      Replay
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActive((a) => (a + 1) % REPLAYS.length); setRunId((n) => n + 1); }}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    >
                      Next question
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
