import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import BrandLogo from './landing/BrandLogo';

const NAV_ITEMS = [
  { id: 'novelty', label: "What's new" },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'research', label: 'Research' },
  { id: 'results', label: 'Results' },
  { id: 'method', label: 'Method' },
  { id: 'malaysia', label: 'Malaysia' },
  { id: 'about', label: 'About' },
];

const NAV_OFFSET = 72;

export default function Navbar({ setView, currentView }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pill, setPill] = useState({ left: 0, width: 0, visible: false });
  const navRef = useRef(null);
  const linkRefs = useRef({});
  // While a nav click is smooth-scrolling, keep the clicked item active and the bar visible.
  const navigatingTo = useRef(null);
  const lastY = useRef(0);

  // One rAF-throttled scroll handler: solid background after the top, hide on scroll down,
  // show on scroll up, and track the section in view.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - lastY.current;
      lastY.current = y;
      setScrolled(y > 12);
      if (!navigatingTo.current) {
        if (y < 160 || delta < -6) setHidden(false);
        else if (delta > 6) setHidden(true);
      }
      if (currentView !== 'landing') return;
      if (navigatingTo.current) { setActiveSection(navigatingTo.current); return; }
      for (let i = NAV_ITEMS.length - 1; i >= 0; i -= 1) {
        const el = document.getElementById(NAV_ITEMS[i].id);
        if (el && y >= el.getBoundingClientRect().top + y - 140) { setActiveSection(NAV_ITEMS[i].id); return; }
      }
      setActiveSection('');
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [currentView]);

  // Slide the highlight pill under the active link.
  const measure = useCallback(() => {
    const link = linkRefs.current[activeSection];
    const nav = navRef.current;
    if (!link || !nav) { setPill((p) => ({ ...p, visible: false })); return; }
    setPill({ left: link.offsetLeft, width: link.offsetWidth, visible: true });
  }, [activeSection]);
  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  const scrollToSection = (sectionId) => {
    const target = document.getElementById(sectionId);
    if (!target) return;
    navigatingTo.current = sectionId;
    setActiveSection(sectionId);
    setHidden(false);
    const top = target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
    window.scrollTo({ top, behavior: 'smooth' });
    const release = () => { navigatingTo.current = null; window.removeEventListener('scrollend', release); };
    window.addEventListener('scrollend', release);
    setTimeout(release, 1500); // browsers without scrollend
  };

  const handleNavClick = (sectionId, e) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (currentView !== 'landing') {
      setView('landing');
      setTimeout(() => scrollToSection(sectionId), 100);
    } else {
      scrollToSection(sectionId);
    }
  };

  const solid = scrolled || mobileMenuOpen || currentView !== 'landing';

  return (
    <header
      id="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${hidden && !mobileMenuOpen ? '-translate-y-full' : 'translate-y-0'}`}
    >
      <div
        className={`relative border-b backdrop-blur-xl transition-[background-color,box-shadow,border-color] duration-500 ${
          solid
            ? 'border-slate-200/70 bg-white/85 shadow-[0_10px_30px_-20px_rgba(30,27,75,0.35)]'
            : 'border-transparent bg-white/45'
        }`}
      >
        <div className={`absolute inset-x-0 bottom-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/25 to-transparent pointer-events-none transition-opacity duration-500 ${solid ? 'opacity-100' : 'opacity-0'}`} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`flex items-center justify-between transition-[height] duration-500 ${scrolled ? 'h-14' : 'h-16'}`}>

            {/* Brand Logo & Name */}
            <div className="flex items-center gap-2.5 cursor-pointer group" onClick={() => setView('landing')}>
              <div className="brand-logo flex items-center justify-center w-10 h-10 rounded-xl overflow-hidden shadow-sm group-hover:scale-105 transition-transform duration-200">
                <img src="/SlayQLlogo.png" alt="SlayQL Logo" className="w-full h-full object-contain" />
              </div>
              <div className="relative inline-flex flex-col">
                <span className="slayql-logo text-2xl tracking-tight">
                  <span className="slay">Slay</span><span className="ql">QL</span>
                </span>
                <span className="nav-brand-bar" aria-hidden="true" />
              </div>
            </div>

            {/* Desktop Navigation Links: one highlight pill glides to the active section */}
            <nav ref={navRef} className="relative hidden lg:flex items-center gap-1" aria-label="Main navigation">
              <span
                aria-hidden="true"
                className="nav-pill pointer-events-none absolute top-1/2 h-9 -translate-y-1/2 rounded-[0.625rem]"
                style={{ left: pill.left, width: pill.width, opacity: pill.visible ? 1 : 0 }}
              />
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <a
                    key={item.id}
                    ref={(el) => { linkRefs.current[item.id] = el; }}
                    href={`#${item.id}`}
                    onClick={(e) => handleNavClick(item.id, e)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`nav-link nav-link-tracked relative z-[1] ${isActive ? 'is-current' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
                  >
                    <span>{item.label}</span>
                    <span className="nav-link-bar" aria-hidden="true" />
                  </a>
                );
              })}
            </nav>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {currentView === 'landing' ? (
                <>
                  <a href="https://github.com/MDS06-Monash-2026/slayql-UI" target="_blank" rel="noopener noreferrer" className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all duration-150">
                    <BrandLogo brand="github" className="h-4 w-4" />
                    GitHub
                  </a>
                  <button onClick={() => setView('demo')} className="group inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-all duration-150 shadow-md shadow-indigo-200 hover:shadow-indigo-300 active:scale-[0.98]">
                    <span>Try the demo</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
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
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Menu: animates open and closed */}
        <div
          id="mobile-menu"
          className={`lg:hidden grid transition-[grid-template-rows,opacity] duration-300 ease-out ${mobileMenuOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}
          aria-hidden={!mobileMenuOpen}
        >
          <div className="overflow-hidden">
            <div className="border-t border-slate-200/60 px-4 py-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    tabIndex={mobileMenuOpen ? 0 : -1}
                    onClick={(e) => handleNavClick(item.id, e)}
                    className={`mobile-nav-link ${isActive ? 'is-active' : ''}`}
                  >
                    <span className="mobile-nav-link-indicator" aria-hidden="true" />
                    <span>{item.label}</span>
                  </a>
                );
              })}

              <div className="pt-2 flex flex-col gap-2">
                {currentView === 'landing' ? (
                  <>
                    <a href="https://github.com/MDS06-Monash-2026/slayql-UI" target="_blank" rel="noopener noreferrer" tabIndex={mobileMenuOpen ? 0 : -1} className="w-full text-center px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">GitHub</a>
                    <button tabIndex={mobileMenuOpen ? 0 : -1} onClick={() => { setView('demo'); setMobileMenuOpen(false); }} className="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">Try the demo</button>
                  </>
                ) : (
                  <button tabIndex={mobileMenuOpen ? 0 : -1} onClick={() => { setView('landing'); setMobileMenuOpen(false); }} className="w-full px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50">Back to Landing</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
