import React from 'react';
import { GitFork, HelpCircle, Timer } from 'lucide-react';

/* ─── Keyword-aware text renderer (mirrors BentoGrid pattern) ──────── */
function HighlightedText({ text, highlights }) {
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

const PROBLEMS = [
  {
    icon: GitFork,
    iconBg: 'bg-rose-50 border-rose-100',
    iconColor: 'text-rose-600',
    title: 'Schema Complexity',
    text: 'Enterprise databases contain hundreds of tables and thousands of columns. Dense retrieval ranks columns independently, so low-similarity junction tables get dropped — leaving the model with a disconnected schema graph and no path to join on.',
    highlights: [
      { phrase: 'hundreds of tables', cls: 'kw-highlight-rose' },
      { phrase: 'junction tables get dropped', cls: 'kw-highlight-rose' },
      { phrase: 'disconnected schema graph', cls: 'kw-highlight-rose' },
    ],
  },
  {
    icon: HelpCircle,
    iconBg: 'bg-amber-50 border-amber-100',
    iconColor: 'text-amber-600',
    title: 'Value Ambiguity',
    text: "Keywords in a user's question may not appear anywhere in a column's name or description — only in its cell values. SlayQL-Lite grounds queries against actual database values instead of guessing which column a literal belongs to.",
    highlights: [
      { phrase: 'cell values', cls: 'kw-highlight-amber' },
      { phrase: 'grounds queries against actual database values', cls: 'kw-highlight-amber' },
    ],
  },
  {
    icon: Timer,
    iconBg: 'bg-blue-50 border-blue-100',
    iconColor: 'text-blue-600',
    title: 'Inefficient Exploration',
    text: 'A fixed multi-turn exploration budget runs the same number of turns for every query, regardless of complexity — burning tokens and latency on simple questions. SlayQL-Lite exits dynamically once the candidate schema stabilizes.',
    highlights: [
      { phrase: 'fixed multi-turn exploration budget', cls: 'kw-highlight-blue' },
      { phrase: 'burning tokens and latency', cls: 'kw-highlight-rose' },
      { phrase: 'exits dynamically', cls: 'kw-highlight-blue' },
      { phrase: 'candidate schema stabilizes', cls: 'kw-highlight-blue' },
    ],
  },
];

export default function ProblemSection() {
  return (
    <section id="problem" className="py-20 lg:py-28 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold uppercase tracking-wider">
            <span className="inline-block w-2 h-2 rounded-full bg-rose-500"></span>
            The Problem
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            Why Traditional Text-to-SQL Fails
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            Dense vector retrieval alone breaks down at enterprise scale —{' '}
            <span className="kw-highlight-rose">it misses join paths</span>,{' '}
            <span className="kw-highlight-amber">confuses values with column names</span>, and{' '}
            <span className="kw-highlight-blue">wastes exploration budget</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PROBLEMS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="p-6 rounded-2xl border border-slate-200 bg-slate-50">
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-5 ${p.iconBg}`}>
                  <Icon className={`w-5 h-5 ${p.iconColor}`} />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{p.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  <HighlightedText text={p.text} highlights={p.highlights} />
                </p>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
