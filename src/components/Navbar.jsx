import React, { useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';

export default function Navbar({ setView, currentView }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (sectionId, e) => {
    e.preventDefault();
    if (currentView !== 'landing') {
      setView('landing');
      setTimeout(() => {
        const target = document.getElementById(sectionId);
        if (target) {
          const offset = 72;
          const top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }, 100);
    } else {
      const target = document.getElementById(sectionId);
      if (target) {
        const offset = 72;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
    setMobileMenuOpen(false);
  };

  return (
    <header id="navbar" className="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
      <div className="nav-glass border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Brand Logo & Name */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('landing')}>
              <div className="brand-logo flex items-center justify-center w-12 h-12 rounded-xl overflow-hidden shadow-sm">
                <img src="/SlayQLlogo.png" alt="SlayQL Logo" className="w-full h-full object-contain" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-slate-900">SlayQL</span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-semibold tracking-wide uppercase">Live Demo</span>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1" role="navigation" aria-label="Main navigation">
              <a href="#workspace" onClick={(e) => handleNavClick('workspace', e)} className="nav-link px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-150">Workspace</a>
              <a href="#architecture" onClick={(e) => handleNavClick('architecture', e)} className="nav-link px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-150">Architecture</a>
              <a href="#features" onClick={(e) => handleNavClick('features', e)} className="nav-link px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-150">Features</a>
              <a href="#benchmark" onClick={(e) => handleNavClick('benchmark', e)} className="nav-link px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-150">Benchmark</a>
              <a href="#connectors" onClick={(e) => handleNavClick('connectors', e)} className="nav-link px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-150">Connectors</a>
            </nav>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {currentView === 'landing' ? (
                <>
                  <a href="https://github.com/MDS06-Monash-2026/C-CaSE" target="_blank" rel="noopener noreferrer" className="hidden sm:inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-150">
                    GitHub
                  </a>
                  <button onClick={() => setView('demo')} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-all duration-150 shadow-md shadow-indigo-200 hover:shadow-indigo-300">
                    <span>Try Live Demo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button onClick={() => setView('landing')} className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-all duration-150">
                  <span>Back to Landing</span>
                </button>
              )}

              {/* Mobile menu toggle */}
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
                className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
                aria-label="Toggle mobile menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div id="mobile-menu" className="lg:hidden border-t border-slate-200/60 bg-white/95 backdrop-blur-md">
            <div className="px-4 py-3 space-y-1">
              <a href="#workspace" onClick={(e) => handleNavClick('workspace', e)} className="block px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all">Workspace</a>
              <a href="#architecture" onClick={(e) => handleNavClick('architecture', e)} className="block px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all">Architecture</a>
              <a href="#features" onClick={(e) => handleNavClick('features', e)} className="block px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all">Features</a>
              <a href="#benchmark" onClick={(e) => handleNavClick('benchmark', e)} className="block px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all">Benchmark</a>
              <a href="#connectors" onClick={(e) => handleNavClick('connectors', e)} className="block px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all">Connectors</a>

              <div className="pt-2 flex flex-col gap-2">
                {currentView === 'landing' ? (
                  <>
                    <a href="https://github.com/MDS06-Monash-2026/C-CaSE" target="_blank" rel="noopener noreferrer" className="w-full text-center px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">GitHub</a>
                    <button onClick={() => { setView('demo'); setMobileMenuOpen(false); }} className="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">Try Live Demo</button>
                  </>
                ) : (
                  <button onClick={() => { setView('landing'); setMobileMenuOpen(false); }} className="w-full px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50">Back to Landing</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
