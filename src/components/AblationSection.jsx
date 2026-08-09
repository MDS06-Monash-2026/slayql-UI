import React from 'react';
import { FlaskConical, ArrowDownRight, AlertTriangle } from 'lucide-react';
import { ABLATION_DATA } from '../mock/mockData';

export default function AblationSection() {
  return (
    <section id="ablation" class="py-20 lg:py-28 bg-slate-50 border-t border-slate-200">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        <div class="text-center mb-14">
          <div class="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold uppercase tracking-wider">
            <FlaskConical class="w-3.5 h-3.5" />
            Ablation Study
          </div>
          <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            Component Contribution
          </h2>
          <p class="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            Leave-one-out dropout experiments isolate how much each module contributes to SlayQL's accuracy.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {ABLATION_DATA.map((item, idx) => {
            const severe = item.pct !== null && item.pct < 10;
            return (
              <div key={idx} class={`rounded-2xl border p-6 bg-white ${severe ? 'border-rose-200' : 'border-slate-200'}`}>
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">{item.dropped}</span>
                  {severe && <AlertTriangle class="w-4 h-4 text-rose-500" />}
                </div>
                <h3 class="text-sm font-semibold text-slate-800 mb-4">{item.full}</h3>
                {item.pct !== null ? (
                  <>
                    <div class={`text-4xl font-extrabold ${severe ? 'text-rose-600' : 'text-slate-900'}`}>{item.pct}%</div>
                    <div class="text-xs text-slate-400 mt-1">{item.correct} / {item.total} correct</div>
                  </>
                ) : (
                  <>
                    <div class="text-4xl font-extrabold text-amber-600">Incomplete</div>
                    <div class="text-xs text-slate-400 mt-1">{item.correct} / {item.total} evaluated</div>
                  </>
                )}
                {severe && (
                  <div class="mt-3 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                    <ArrowDownRight class="w-3.5 h-3.5" />
                    Severe accuracy collapse
                  </div>
                )}
                <p class="mt-3 text-xs text-slate-500 leading-relaxed">{item.note}</p>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
