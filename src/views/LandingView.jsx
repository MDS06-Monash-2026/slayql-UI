import React, { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import EngineWorkspace from '../components/EngineWorkspace';

import ArchitectureSection from '../components/ArchitectureSection';
import TrustResultsSection from '../components/TrustResultsSection';
import DatabaseConnectors from '../components/DatabaseConnectors';
import Footer from '../components/Footer';
import JourneySection from '../components/landing/JourneySection';
import QuestionMarquee from '../components/landing/QuestionMarquee';
import { Reveal, ScrollProgress } from '../components/landing/motion';
import NoveltySection from '../components/landing/NoveltySection';
import MalaysiaSection from '../components/landing/MalaysiaSection';
import ProjectSection, { VoicesSection } from '../components/landing/ProjectSection';
import HeroStats from '../components/landing/HeroStats';
import { PROJECT } from '../content/projectInfo';
import { ArrowRight, Github } from 'lucide-react';

export default function LandingView({ setView, onDatabaseConnect }) {
  /* Global scroll-reveal for any section using .reveal that doesn't
     manage its own observer (Problem, Benchmark, etc.) */
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
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
        <JourneySection />

        {/* Unified Engine + Live Workspace */}
        <EngineWorkspace />

        {/* Interactive Architecture */}
        <ArchitectureSection />

        {/* Measured results from backend/eval/results */}
        <TrustResultsSection />

        {/* Malaysian fit and the weekly pack */}
        <MalaysiaSection />

        {/* Interview quotes (hidden until real quotes are added) */}
        <VoicesSection />

        {/* Database Connectors */}
        <DatabaseConnectors onConnected={(dbName) => {
          if (onDatabaseConnect) onDatabaseConnect(dbName);
        }} />

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
                  <Github className="h-4 w-4" aria-hidden="true" />
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
