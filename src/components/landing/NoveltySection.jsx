import React from 'react';
import { BookCheck, Copy, FileCheck2, Gauge, GraduationCap, HandHelping, CalendarX, Ban, SearchX } from 'lucide-react';
import { pct, useResearchSummary } from '../../services/useResearchSummary';
import { Reveal, spotlight, useCountFromTo, useInView } from './motion';

// What the answer checks catch: each is a probe query run on the real data.
const CATCHES = [
  { icon: Copy, text: 'Totals counted twice by a join' },
  { icon: SearchX, text: '"How many customers" answered with an order count' },
  { icon: Ban, text: 'Cancelled records left in a total' },
  { icon: CalendarX, text: 'Periods the data does not cover' },
];

// A large figure that counts from its "before" value when it scrolls into view.
function Big({ value, from, digits = 1 }) {
  const [ref, inView] = useInView({ threshold: 0.5 });
  const shown = useCountFromTo(from, value, inView);
  return (
    <p ref={ref} className="text-5xl font-semibold tracking-[-0.04em] text-slate-950 tabular-nums">
      <span aria-hidden="true">{pct(shown, digits)}</span>
      <span className="sr-only">{pct(value, digits)}</span>
    </p>
  );
}

export default function NoveltySection() {
  const { summary } = useResearchSummary();
  const h = summary?.highlights;
  const loop = h?.human_loop?.trap;

  return (
    <section id="novelty" className="bg-white pb-20 pt-16 lg:pb-28 lg:pt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal variant="blur">
        <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl">
          Other tools make AI answer. SlayQL makes sure the answer is right.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Writing SQL is common. Checking the result, and saying "I am not sure" by design, is not.
        </p>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-6 lg:grid-rows-[auto_auto_auto]">
          {/* Large cell: the answer checks, with the catches listed */}
          <Reveal as="article" variant="up" delay={0} onMouseMove={spotlight} className="spotlight relative flex flex-col overflow-hidden rounded-3xl border border-indigo-100 bg-[radial-gradient(120%_90%_at_0%_0%,#eef2ff_0%,#ffffff_60%)] p-7 lg:col-span-4 lg:row-span-2 lg:p-10">
            <FileCheck2 className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">It checks the answer, not just the SQL</h3>
            <p className="mt-3 max-w-xl text-slate-600">
              Probe queries on your real data catch answers that run fine and are still wrong.
            </p>
            <ul className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {CATCHES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-slate-800">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-[0_4px_14px_-6px_rgba(67,56,202,0.35)]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-[15px] leading-snug">{text}</span>
                </li>
              ))}
            </ul>
            {h?.trap && (
              <p className="mt-10 border-t border-indigo-100 pt-6 text-sm text-slate-600 lg:mt-auto">
                On {h.trap.n} business questions with known traps, wrong answers stated as fact went from{' '}
                <strong className="font-semibold text-slate-950">{pct(h.trap.before)}</strong> to{' '}
                <strong className="font-semibold text-slate-950">{pct(h.trap.after)}</strong>, with no right answers held back.
              </p>
            )}
          </Reveal>

          {/* Knows when not to answer */}
          <Reveal as="article" variant="up" delay={110} onMouseMove={spotlight} className="spotlight rounded-3xl border border-slate-200 bg-white p-7 lg:col-span-2">
            <Gauge className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-slate-950">It knows when not to answer</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Below your confidence threshold, it asks or hands off.
            </p>
            {loop && (
              <div className="mt-6">
                <Big value={loop.correct_with} from={loop.correct_without} />
                <p className="mt-1 text-sm text-slate-600">end right with an analyst, from {pct(loop.correct_without)}</p>
              </div>
            )}
          </Reveal>

          {/* Learns from the analyst */}
          <Reveal as="article" variant="up" delay={220} onMouseMove={spotlight} className="spotlight rounded-3xl border border-slate-200 bg-slate-50 p-7 lg:col-span-2">
            <GraduationCap className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-slate-950">It learns from your analyst</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Every confirm or correct recalibrates it for your data.
            </p>
            {h?.learning && (
              <div className="mt-6">
                <Big value={h.learning.after_80} from={h.learning.start} digits={0} />
                <p className="mt-1 text-sm text-slate-600">confident wrong answers after 80 reviews</p>
              </div>
            )}
          </Reveal>

          {/* Settles meanings once */}
          <Reveal as="article" variant="up" delay={330} onMouseMove={spotlight} className="spotlight rounded-3xl border border-slate-200 bg-white p-7 lg:col-span-3">
            <BookCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-slate-950">It settles meanings once, with the numbers</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              Terms like "sales" can give different totals. Approve one meaning and everything uses it.
            </p>
            {h?.starter_pack && (
              <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
                <div>
                  <Big value={h.starter_pack.answered_after} from={h.starter_pack.answered_before} />
                  <p className="mt-1 text-sm text-slate-600">answered</p>
                </div>
                <div>
                  <Big value={h.starter_pack.held_back_after} from={h.starter_pack.held_back_before} digits={0} />
                  <p className="mt-1 text-sm text-slate-600">right answers held back</p>
                </div>
              </div>
            )}
          </Reveal>

          {/* Checked reports: the one accent cell */}
          <Reveal as="article" variant="up" delay={440} onMouseMove={spotlight} className="spotlight relative overflow-hidden rounded-3xl bg-indigo-600 p-7 text-white shadow-[0_24px_60px_-28px_rgba(67,56,202,0.8)] lg:col-span-3">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-indigo-400/40 blur-3xl" />
            <HandHelping className="relative h-5 w-5 text-indigo-100" aria-hidden="true" />
            <h3 className="relative mt-4 text-lg font-semibold">Reports where every number is checked</h3>
            <p className="relative mt-2 max-w-md text-sm leading-relaxed text-indigo-100">
              Each figure is its own checked query. The Monday pack makes no AI calls, and a figure that fails a check is held back.
            </p>
            <a href="#malaysia" className="relative mt-6 inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-white underline decoration-indigo-300 underline-offset-4 hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              See the weekly pack
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
