import React from 'react';
import { BookCheck, Copy, FileCheck2, Gauge, GraduationCap, HandHelping, CalendarX, Ban, SearchX } from 'lucide-react';
import { pct, useResearchSummary } from '../../services/useResearchSummary';

// What the answer checks catch: each is a probe query run on the real data.
const CATCHES = [
  { icon: Copy, text: 'Totals counted twice by a join' },
  { icon: SearchX, text: '"How many customers" answered with an order count' },
  { icon: Ban, text: 'Cancelled records left in a total' },
  { icon: CalendarX, text: 'Periods the data does not cover' },
];

function Big({ children }) {
  return <p className="text-5xl font-semibold tracking-[-0.04em] text-slate-950 tabular-nums">{children}</p>;
}

export default function NoveltySection() {
  const { summary } = useResearchSummary();
  const h = summary?.highlights;
  const loop = h?.human_loop?.trap;

  return (
    <section id="novelty" className="bg-white pb-20 pt-16 lg:pb-28 lg:pt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl">
          Other tools make AI answer. SlayQL makes sure the answer is right.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Writing SQL from a question is common. Checking the result against the data, and saying "I am not sure" by design, is not.
        </p>

        <div className="mt-12 grid gap-4 lg:grid-cols-6 lg:grid-rows-[auto_auto_auto]">
          {/* Large cell: the answer checks, with the catches listed */}
          <article className="relative flex flex-col overflow-hidden rounded-3xl border border-indigo-100 bg-[radial-gradient(120%_90%_at_0%_0%,#eef2ff_0%,#ffffff_60%)] p-7 lg:col-span-4 lg:row-span-2 lg:p-10">
            <FileCheck2 className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">It checks the answer, not just the SQL</h3>
            <p className="mt-3 max-w-xl text-slate-600">
              Probe queries on your real data catch answers that run fine and are still wrong. Only candidates that pass get a vote.
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
          </article>

          {/* Knows when not to answer */}
          <article className="rounded-3xl border border-slate-200 bg-white p-7 lg:col-span-2">
            <Gauge className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-slate-950">It knows when not to answer</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Confidence is compared with a threshold set from what a wrong figure costs you. Below it, SlayQL asks or hands off.
            </p>
            {loop && (
              <div className="mt-6">
                <Big>{pct(loop.correct_with)}</Big>
                <p className="mt-1 text-sm text-slate-600">right once an analyst answers the {pct(loop.needed_person, 0)} it hands off</p>
              </div>
            )}
          </article>

          {/* Learns from the analyst */}
          <article className="rounded-3xl border border-slate-200 bg-slate-50 p-7 lg:col-span-2">
            <GraduationCap className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-slate-950">It learns from your analyst</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Each confirm or correct recalibrates confidence for that data source, and the answer goes back to whoever asked.
            </p>
            {h?.learning && (
              <div className="mt-6">
                <Big>{pct(h.learning.after_80, 0)}</Big>
                <p className="mt-1 text-sm text-slate-600">confident wrong answers after 80 reviews, from {pct(h.learning.start)}</p>
              </div>
            )}
          </article>

          {/* Settles meanings once */}
          <article className="rounded-3xl border border-slate-200 bg-white p-7 lg:col-span-3">
            <BookCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-slate-950">It settles meanings once, with the numbers</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              On connect it finds terms like "sales" that give different totals and shows each meaning's number. Approve one, and every answer
              and report uses it.
            </p>
            {h?.starter_pack && (
              <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
                <div>
                  <Big>{pct(h.starter_pack.answered_after)}</Big>
                  <p className="mt-1 text-sm text-slate-600">answered, from {pct(h.starter_pack.answered_before)}</p>
                </div>
                <div>
                  <Big>{pct(h.starter_pack.held_back_after, 0)}</Big>
                  <p className="mt-1 text-sm text-slate-600">right answers held back, from {pct(h.starter_pack.held_back_before)}</p>
                </div>
              </div>
            )}
          </article>

          {/* Checked reports: the one accent cell */}
          <article className="relative overflow-hidden rounded-3xl bg-indigo-600 p-7 text-white shadow-[0_24px_60px_-28px_rgba(67,56,202,0.8)] lg:col-span-3">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-indigo-400/40 blur-3xl" />
            <HandHelping className="relative h-5 w-5 text-indigo-100" aria-hidden="true" />
            <h3 className="relative mt-4 text-lg font-semibold">Reports where every number is checked</h3>
            <p className="relative mt-2 max-w-md text-sm leading-relaxed text-indigo-100">
              Each figure is its own checked query on the full data, and the summary may only restate computed facts. Refreshes and the
              Monday pack make no AI calls, so a figure that fails a check is held back instead of emailed.
            </p>
            <a href="#malaysia" className="relative mt-6 inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-white underline decoration-indigo-300 underline-offset-4 hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              See the weekly pack
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}
