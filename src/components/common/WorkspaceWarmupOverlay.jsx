import React from 'react';
import { Check, Lock } from 'lucide-react';

// The steps App.jsx goes through when opening the demo workspace, in order. The overlay ticks
// them off as `stage` advances, so the progress bar reflects real progress.
export const WARMUP_STEPS = [
  'Signing in to the demo workspace',
  'Loading your chats and connections',
  'Reading the database structure',
  'Opening the workspace',
];

export default function WorkspaceWarmupOverlay({ stage = WARMUP_STEPS[0] }) {
  const current = Math.max(0, WARMUP_STEPS.indexOf(stage));
  const progress = ((current + 0.5) / WARMUP_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-md animate-fade-in" role="status" aria-live="polite">
      <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/60 bg-white p-8 shadow-[0_40px_100px_-40px_rgba(30,27,75,0.7)] dark:border-slate-800 dark:bg-[#121622]">
        <div aria-hidden="true" className="glow pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full" style={{ '--glow': 'rgba(165,180,252,0.55)' }} />

        <div className="relative flex flex-col items-center text-center">
          {/* logo inside a slowly turning gradient ring */}
          <div className="relative h-20 w-20">
            <span aria-hidden="true" className="warmup-ring absolute -inset-1.5 rounded-[1.6rem]" />
            <div className="relative flex h-full w-full items-center justify-center rounded-[1.4rem] bg-white p-1.5 shadow-md dark:bg-slate-900">
              <img src="/SlayQLlogo.png" alt="" className="h-full w-full object-contain" />
            </div>
          </div>

          <h2 className="mt-6 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">Opening SlayQL</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This takes a few seconds.</p>
        </div>

        <ol className="relative mt-7 space-y-3">
          {WARMUP_STEPS.map((label, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 ${
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                  }`}
                  aria-hidden="true"
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : active ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : i + 1}
                </span>
                <span className={`text-sm transition-colors duration-300 ${active ? 'font-semibold text-slate-950 dark:text-slate-100' : done ? 'text-slate-500' : 'text-slate-400'}`}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="relative mt-7 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-violet-500 to-sky-400 transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
        </div>

        <p className="relative mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Read-only connection
        </p>
      </div>
    </div>
  );
}
