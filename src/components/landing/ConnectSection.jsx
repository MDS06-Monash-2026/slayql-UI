import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { Reveal } from './motion';

// The databases the app connects to (backend/app/connections/runtime.py). AutoCount runs on SQL Server.
const SOURCES = [
  { brand: 'autocount', name: 'AutoCount', note: 'via SQL Server' },
  { brand: 'sqlserver', name: 'SQL Server', size: 'h-16 w-16' },
  { brand: 'postgresql', name: 'PostgreSQL', also: 'supabase', note: 'and Supabase' },
  { brand: 'mysql', name: 'MySQL', size: 'h-16 w-20' },
  { brand: 'sqlite', name: 'SQLite' },
];

function Wordmark({ name }) {
  return <span className="text-lg font-bold tracking-tight text-indigo-700">{name}</span>;
}

function Tile({ source: s, index }) {
  // Without the official logo file the wordmark already names the product, so the label is not repeated.
  const [missing, setMissing] = useState(false);
  return (
    <Reveal as="li" delay={index * 80} className="group flex h-full flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white px-4 py-8 text-center transition duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_24px_50px_-30px_rgba(67,56,202,0.6)]">
      <span className="flex h-16 items-center justify-center gap-3 grayscale-[35%] transition duration-300 group-hover:grayscale-0">
        <BrandLogo brand={s.brand} className={s.size || 'h-14 w-14'} fallback={<Wordmark name={s.name} />} onMissing={() => setMissing(true)} />
        {s.also && <BrandLogo brand={s.also} className="h-9 w-9" />}
      </span>
      {!missing && <span className="mt-4 text-base font-semibold text-slate-900">{s.name}</span>}
      {s.note && <span className={`${missing ? 'mt-4' : 'mt-0.5'} text-xs text-slate-500`}>{s.note}</span>}
    </Reveal>
  );
}

export default function ConnectSection({ setView }) {
  return (
    <section id="connectors" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <Reveal variant="blur">
            <h2 className="text-4xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-5xl">Connect your data</h2>
            <p className="mt-3 text-lg text-slate-600">Read-only. Nothing is ever written back.</p>
          </Reveal>
          {setView && (
            <Reveal delay={120}>
              <button
                type="button"
                onClick={() => setView('demo')}
                className="group inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-[0_12px_32px_-12px_rgba(67,56,202,0.75)] transition hover:bg-indigo-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                Try the demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </Reveal>
          )}
        </div>

        <ul className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {SOURCES.map((source, i) => <Tile key={source.name} source={source} index={i} />)}
        </ul>
      </div>
    </section>
  );
}
