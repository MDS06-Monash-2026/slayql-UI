import React from 'react';
import { GraduationCap, ExternalLink } from 'lucide-react';

export default function AboutSection() {
  return (
    <section id="about" class="py-20 lg:py-28 bg-white border-t border-slate-200">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

        <div class="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-slate-300 bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
          <GraduationCap class="w-3.5 h-3.5" />
          About
        </div>

        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 mb-6">
          Built for Scalable Text-to-SQL Research
        </h2>

        <p class="text-lg text-slate-500 leading-relaxed max-w-2xl mx-auto">
          SlayQL extends the AutoLink framework by introducing graph-based schema exploration, value grounding, and scalable evaluation pipelines for large-scale Text-to-SQL systems. It is developed by the C-CaSE / MDS06 FYP group at Monash University Malaysia and evaluated on the Spider 2.0-Lite benchmark.
        </p>

        <div class="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a href="https://arxiv.org/abs/2511.17190" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-800 transition-colors">
            AutoLink Paper (arXiv)
            <ExternalLink class="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
