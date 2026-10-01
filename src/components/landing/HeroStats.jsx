import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { pct, useResearchSummary } from '../../services/useResearchSummary';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Counts from the plain-AI figure to the SlayQL figure once the strip is on screen, so the
// movement itself shows the change. With reduced motion the final value is shown at once.
function useCountFromTo(from, to, active) {
  const [value, setValue] = useState(() => (reducedMotion() ? to : from));
  useEffect(() => {
    if (!active || reducedMotion()) { setValue(to); return undefined; }
    let frame;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 1400);
      const eased = 1 - (1 - t) ** 3;
      setValue(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    setValue(from);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to, active]);
  return value;
}

// One stat: label, value, and a delta stated in words with an icon (never colour alone).
function Stat({ label, value, from, better, context, active }) {
  const shown = useCountFromTo(from, value, active);
  const improved = better === 'lower' ? value < from : value > from;
  const Arrow = value < from ? ArrowDownRight : ArrowUpRight;
  return (
    <div className="border-slate-200 py-6 sm:px-6 lg:border-l lg:py-2 lg:first:border-l-0 lg:first:pl-0">
      <p className="text-5xl font-semibold tracking-[-0.04em] text-slate-950 tabular-nums lg:text-6xl" aria-hidden="true">{pct(shown)}</p>
      <p className="sr-only">{pct(value)}</p>
      <p className={`mt-2 flex items-center gap-1 text-sm font-medium ${improved ? 'text-emerald-700' : 'text-slate-600'}`}>
        <Arrow className="h-4 w-4" aria-hidden="true" />
        {value < from ? 'Down' : 'Up'} from {pct(from)}
      </p>
      <p className="mt-3 max-w-[16rem] text-sm leading-snug text-slate-700">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{context}</p>
    </div>
  );
}

export default function HeroStats() {
  const { summary } = useResearchSummary();
  const ref = useRef(null);
  const [active, setActive] = useState(false);
  const h = summary?.highlights;

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setActive(true), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [h]);

  if (!h) return <div className="h-48" aria-hidden="true" />;
  const tiles = [
    h.trap && {
      label: 'Wrong answers stated as fact on business questions', value: h.trap.after, from: h.trap.before, better: 'lower',
      context: `${h.trap.n} questions with known traps`,
    },
    h.distributor && {
      label: 'Wrong answers stated as fact on Malaysian distributor data', value: h.distributor.after, from: h.distributor.before,
      better: 'lower', context: `${h.distributor.n} AutoCount-style questions, English and BM`,
    },
    h.learning && {
      label: 'Confident wrong answers after 40 analyst reviews', value: h.learning.after_40, from: h.learning.start, better: 'lower',
      context: 'Public BIRD benchmark',
    },
    h.starter_pack && {
      label: 'Questions answered once definitions are approved', value: h.starter_pack.answered_after, from: h.starter_pack.answered_before,
      better: 'higher', context: 'AutoCount starter pack, no right answers held back',
    },
  ].filter(Boolean);

  return (
    <section ref={ref} aria-label="Headline results" className="bg-white">
      <div className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8 lg:pb-8">
        <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
          {tiles.map((tile) => <Stat key={tile.label} active={active} {...tile} />)}
        </div>
        <p className="mt-8 text-sm text-slate-500">
          Before and after: the same generated queries without and with the checks, scored against known answers.{' '}
          <a href="#results" className="font-medium text-indigo-700 underline decoration-indigo-200 underline-offset-4 hover:decoration-indigo-500">See the method</a>
        </p>
      </div>
    </section>
  );
}
