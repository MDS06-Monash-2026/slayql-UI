import React from 'react';
import { useResearchSummary } from '../../services/useResearchSummary';

// Real questions from the evaluation sets (team-written, invented data), English and Bahasa Malaysia.
// The page's only marquee. It pauses on hover and stands still when reduced motion is requested.
function Row({ items, reverse }) {
  const doubled = [...items, ...items];
  return (
    <div className="marquee flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      <ul className="marquee-track flex shrink-0 gap-3 pr-3" style={reverse ? { animationDirection: 'reverse' } : undefined}>
        {doubled.map((q, i) => (
          <li
            key={`${q.text}-${i}`}
            aria-hidden={i >= items.length}
            className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-[0_6px_20px_-14px_rgba(15,23,42,0.35)]"
          >
            {q.language !== 'en' && <span className="rounded-full bg-indigo-50 px-1.5 text-[11px] font-semibold text-indigo-700">BM</span>}
            {q.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function QuestionMarquee() {
  const { summary } = useResearchSummary();
  const questions = summary?.highlights?.questions || [];
  if (questions.length < 8) return null;
  return (
    <section aria-label="Questions from our evaluation sets" className="space-y-3 overflow-hidden bg-white pb-6">
      <Row items={questions.filter((_, i) => i % 2 === 0)} />
      <Row items={questions.filter((_, i) => i % 2 === 1)} reverse />
    </section>
  );
}
