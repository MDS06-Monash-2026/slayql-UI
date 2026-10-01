import React, { useState } from 'react';
import { pct, useResearchSummary } from '../../services/useResearchSummary';
import { BENCHMARKS } from '../../content/researchResults';
import { AFTER, BEFORE } from './charts';
import { Reveal, spotlight, useInView } from './motion';

// What each configuration is (backend/eval/evaluate.py). All four share the same generated SQL.
const CONFIGS = [
  { id: 'B0', label: 'Plain pipeline', text: 'First query, always answered' },
  { id: 'B2', label: '+ voting only', text: 'Majority answer of 3 queries' },
  { id: 'B1', label: '+ checks only', text: 'Probe queries, repair, ask or hand off' },
  { id: 'B3', label: 'Full trust layer', text: 'Checks, voting and calibrated confidence' },
];

// The decision threshold follows the cost of a wrong answer relative to declining (1x, 4x, 9x).
const COSTS = [
  { id: 'B3_c1', label: '1x', text: 'A wrong figure costs as much as no figure' },
  { id: 'B3_c4', label: '4x', text: 'Default: a wrong figure costs four times as much' },
  { id: 'B3_c9', label: '9x', text: 'A wrong figure is very costly' },
];

const FEATURES = {
  agreement: 'Candidate queries agree',
  single_candidate: 'Only one query ran',
  approved_definition: 'Uses an approved definition',
  semantic_invalid: 'Reviewer model rejected the SQL',
  repairs: 'Needed a repair',
  ambiguity: 'Question has two meanings',
  empty_result: 'Empty result',
  warnings: 'A check raised a warning',
  unresolved_blocking: 'A blocking check failed',
};

