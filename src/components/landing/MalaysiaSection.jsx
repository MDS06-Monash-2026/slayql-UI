import React from 'react';
import { Database, Languages, Lock, Receipt } from 'lucide-react';
import { Reveal } from './motion';

const POINTS = [
  { icon: Database, label: 'Works with AutoCount' },
  { icon: Receipt, label: 'SST and cancellations explicit' },
  { icon: Languages, label: 'English and Bahasa Malaysia' },
  { icon: Lock, label: 'PDPA logging and masking' },
];

export default function MalaysiaSection() {
  return (
    <section id="malaysia" className="bg-slate-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr]">
          <Reveal variant="left">
            <p className="text-sm font-medium text-indigo-700">Built for Malaysian SMEs</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl">Your weekly numbers, checked every Monday</h2>
            <p className="mt-4 text-lg text-slate-600">For distributors without a data team. No AI calls.</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {POINTS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 rounded-2xl border border-white bg-white/80 px-4 py-3 shadow-[0_10px_24px_-20px_rgba(67,56,202,0.6)]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{label}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal variant="right" delay={150}>
            <figure className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_70px_-35px_rgba(67,56,202,0.45)] transition duration-500 hover:-translate-y-1">
              <img
                src="/landing/weekly-pack.png"
                alt="The weekly sales and collections pack: four checked figures, key highlights, sales by month, overdue customers, top items, margin by item group and sales by agent."
                className="h-[28rem] w-full object-cover object-top"
                loading="lazy"
              />
              <figcaption className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">Sample pack (invented data): 10 of 10 figures passed.</figcaption>
            </figure>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
