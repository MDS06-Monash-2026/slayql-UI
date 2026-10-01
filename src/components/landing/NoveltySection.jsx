import React, { useState } from 'react';
import { Ban, BookCheck, CalendarX, Check, Copy, FileCheck2, Gauge, GraduationCap, HandHelping, SearchX } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { pct, useResearchSummary } from '../../services/useResearchSummary';
import { AFTER, BEFORE, OUTCOME } from './charts';
import { Reveal, useCountFromTo, useInView } from './motion';

// What's new: an auto-advancing feature list (left) and a stage with one animated, data-backed
// visual per feature (right). Every number comes from the eval summary (backend/eval/results).

const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 12px 30px -16px rgba(15,23,42,0.35)', fontSize: 12 };

function Big({ value, from, digits = 1, className = '' }) {
  const shown = useCountFromTo(from, value, true);
  return (
    <span className={`tabular-nums ${className}`}>
      <span aria-hidden="true">{pct(shown, digits)}</span>
      <span className="sr-only">{pct(value, digits)}</span>
    </span>
  );
}

// 1. The checks: each catch ticks in, then the result.
const CATCHES = [
  { icon: Copy, text: 'Totals counted twice by a join' },
  { icon: SearchX, text: '"How many customers" answered with an order count' },
  { icon: Ban, text: 'Cancelled records left in a total' },
  { icon: CalendarX, text: 'Periods the data does not cover' },
];

function ChecksVisual({ h }) {
  return (
    <div className="w-full max-w-lg">
      <ul className="space-y-3">
        {CATCHES.map(({ icon: Icon, text }, i) => (
          <li key={text} className="tick-in flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-[0_10px_30px_-20px_rgba(67,56,202,0.6)]" style={{ animationDelay: `${i * 180}ms` }}>
            <Icon className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
            <span className="flex-1 text-sm text-slate-800">{text}</span>
            <span className="check-pop flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white" style={{ animationDelay: `${i * 180 + 350}ms` }}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </li>
        ))}
      </ul>
      {h?.trap && (
        <p className="mt-8 text-center text-sm text-slate-600">
          Wrong answers stated as fact on {h.trap.n} trap questions
          <span className="mt-1 block text-6xl font-semibold tracking-[-0.04em] text-slate-950">
            <Big value={h.trap.after} from={h.trap.before} />
          </span>
          <span className="text-emerald-700">down from {pct(h.trap.before)}</span>
        </p>
      )}
    </div>
  );
}

