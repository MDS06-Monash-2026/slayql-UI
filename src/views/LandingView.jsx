import React, { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import EngineWorkspace from '../components/EngineWorkspace';
import ProblemSection from '../components/ProblemSection';
import ArchitectureSection from '../components/ArchitectureSection';
import BentoGrid from '../components/BentoGrid';
import BenchmarkSection from '../components/BenchmarkSection';
import DatabaseConnectors from '../components/DatabaseConnectors';
import Footer from '../components/Footer';
import { Github } from 'lucide-react';

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
      <Navbar setView={setView} currentView="landing" />

      {/* Hero */}
      <Hero setView={setView} />

      {/* Unified Engine + Live Workspace */}
      <EngineWorkspace />

      {/* Problem Section */}
      <ProblemSection />

      {/* Interactive Architecture */}
      <ArchitectureSection />

      {/* Feature Grid — 4-col vertical cards */}
      <BentoGrid />

      {/* Enterprise Benchmark Leaderboard (includes ablation) */}
      <BenchmarkSection />

      {/* Database Connectors */}
      <DatabaseConnectors onConnected={(dbName) => {
        if (onDatabaseConnect) onDatabaseConnect(dbName);
      }} />

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-700 relative overflow-hidden">
        <div className="cta-grid-overlay absolute inset-0 pointer-events-none opacity-10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-4 animate-fade-in-up">
            Try SlayQL on Your Own Questions.
          </h2>
          <p className="text-xl text-indigo-200 mb-10 max-w-2xl mx-auto font-light">
            Explore the interactive workspace, read the architecture, or dig into the code and evaluation pipeline on GitHub.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => setView('onboarding')}
              className="inline-flex items-center gap-2 px-8 py-4 bg-white hover:bg-slate-50 text-indigo-700 font-bold text-base rounded-xl transition-all shadow-2xl"
            >
              Try Live Demo
            </button>
            <a
              href="https://github.com/MDS06-Monash-2026/C-CaSE"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-transparent hover:bg-white/10 text-white font-semibold text-base rounded-xl border border-white/30 transition-all"
            >
              <Github className="w-4 h-4" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <Footer setView={setView} />
    </div>
  );
}
