import React, { useState, useEffect } from 'react';
import { PlayCircle, Network, CheckCircle2, ArrowRight, GitBranch } from 'lucide-react';

export default function Hero({ setView }) {
  const [typedText, setTypedText] = useState('');
  const [showTrace, setShowTrace] = useState(false);

  const queryText = '"How many IoT-related patent applications were filed each month between 2008 and 2022?"';

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setTypedText(queryText.slice(0, ++index));
      if (index >= queryText.length) {
        clearInterval(interval);
        setTimeout(() => setShowTrace(true), 500);
      }
    }, 32);

    return () => clearInterval(interval);
  }, []);

  const handleDemoClick = (e) => {
    e.preventDefault();
    const target = document.getElementById('workspace');
    if (target) {
      const offset = 72;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const handleArchClick = (e) => {
    e.preventDefault();
    const target = document.getElementById('architecture');
    if (target) {
      const offset = 72;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <section id="hero" className="relative pt-20 pb-16 lg:pt-28 lg:pb-20 overflow-hidden">
      <div class="hero-grid-bg absolute inset-0 pointer-events-none"></div>
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-to-b from-indigo-50/80 via-blue-50/40 to-transparent rounded-full blur-3xl pointer-events-none"></div>

      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center max-w-5xl mx-auto">

          <p class="text-sm sm:text-base font-medium text-slate-500 mb-4 tracking-wide uppercase">
            Scalable Schema Exploration &amp; Value-Grounded Text-to-SQL
          </p>

          {/* Headline */}
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.08] mb-6">
            Query Complex Databases
            <span class="relative">
              <span class="hero-gradient-text block sm:inline"> in Plain English.</span>
              <span class="hero-underline-svg absolute -bottom-2 left-0 right-0 hidden sm:block"></span>
            </span>
          </h1>

          {/* Subheadline */}
          <p class="mt-6 text-lg sm:text-xl text-slate-500 max-w-3xl mx-auto leading-relaxed font-light">
            SlayQL is an agentic Text-to-SQL framework that intelligently explores database schemas, reasons over complex join relationships, and grounds queries with real data values. Generate accurate SQL, visualize results, and explore large-scale datasets without manually navigating thousands of tables.
          </p>

          {/* CTAs */}
          <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#workspace" onClick={handleDemoClick} class="group inline-flex items-center gap-2 px-7 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base rounded-xl shadow-xl shadow-indigo-200 hover:shadow-indigo-300 transition-all duration-200">
              <PlayCircle class="w-4 h-4" />
              Try Live Demo
              <ArrowRight class="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a href="#architecture" onClick={handleArchClick} class="group inline-flex items-center gap-2 px-7 py-3.5 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-base rounded-xl border border-slate-200 shadow-md hover:shadow-lg transition-all duration-200">
              <GitBranch class="w-4 h-4 text-indigo-600" />
              View Architecture
            </a>
          </div>

          {/* Powered by */}
          <div class="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            <div class="flex items-center gap-1.5">
              <CheckCircle2 class="w-4 h-4 text-emerald-500" />
              Graph-Based Schema Reasoning
            </div>
            <div class="flex items-center gap-1.5">
              <CheckCircle2 class="w-4 h-4 text-emerald-500" />
              Value-Grounded Retrieval
            </div>
            <div class="flex items-center gap-1.5">
              <CheckCircle2 class="w-4 h-4 text-emerald-500" />
              LLM SQL Generation
            </div>
            <div class="flex items-center gap-1.5">
              <CheckCircle2 class="w-4 h-4 text-emerald-500" />
              Spider 2.0-Lite Evaluation
            </div>
          </div>
        </div>

        {/* Hero Terminal Preview */}
        <div class="mt-16 max-w-4xl mx-auto hero-terminal-wrapper">
          <div class="rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/60 overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div class="flex gap-1.5">
                <div class="w-3 h-3 rounded-full bg-rose-400"></div>
                <div class="w-3 h-3 rounded-full bg-amber-400"></div>
                <div class="w-3 h-3 rounded-full bg-emerald-400"></div>
              </div>
              <span class="text-xs font-medium text-slate-500 font-mono">slayql — interactive workspace</span>
              <div class="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live
              </div>
            </div>

            <div class="p-5 lg:p-6 bg-slate-950 font-mono text-sm">
              <div class="flex items-start gap-3 mb-4">
                <span class="text-slate-500 select-none mt-0.5">›</span>
                <div>
                  <span class="text-slate-400">Natural language query:</span>
                  <div class="text-indigo-300 mt-1 min-h-[1.5em] typewriter-cursor">
                    {typedText}
                  </div>
                </div>
              </div>

              {showTrace && (
                <div class="transition-all duration-500 animate-fade-in-up border-t border-slate-800 pt-4 mt-2 space-y-1.5 text-xs">
                  <div class="flex items-center gap-2 text-emerald-400"><span>✓</span><span>Retrieved relevant schema — publications.abstract_localized</span></div>
                  <div class="flex items-center gap-2 text-blue-400"><Network class="w-3 h-3" /><span>Graph reasoning activated — publications → patent_metadata → technology_category</span></div>
                  <div class="flex items-center gap-2 text-indigo-300"><span>✓</span><span>Value grounding — "internet of things" matched in abstract_localized</span></div>
                  <div class="flex items-center gap-2 text-slate-300"><span>✓</span><span>SQL generated and executed</span></div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
