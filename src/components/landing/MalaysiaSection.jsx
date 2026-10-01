import React from 'react';
import { CalendarClock, Database, Languages, Lock, Mail, Receipt } from 'lucide-react';

const POINTS = [
  { icon: Database, title: 'Works with AutoCount', text: 'Read-only connection to the SQL Server database AutoCount runs on, or an export. A starter pack sets up what "sales", "collections" and "credit notes" mean.' },
  { icon: Receipt, title: 'SST and cancelled invoices handled', text: 'Totals including or excluding SST, and invoices marked cancelled, are explicit choices, never silent assumptions.' },
  { icon: Languages, title: 'English and Bahasa Malaysia', text: '"Berapa jumlah jualan bulan lepas?" gets the same checks as an English question.' },
  { icon: Lock, title: 'PDPA-minded', text: 'Every answer lists what was sent to the AI provider; privacy mode masks personal columns. The weekly pack sends nothing to AI.' },
];

export default function MalaysiaSection() {
  return (
    <section id="malaysia" className="border-t border-slate-200 bg-slate-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-sm font-medium text-indigo-700">Built for Malaysian SMEs</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-5xl">Your weekly numbers, checked, every Monday</h2>
            <p className="mt-3 text-lg text-slate-500">
              For growing distributors and wholesalers without a data team: sales and collections, what customers owe, what is overdue, top
              items, margin and slow stock. Every figure is re-run and re-checked that morning, and emailed. It needs no AI calls, so it costs
              almost nothing to run.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <div key={title}>
                  <p className="flex items-center gap-2 font-semibold text-slate-900"><Icon className="h-4 w-4 text-indigo-600" aria-hidden="true" />{title}</p>
                  <p className="mt-1 text-sm text-slate-600">{text}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />Scheduled in Malaysia time</span>
              <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" aria-hidden="true" />Figures that fail a check are held back, not emailed</span>
            </p>
          </div>
          <figure className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_70px_-35px_rgba(67,56,202,0.45)] transition duration-500 hover:-translate-y-1">
            <img
              src="/landing/weekly-pack.png"
              alt="The weekly sales and collections pack: four checked figures, key highlights, sales by month, overdue customers, top items, margin by item group and sales by agent."
              className="h-[28rem] w-full object-cover object-top"
              loading="lazy"
            />
            <figcaption className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
              The weekly pack on the AutoCount-style sample (invented data): 10 of 10 figures passed their checks.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
