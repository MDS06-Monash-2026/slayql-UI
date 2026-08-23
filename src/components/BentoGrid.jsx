import React, { useEffect, useRef } from 'react';
import { Network, Target, Repeat, LineChart } from 'lucide-react';

/* ─── Keyword-aware text renderer ──────────────────────────────────── */
function HighlightedDesc({ text, highlights }) {
  if (!highlights || highlights.length === 0) return <>{text}</>;
  const parts = [];
  let remaining = text;
  highlights.forEach(({ phrase, cls }) => {
    const idx = remaining.indexOf(phrase);
    if (idx === -1) return;
    if (idx > 0) parts.push(<span key={`pre-${phrase}`}>{remaining.slice(0, idx)}</span>);
    parts.push(<span key={phrase} className={cls}>{phrase}</span>);
    remaining = remaining.slice(idx + phrase.length);
  });
  if (remaining) parts.push(<span key="tail">{remaining}</span>);
  return <>{parts}</>;
}

const CARDS = [
  {
    icon: Network,
    heading: 'Intelligent Schema Exploration',
    desc: 'Automatically discovers tables, columns and relationships using graph-based reasoning over the foreign-key structure.',
    highlights: [
      { phrase: 'graph-based reasoning', cls: 'kw-highlight' },
      { phrase: 'foreign-key structure', cls: 'kw-highlight' },
    ],
    bullets: [
      { text: 'Multi-hop relationship discovery', kwClass: 'kw-highlight' },
      { text: 'FK propagation — no manual mapping', kwClass: null },
      { text: 'Reduced schema noise by design', kwClass: null },
    ],
    accent: '#4f46e5',
    accentLight: '#eef2ff',
    iconBg: 'bg-indigo-50 border-indigo-100',
    iconColor: 'text-indigo-600',
    hoverBorder: 'hover:border-indigo-200',
    hoverShadow: 'hover:shadow-indigo-50/80',
    revealDelay: '',
  },
  {
    icon: Target,
    heading: 'Value-Grounded Query Understanding',
    desc: 'Connects user intent to actual database values via sub-second BM25 retrieval — zero hallucination, precise entity mapping.',
    highlights: [
      { phrase: 'sub-second BM25 retrieval', cls: 'kw-highlight-amber' },
      { phrase: 'zero hallucination', cls: 'kw-highlight-emerald' },
    ],
    bullets: [
      { text: 'Sub-second value retrieval', kwClass: 'kw-highlight-amber' },
      { text: 'Context-aware entity matching', kwClass: null },
      { text: 'Ambiguous literal resolution', kwClass: null },
    ],
    accent: '#d97706',
    accentLight: '#fffbeb',
    iconBg: 'bg-amber-50 border-amber-100',
    iconColor: 'text-amber-600',
    hoverBorder: 'hover:border-amber-200',
    hoverShadow: 'hover:shadow-amber-50/80',
    revealDelay: 'reveal-delay-1',
  },
  {
    icon: Repeat,
    heading: 'Agentic SQL Generation',
    desc: 'Generates reliable SQL through iterative reasoning with dynamic schema exploration and strict output guardrails.',
    highlights: [
      { phrase: 'dynamic schema exploration', cls: 'kw-highlight-violet' },
      { phrase: 'strict output guardrails', cls: 'kw-highlight-violet' },
    ],
    bullets: [
      { text: 'IT-EE: early exit on stable schema', kwClass: 'kw-highlight-violet' },
      { text: 'SQL revision loop with guardrails', kwClass: null },
      { text: 'Strict output contracts (QOC)', kwClass: null },
    ],
    accent: '#7c3aed',
    accentLight: '#f5f3ff',
    iconBg: 'bg-violet-50 border-violet-100',
    iconColor: 'text-violet-600',
    hoverBorder: 'hover:border-violet-200',
    hoverShadow: 'hover:shadow-violet-50/80',
    revealDelay: 'reveal-delay-2',
  },
  {
    icon: LineChart,
    heading: 'Interactive Data Exploration',
    desc: 'View generated SQL, result table and auto-generated chart side by side — with zero-data retention after session close.',
    highlights: [
      { phrase: 'zero-data retention', cls: 'kw-highlight-teal' },
      { phrase: 'auto-generated chart', cls: 'kw-highlight-teal' },
    ],
    bullets: [
      { text: 'Auto chart generation', kwClass: 'kw-highlight-teal' },
      { text: 'Zero-data retention guarantee', kwClass: 'kw-highlight-teal' },
      { text: 'SQL · Table · Chart — side by side', kwClass: null },
    ],
    accent: '#0d9488',
    accentLight: '#f0fdfa',
    iconBg: 'bg-teal-50 border-teal-100',
    iconColor: 'text-teal-600',
    hoverBorder: 'hover:border-teal-200',
    hoverShadow: 'hover:shadow-teal-50/80',
    revealDelay: 'reveal-delay-3',
  },
];

/* ─── Scroll-reveal hook ────────────────────────────────────────────── */
function useScrollReveal(ref) {
  useEffect(() => {
    if (!ref.current) return;
    const els = ref.current.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.12 }
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [ref]);
}

export default function FeaturesGrid() {
  const sectionRef = useRef(null);
  useScrollReveal(sectionRef);

  return (
    <section
      id="features"
      ref={sectionRef}
      className="py-20 lg:py-28 bg-slate-50 border-t border-slate-200 relative overflow-hidden"
    >
      {/* Subtle dot background */}
      <div className="section-dot-bg absolute inset-0 pointer-events-none opacity-40" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Section header */}
        <div className="text-center mb-14 reveal">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold uppercase tracking-wider">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Features
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            Built for Scalable Schema Exploration.
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            Four modules, each targeting a specific failure mode of dense-retrieval-only Text-to-SQL.
          </p>
        </div>

        {/* 4-column vertical card row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.heading}
                className={`reveal ${card.revealDelay} feature-card glow-hover group p-6 rounded-2xl border border-slate-200 bg-white ${card.hoverBorder} hover:shadow-xl ${card.hoverShadow} flex flex-col`}
                style={{ '--card-accent': card.accent }}
              >
                {/* Gradient top wash on hover */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: `linear-gradient(145deg, ${card.accentLight} 0%, transparent 60%)` }}
                />

                {/* Icon badge */}
                <div className={`relative w-11 h-11 rounded-xl border ${card.iconBg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>

                {/* Heading */}
                <h3 className="relative text-base font-bold text-slate-900 mb-3 leading-snug">
                  {card.heading}
                </h3>

                {/* Micro-description with keyword highlights */}
                <p className="relative text-sm text-slate-500 leading-relaxed flex-1">
                  <HighlightedDesc text={card.desc} highlights={card.highlights} />
                </p>

                {/* Bullet list with keyword emphasis */}
                <ul className="relative mt-5 space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-4">
                  {card.bullets.map((b, bi) => (
                    <li key={bi} className="flex items-start gap-2">
                      <span
                        className="mt-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white transition-transform duration-200 group-hover:scale-110"
                        style={{ background: card.accent }}
                      >
                        ✓
                      </span>
                      {b.kwClass ? (
                        <span className={b.kwClass}>{b.text}</span>
                      ) : (
                        b.text
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