// Shown when the results data is not available (for example an older API): the idea, no numbers.
function OutcomesFallback() {
  const text = {
    correct: 'Checks passed and confidence is high: it answers.',
    clarified: 'Two meanings give different numbers: it shows both and asks.',
    handed_off: 'Not sure enough: an analyst answers, and the answer comes back to you.',
    wrong: 'What the checks exist to prevent.',
  };
  return (
    <ul className="w-full max-w-lg space-y-3">
      {Object.entries(OUTCOME).map(([key, o], i) => {
        const Icon = o.icon;
        return (
          <li key={key} className="tick-in flex items-start gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-[0_10px_30px_-20px_rgba(67,56,202,0.6)]" style={{ animationDelay: `${i * 160}ms` }}>
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: o.color }}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
              <span className="block text-sm text-slate-600">{text[key]}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function MeaningsFallback() {
  const options = ['Invoiced, including SST', 'Invoiced, excluding SST', 'Cash collected'];
  return (
    <div className="w-full max-w-md">
      <p className="text-center text-2xl font-semibold text-slate-950">What does "sales" mean?</p>
      <ul className="mt-6 space-y-3">
        {options.map((label, i) => (
          <li
            key={label}
            className={`tick-in flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${i === 1 ? 'border-indigo-200 bg-white font-semibold text-slate-950 shadow-[0_12px_30px_-18px_rgba(67,56,202,0.7)]' : 'border-white/80 bg-white/70 text-slate-600'}`}
            style={{ animationDelay: `${i * 160}ms` }}
          >
            {label}
            {i === 1 && (
              <span className="check-pop inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white" style={{ animationDelay: '700ms' }}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Approved
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-sm text-slate-600">Approved once, used by every answer and report from then on.</p>
    </div>
  );
}

// 2. Knowing when not to answer: where the trap questions ended up, plain vs SlayQL.
function OutcomeBar({ title, counts, n, play }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-800">{title}</p>
      <div className="flex h-10 gap-0.5 overflow-hidden rounded-xl">
        {Object.entries(OUTCOME).map(([key, o]) => (counts[key] ? (
          <div
            key={key}
            className="seg-grow flex items-center justify-center text-xs font-semibold text-white"
            style={{ width: play ? `${(counts[key] / n) * 100}%` : '0%', background: o.color }}
            title={`${o.label}: ${counts[key]} of ${n}`}
          >
            {counts[key] / n > 0.07 ? counts[key] : ''}
          </div>
        ) : null))}
      </div>
    </div>
  );
}

function DecideVisual({ h }) {
  const [ref, play] = useInView({ threshold: 0.2 });
  const o = h?.outcomes?.trap;
  const loop = h?.human_loop?.trap;
  if (!o) return <OutcomesFallback />;
  return (
    <div ref={ref} className="w-full max-w-lg space-y-6">
      <OutcomeBar title="Plain AI pipeline" counts={o.before} n={o.n} play={play} />
      <OutcomeBar title="SlayQL" counts={o.after} n={o.n} play={play} />
      <ul className="grid grid-cols-2 gap-2 text-xs text-slate-700">
        {Object.entries(OUTCOME).map(([key, item]) => (
          <li key={key} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} aria-hidden="true" />{item.label}</li>
        ))}
      </ul>
      {loop && (
        <p className="border-t border-indigo-100 pt-5 text-sm text-slate-600">
          With an analyst answering the {pct(loop.needed_person, 0)} it hands off,{' '}
          <strong className="text-2xl font-semibold text-slate-950"><Big value={loop.correct_with} from={loop.correct_without} /></strong> end right.
        </p>
      )}
      <table className="sr-only">
        <caption>Outcomes on {o.n} trap questions</caption>
        <thead><tr><th>Outcome</th><th>Plain AI</th><th>SlayQL</th></tr></thead>
        <tbody>{Object.entries(OUTCOME).map(([key, item]) => <tr key={key}><td>{item.label}</td><td>{o.before[key]}</td><td>{o.after[key]}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// 3. Learning from the analyst: the measured curve.
function LearnVisual({ learning }) {
  const points = (learning?.points || []).map((p) => ({ reviews: p.reviews, wrong: p.silent_error_c4 * 100 }));
  if (!points.length) return null;
  const start = learning.points[0];
  const at40 = learning.points.find((p) => p.reviews === 40);
  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-4">
        <p className="text-sm text-slate-600">Confident wrong answers on an unfamiliar database</p>
        {at40 && (
          <p className="text-right text-6xl font-semibold tracking-[-0.04em] text-slate-950">
            <Big value={at40.silent_error_c4} from={start.silent_error_c4} />
            <span className="block text-sm font-normal tracking-normal text-slate-500">after 40 reviews</span>
          </p>
        )}
      </div>
      <div className="mt-4 h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 10, right: 10, bottom: 18, left: 0 }}>
            <defs>
              <linearGradient id="learn-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={AFTER} stopOpacity={0.35} />
                <stop offset="100%" stopColor={AFTER} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="reviews" type="number" domain={[0, 'dataMax']} tick={{ fontSize: 11, fill: '#64748b' }} label={{ value: 'Answers reviewed by an analyst', position: 'insideBottom', offset: -10, fontSize: 12, fill: '#475569' }} />
            <YAxis tickFormatter={(v) => `${Math.round(v)}%`} width={40} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v.toFixed(1)}%`, 'Wrong, stated as fact']} labelFormatter={(v) => `${v} reviews`} />
            <Area type="monotone" dataKey="wrong" stroke={AFTER} strokeWidth={2.5} fill="url(#learn-fill)" animationDuration={1800} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// 4. Settled meanings: the starter pack, before and after.
function MeaningsVisual({ h }) {
  const [ref, play] = useInView({ threshold: 0.2 });
  const sp = h?.starter_pack;
  if (!sp) return <MeaningsFallback />;
  const rows = [
    { label: 'Questions answered', before: sp.answered_before, after: sp.answered_after },
    { label: 'Right answers held back', before: sp.held_back_before, after: sp.held_back_after },
  ];
  return (
    <div ref={ref} className="w-full max-w-lg">
      <p className="text-sm text-slate-600">
        "Sales" can mean invoiced or collected, with or without SST. On the Malaysian distributor set, approving the meanings once changes this:
      </p>
      <div className="mt-8 space-y-8">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-slate-800">{r.label}</p>
              <p className="text-4xl font-semibold tracking-tight text-slate-950"><Big value={r.after} from={r.before} /></p>
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="seg-grow h-2.5 rounded-full" style={{ width: play ? `${Math.max(1, r.before * 100)}%` : '0%', background: BEFORE }} />
              <div className="seg-grow h-2.5 rounded-full" style={{ width: play ? `${Math.max(1, r.after * 100)}%` : '0%', background: AFTER, transitionDelay: '250ms' }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Before approving: {pct(r.before)}. After: {pct(r.after)}.</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// 5. Checked reports: the real weekly pack.
function ReportVisual() {
  return (
    <figure className="flex w-full flex-col items-center">
      <div className="float-y h-[22rem] w-full max-w-md overflow-hidden rounded-2xl border border-white shadow-[0_40px_80px_-40px_rgba(67,56,202,0.7)]">
        <img
          src="/landing/weekly-pack.png"
          alt="The weekly sales and collections pack: checked figures, highlights and charts."
          loading="lazy"
          className="h-full w-full object-cover object-top"
        />
      </div>
      <figcaption className="mt-6 text-center text-sm text-slate-600">
        10 of 10 figures passed their checks on the AutoCount-style sample. Sent every Monday, no AI calls.
      </figcaption>
    </figure>
  );
}

const FEATURES = [
  { id: 'checks', icon: FileCheck2, title: 'It checks the answer, not just the SQL', text: 'Probe queries on your real data catch answers that run fine and are still wrong.', Visual: ChecksVisual },
  { id: 'decide', icon: Gauge, title: 'It knows when not to answer', text: 'Below your confidence threshold, it asks which meaning you want or hands off to an analyst.', Visual: DecideVisual },
  { id: 'learn', icon: GraduationCap, title: 'It learns from your analyst', text: 'Every confirm or correct recalibrates confidence for your data.', Visual: LearnVisual },
  { id: 'meanings', icon: BookCheck, title: 'It settles meanings once', text: 'Approve what "sales" means, and every answer and report uses it.', Visual: MeaningsVisual },
  { id: 'reports', icon: HandHelping, title: 'Reports where every number is checked', text: 'Each figure is its own checked query. A figure that fails a check is held back.', Visual: ReportVisual },
];

export default function NoveltySection() {
  const { summary } = useResearchSummary();
  const h = summary?.highlights;
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [ref, inView] = useInView({ threshold: 0.35 });
  const paused = hovered || !inView;
  const feature = FEATURES[active];
  const Visual = feature.Visual;

  return (
    <section id="novelty" className="novelty-bg relative overflow-hidden pb-20 pt-10 lg:pb-28 lg:pt-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal variant="blur">
        <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl">
          Other tools make AI answer. <span className="slayql-logo text-[0.98em] tracking-tight inline-flex align-baseline"><span className="slay">Slay</span><span className="ql">QL</span></span> makes sure the answer is right.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Writing SQL is common. Checking the result, and saying "I am not sure" by design, is not.
        </p>
        </Reveal>

        <div
          ref={ref}
          className={`mt-12 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10 ${paused ? 'feature-paused' : ''}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setHovered(true)}
          onBlurCapture={() => setHovered(false)}
        >
          <Reveal variant="left">
            <div role="tablist" aria-label="What is new in SlayQL" className="space-y-2">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                const on = i === active;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    id={`feature-tab-${f.id}`}
                    aria-selected={on}
                    aria-controls="feature-stage"
                    onClick={() => setActive(i)}
                    className={`group relative w-full overflow-hidden rounded-2xl border px-5 py-4 text-left transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${on ? 'border-indigo-200/70 bg-gradient-to-r from-indigo-100/80 via-violet-50 to-sky-50 shadow-[0_18px_40px_-28px_rgba(67,56,202,0.6)]' : 'border-transparent hover:bg-white/70'}`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition duration-300 ${on ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-[0_8px_18px_-8px_rgba(109,40,217,0.7)]' : 'bg-white/80 text-slate-500 group-hover:text-indigo-600'}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className={`text-base font-semibold transition ${on ? 'text-slate-950' : 'text-slate-600 group-hover:text-slate-900'}`}>{f.title}</span>
                    </span>
                    <span className={`grid transition-all duration-500 ${on ? 'mt-2 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <span className="overflow-hidden pl-12 text-sm leading-relaxed text-slate-600">{f.text}</span>
                    </span>
                    {on && (
                      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-indigo-100">
                        <span
                          key={active}
                          className="feature-progress block h-full bg-gradient-to-r from-indigo-600 via-violet-500 to-sky-400"
                          onAnimationEnd={() => setActive((i + 1) % FEATURES.length)}
                        />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Reveal>

          <Reveal variant="right" delay={120}>
            <div className="stage-frame">
            <div
              id="feature-stage"
              role="tabpanel"
              aria-labelledby={`feature-tab-${feature.id}`}
              className="stage-fill relative flex min-h-[30rem] items-center justify-center overflow-hidden p-6 sm:p-10"
            >
              <div aria-hidden="true" className="aurora pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full glow" style={{ '--glow': 'rgba(165,180,252,0.6)' }} />
              <div aria-hidden="true" className="aurora-slow pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full glow" style={{ '--glow': 'rgba(186,230,253,0.75)' }} />
              <div aria-hidden="true" className="aurora pointer-events-none absolute -bottom-20 right-10 h-56 w-56 rounded-full glow" style={{ '--glow': 'rgba(221,214,254,0.75)', animationDelay: '-6s' }} />
              <div key={feature.id} className="stage-in relative flex w-full justify-center">
                <Visual h={h} learning={summary?.learning} />
              </div>
            </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