function SetTabs({ sets, active, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1">
      {sets.map((s, i) => (
        <button
          key={s.key}
          type="button"
          role="tab"
          aria-selected={i === active}
          onClick={() => onChange(i)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${i === active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function ConfigBars({ set }) {
  const [ref, play] = useInView({ threshold: 0.3 });
  const max = Math.max(0.1, ...CONFIGS.map((c) => set.configs[c.id]?.wrong || 0));
  return (
    <div ref={ref} className="mt-6 space-y-5">
      {CONFIGS.map((c, i) => {
        const row = set.configs[c.id];
        if (!row) return null;
        const full = c.id === 'B3';
        return (
          <div key={c.id} className="grid grid-cols-[9rem_1fr] items-center gap-4 sm:grid-cols-[13rem_1fr]">
            <div>
              <p className={`text-sm font-semibold ${full ? 'text-indigo-700' : 'text-slate-800'}`}>{c.label}</p>
              <p className="text-xs text-slate-500">{c.text}</p>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="bar-grow h-3 rounded-full"
                style={{ width: play ? `${Math.max(0.6, (row.wrong / max) * 70)}%` : '0%', background: full ? AFTER : BEFORE, transitionDelay: `${i * 120}ms` }}
              />
              <p className="whitespace-nowrap text-sm text-slate-700">
                <span className="font-semibold text-slate-950 tabular-nums">{pct(row.wrong)}</span> wrong,{' '}
                <span className="tabular-nums">{pct(row.answered)}</span> answered
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CostSwitch({ sets }) {
  const [cost, setCost] = useState(1);
  const chosen = COSTS[cost];
  return (
    <div className="spotlight rounded-3xl border border-slate-200 bg-white p-6 sm:p-8" onMouseMove={spotlight}>
      <h3 className="text-lg font-semibold text-slate-950">How costly is a wrong figure for you?</h3>
      <p className="mt-1 text-sm text-slate-500">Your answer sets the confidence SlayQL needs before it answers.</p>
      <div role="radiogroup" aria-label="Cost of a wrong answer" className="mt-5 inline-flex rounded-xl bg-slate-100 p-1">
        {COSTS.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={i === cost}
            onClick={() => setCost(i)}
            className={`rounded-lg px-5 py-2 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${i === cost ? 'bg-indigo-600 text-white shadow-[0_8px_20px_-10px_rgba(67,56,202,0.8)]' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-600">{chosen.text}.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {sets.map((s) => {
          const row = s.configs[chosen.id];
          if (!row) return null;
          return (
            <div key={s.key} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">{s.label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums transition-all">{pct(row.answered)}</p>
              <p className="text-xs text-slate-600">answered</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 tabular-nums">{pct(row.wrong)} <span className="font-normal text-slate-600">wrong as fact</span></p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeightsChart({ weights }) {
  const [ref, play] = useInView({ threshold: 0.3 });
  const rows = Object.entries(weights.weights)
    .filter(([key, w]) => FEATURES[key] && w !== 0)
    .map(([key, w]) => ({ key, label: FEATURES[key], w }))
    .sort((a, b) => b.w - a.w);
  const max = Math.max(...rows.map((r) => Math.abs(r.w)), 0.01);
  return (
    <figure ref={ref} className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
      <figcaption>
        <h3 className="text-lg font-semibold text-slate-950">What moves confidence</h3>
        <p className="mt-1 text-sm text-slate-500">Weights learned from {weights.fitted_on?.replace("fitted on ", '').replace(/'/g, '')}. Right raises confidence, left lowers it.</p>
      </figcaption>
      <div className="mt-6 space-y-2.5" aria-hidden="true">
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[1fr_1fr] items-center">
            <div className="flex justify-end pr-1">
              {r.w < 0 && (
                <div className="bar-grow h-5 rounded-l-md" style={{ width: play ? `${(Math.abs(r.w) / max) * 100}%` : '0%', background: '#e11d48', transitionDelay: `${i * 70}ms` }} />
              )}
              {r.w >= 0 && <p className="pr-2 text-right text-xs text-slate-700">{r.label}</p>}
            </div>
            <div className="flex border-l border-slate-300 pl-1">
              {r.w > 0 && (
                <div className="bar-grow h-5 rounded-r-md" style={{ width: play ? `${(r.w / max) * 100}%` : '0%', background: AFTER, transitionDelay: `${i * 70}ms` }} />
              )}
              {r.w <= 0 && <p className="pl-2 text-xs text-slate-700">{r.label}</p>}
            </div>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Learned confidence weights</caption>
        <tbody>{rows.map((r) => <tr key={r.key}><td>{r.label}</td><td>{r.w}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export default function MethodSection() {
  const { summary } = useResearchSummary();
  const h = summary?.highlights;
  const sets = h?.method?.sets || [];
  const [active, setActive] = useState(0);
  if (!sets.length) return null;
  const set = sets[Math.min(active, sets.length - 1)];
  const benchmarkQuestions = BENCHMARKS.reduce((sum, b) => sum + b.n, 0);
  const trapCost = sets.find((s) => s.key === 'trap')?.cost_per_question;
  const birdCost = sets.find((s) => s.key === 'bird')?.cost_per_question;

  const corpus = [
    { n: sets.find((s) => s.key === 'trap')?.n, label: 'business questions with known traps', sub: 'written by the team, English and BM' },
    { n: sets.find((s) => s.key === 'distributor')?.n, label: 'Malaysian distributor questions', sub: 'AutoCount-style data, invented' },
    { n: 500, label: 'BIRD Mini-Dev questions', sub: '267 to fit confidence, 233 held out' },
    { n: benchmarkQuestions, label: 'research benchmark questions', sub: 'Spider 1.0, BIRD dev, Spider 2.0-Lite' },
  ].filter((c) => c.n);

  return (
    <section id="method" className="bg-slate-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal variant="blur">
          <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl">How we measured it</h2>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">Every configuration scores the same generated queries, so differences come only from the checks and the decision.</p>
        </Reveal>

        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {corpus.map((c, i) => (
            <Reveal key={c.label} delay={i * 100}>
              <p className="text-5xl font-semibold tracking-[-0.04em] text-slate-950 tabular-nums">{c.n.toLocaleString()}</p>
              <p className="mt-2 text-sm font-medium text-slate-800">{c.label}</p>
              <p className="text-xs text-slate-500">{c.sub}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-12">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">What each part of the trust layer adds</h3>
                <p className="mt-1 text-sm text-slate-500">{set.n} questions, {set.k} candidate queries each, {set.model}. Source: {set.source}</p>
              </div>
              <SetTabs sets={sets} active={active} onChange={setActive} label="Test set" />
            </div>
            <ConfigBars key={set.key} set={set} />
          </div>
        </Reveal>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Reveal variant="left"><CostSwitch sets={sets} /></Reveal>
          {h.confidence_weights && <Reveal variant="right" delay={120}><WeightsChart weights={h.confidence_weights} /></Reveal>}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {h.languages?.bm && (
            <Reveal className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
              <h3 className="text-lg font-semibold text-slate-950">Bahasa Malaysia gets the same protection</h3>
              <div className="mt-5 grid grid-cols-2 gap-6">
                {[['English', h.languages.en], ['Bahasa Malaysia', h.languages.bm]].map(([name, row]) => row && (
                  <div key={name}>
                    <p className="text-sm text-slate-500">{name}, {row.n} questions</p>
                    <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-950 tabular-nums">{pct(row.after, 0)}</p>
                    <p className="text-xs text-slate-600">wrong as fact, from {pct(row.before)}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          )}
          {(trapCost || birdCost) && (
            <Reveal delay={120} className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
              <h3 className="text-lg font-semibold text-slate-950">What a checked answer costs</h3>
              <div className="mt-5 grid grid-cols-2 gap-6">
                {trapCost && (
                  <div>
                    <p className="text-sm text-slate-500">Business questions</p>
                    <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-950 tabular-nums">US${trapCost.toFixed(4)}</p>
                    <p className="text-xs text-slate-600">per question, 3 queries plus checks</p>
                  </div>
                )}
                {birdCost && (
                  <div>
                    <p className="text-sm text-slate-500">BIRD Mini-Dev</p>
                    <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-950 tabular-nums">US${birdCost.toFixed(4)}</p>
                    <p className="text-xs text-slate-600">per question, larger databases</p>
                  </div>
                )}
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
