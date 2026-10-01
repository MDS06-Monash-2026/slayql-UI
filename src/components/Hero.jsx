import React from 'react';
import { ArrowRight, BarChart3, GraduationCap } from 'lucide-react';
import { PROJECT } from '../content/projectInfo';

// Full-bleed campus image with the question-to-answer story (generated for this project).
// Desktop: text sits bottom-left over a light scrim so the ribbon (top-left) and the
// checked answer (top-right) stay visible. Mobile: image on top, text below.
export default function Hero({ setView }) {
  const scrollToResults = (e) => {
    e.preventDefault();
    const target = document.getElementById('results');
    if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
  };

  return (
    <section id="hero" className="relative overflow-hidden bg-white pt-16 lg:flex lg:min-h-[100dvh] lg:items-end lg:pt-0">
      <div className="relative h-[40dvh] min-h-[240px] lg:absolute lg:inset-0 lg:h-auto">
        <div className="hero-parallax h-full w-full">
        <picture>
          <source media="(max-width: 1023px)" srcSet="/landing/hero-section-960.webp" />
          <img
            src="/landing/hero-section.webp"
            width="1916"
            height="821"
            fetchPriority="high"
            alt="Monash University Malaysia campus at sunrise. A question flows in as a ribbon of light, passes through data tables and two checkpoints, and ends as an answer with a check mark."
            className="hero-image-in h-full w-full object-cover object-[70%_50%] lg:object-[58%_30%]"
          />
        </picture>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(18deg,#ffffff_0%,rgba(255,255,255,0.9)_30%,rgba(255,255,255,0.35)_48%,rgba(255,255,255,0)_62%)] lg:block" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent lg:h-28" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-6 sm:px-6 lg:px-8 lg:pb-24 lg:pt-24">
        <div className="hero-copy-out max-w-[46rem]">
          <p className="hero-rise inline-flex items-center gap-2 text-sm font-medium text-indigo-700">
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            {PROJECT.institution} Final Year Project
          </p>

          <h1 className="hero-rise hero-rise-1 mt-4 text-[2.5rem] font-semibold leading-[1.04] tracking-[-0.035em] text-slate-950 text-balance sm:text-6xl lg:text-[4.25rem]">
            Ask your data anything.
            <span className="block text-indigo-600">Know when to trust it.</span>
          </h1>

          <p className="hero-rise hero-rise-2 mt-6 max-w-[34rem] text-lg leading-relaxed text-slate-600 sm:text-xl">
            SlayQL answers business questions in English or Bahasa Malaysia, checks every answer against your data, and says when it is unsure.
          </p>

          <div className="hero-rise hero-rise-3 mt-9 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setView && setView('demo')}
              className="group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-[0_12px_32px_-12px_rgba(67,56,202,0.75)] transition duration-200 hover:bg-indigo-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              Try the demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
            <a
              href="#results"
              onClick={scrollToResults}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white/80 px-6 py-3.5 text-base font-semibold text-slate-800 backdrop-blur transition duration-200 hover:border-slate-300 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <BarChart3 className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              See the results
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
