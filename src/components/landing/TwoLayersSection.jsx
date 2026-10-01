import React from 'react';
import { ArrowDown, ArrowRight, Microscope, ShieldCheck } from 'lucide-react';

// Figures from the C-CaSE research runs (run/log_spider2_full_slayql, run/bird_dev_v18_full; deepseek-v4-flash).
const RESEARCH = {
  spiderCorrect: 251,
  spiderTotal: 547,
  spiderEx: '45.89%',
  generated: '68.77%',
  chosen: '56.19%',
};

const OUTCOMES = [
  { label: 'Confident', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200', text: 'Checks passed; answered.' },
  { label: 'Caveat', tone: 'bg-amber-50 text-amber-800 border-amber-200', text: 'Answered, with the limitation stated.' },
  { label: 'Clarify', tone: 'bg-sky-50 text-sky-800 border-sky-200', text: 'Two meanings: shows both numbers.' },
  { label: 'Hand-off', tone: 'bg-slate-100 text-slate-700 border-slate-300', text: 'Unsure: goes to your analyst.' },
];

function Layer({ icon: Icon, step, title, who, children }) {
  return (
    <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{step}</p>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">{who}</p>
      <div className="mt-4 flex-1 space-y-3 text-sm text-slate-700">{children}</div>
    </div>
  );
}

export default function TwoLayersSection() {
  return (
    <section id="how-it-works" className="border-t border-slate-200 bg-slate-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-5xl">One system, two layers</h2>
          <p className="mt-4 max-w-3xl text-lg text-slate-600">
            Text-to-SQL fails business users in two places: finding the right data, and knowing whether the answer is right.
            Our research improves the first. The software solves the second.
          </p>
        </div>

        <div className="mt-10 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <Layer icon={Microscope} step="Layer 1 · Research (C-CaSE)" title="Find the right schema, write the SQL" who="Schema linking for large enterprise databases">
            <p>
              <strong>RBP</strong> spreads relevance along foreign keys to find the tables and joins a question needs; <strong>BM25 value
              grounding</strong> matches the question's words to real values; <strong>IT-EE</strong> and <strong>QOC</strong> control the
              agent's token budget and output format.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-2xl font-semibold text-slate-900">{RESEARCH.spiderEx}</p>
                <p className="text-xs text-slate-500">execution accuracy on Spider 2.0-Lite ({RESEARCH.spiderCorrect}/{RESEARCH.spiderTotal} enterprise questions)</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-2xl font-semibold text-slate-900">{RESEARCH.generated} <span className="text-base font-medium text-slate-400">vs</span> {RESEARCH.chosen}</p>
                <p className="text-xs text-slate-500">BIRD dev: a correct query was generated, versus chosen</p>
              </div>
            </div>
          </Layer>

          <div className="flex items-center justify-center px-2 text-center text-xs font-semibold text-indigo-700">
            <div className="max-w-[11rem]">
              <ArrowRight className="mx-auto hidden h-6 w-6 lg:block" aria-hidden="true" />
              <ArrowDown className="mx-auto h-6 w-6 lg:hidden" aria-hidden="true" />
              <p className="mt-2">Models often write a correct query but fail to choose it. That gap is where answers go wrong.</p>
            </div>
          </div>

          <Layer icon={ShieldCheck} step="Layer 2 · Software (trust layer)" title="Check the answer, then decide" who="What business users need most">
            <p>
              Every candidate query is run with extra <strong>probe queries against the real data</strong>; only the ones that pass vote; a
              <strong> calibrated confidence</strong>, compared with how costly a wrong answer is for your business, picks one of four outcomes:
            </p>
            <ul className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <li key={o.label} className={`rounded-lg border px-2.5 py-1.5 text-xs ${o.tone}`}>
                  <span className="font-semibold">{o.label}.</span> {o.text}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">Each analyst review recalibrates it for your data, so it answers more over time.</p>
          </Layer>
        </div>

        <p className="mt-6 max-w-3xl text-xs text-slate-500">
          The app runs a lightweight version of Layer 1 (RBP and BM25) so answers come back in seconds; the full research pipeline takes
          one to four minutes of model time per question. Layer 1 figures are from the C-CaSE research runs with deepseek-v4-flash.
        </p>
      </div>
    </section>
  );
}
