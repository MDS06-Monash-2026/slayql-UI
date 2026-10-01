import React, { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import ReplaySection from '../components/landing/ReplaySection';

import PipelineMap from '../components/landing/PipelineMap';
import TrustResultsSection from '../components/TrustResultsSection';
import ConnectSection from '../components/landing/ConnectSection';
import Footer from '../components/Footer';
import JourneySection from '../components/landing/JourneySection';
import QuestionMarquee from '../components/landing/QuestionMarquee';
import ResearchSection from '../components/landing/ResearchSection';
import MethodSection from '../components/landing/MethodSection';
import { Reveal, ScrollProgress, observeRevealClasses } from '../components/landing/motion';
import NoveltySection from '../components/landing/NoveltySection';
import MalaysiaSection from '../components/landing/MalaysiaSection';
import ProjectSection, { VoicesSection } from '../components/landing/ProjectSection';
import HeroStats from '../components/landing/HeroStats';
import { PROJECT } from '../content/projectInfo';
import { ArrowRight } from 'lucide-react';
import BrandLogo from '../components/landing/BrandLogo';

export default function LandingView({ setView, onDatabaseConnect }) {
  /* Global scroll-reveal for any section using .reveal that doesn't
     manage its own observer (Problem, Benchmark, etc.) */
  useEffect(() => {
    return observeRevealClasses([...document.querySelectorAll('.reveal')]);
  }, []);

  return (
    <div className="page-root min-h-screen bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-indigo-700 focus:shadow-lg">
        Skip to content
      </a>
      <ScrollProgress />
      <Navbar setView={setView} currentView="landing" />

      <main id="main">
        <Hero setView={setView} />

        {/* Headline results, directly under the hero */}
        <HeroStats />

        {/* Real evaluation questions, English and BM */}
        <QuestionMarquee />

        {/* What is new: asymmetric bento */}
        <NoveltySection />

        {/* Research + trust layer as one scroll story */}
        <JourneySection setView={setView} />

        {/* SlayQL Link (research) benchmarks, candidates chart and the running ablation */}
        <ResearchSection />

        {/* Recorded runs replayed step by step */}
        <ReplaySection />

        {/* Interactive Architecture */}
        <PipelineMap />

        {/* Measured results from backend/eval/results */}
        <TrustResultsSection />

        {/* Test sets, component ablation, cost setting, confidence weights */}
        <MethodSection />

        {/* Malaysian fit and the weekly pack */}
        <MalaysiaSection />

        {/* Interview quotes (hidden until real quotes are added) */}
        <VoicesSection />

        {/* Database Connectors */}
        <ConnectSection setView={setView} />

        {/* Monash University Malaysia FYP */}
        <ProjectSection />

        {/* Closing call to action: the answer end of the hero image as a bookend */}
        <section className="bg-white px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <Reveal variant="scale" className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-slate-200">
            <img
              src="/landing/hero-section-960.webp"
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover object-[92%_12%]"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,#ffffff_0%,rgba(255,255,255,0.92)_45%,rgba(255,255,255,0.2)_80%)]" />
            <div className="relative max-w-xl px-6 py-14 sm:px-12 lg:py-20">
              <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-5xl">Try it on your own questions.</h2>
              <p className="mt-4 text-lg text-slate-600">Ask the demo database anything, or read the code and every evaluation on GitHub.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setView('demo')}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-[0_12px_32px_-12px_rgba(67,56,202,0.75)] transition hover:bg-indigo-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  Try the demo
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <a
                  href={PROJECT.appRepo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-base font-semibold text-slate-800 transition hover:border-slate-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  <BrandLogo brand="github" className="h-4 w-4" />
                  View on GitHub
                </a>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <Footer setView={setView} />
    </div>
  );
}
