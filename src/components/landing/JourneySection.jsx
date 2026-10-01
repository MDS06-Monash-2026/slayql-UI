import React, { useEffect, useRef, useState } from 'react';
import { BookOpenCheck, Languages, ListChecks, Microscope, Scale } from 'lucide-react';
import { useResearchSummary } from '../../services/useResearchSummary';
import { AFTER, BEFORE, ConfidenceGauge, GapBars, RingStat, TrapRadar } from './charts';
import { Reveal, prefersReducedMotion, useInView } from './motion';

// Figures from the C-CaSE research runs (run/log_spider2_full_slayql, run/bird_dev_v18_full; deepseek-v4-flash).
const RESEARCH = { spiderEx: 0.4589, spiderCorrect: 251, spiderTotal: 547, generated: 0.6877, chosen: 0.5619 };
// One real run from results/trap.json (item period-03): confidence 0.8808 against the 0.8 threshold.
const EXAMPLE = { p: 0.8808, threshold: 0.8 };

function AskVisual() {
  return (
    <div className="w-full max-w-md space-y-4">
      <p className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-md bg-indigo-600 px-5 py-3.5 text-lg text-white shadow-[0_18px_40px_-20px_rgba(67,56,202,0.8)]">
        What was the total value of completed orders last month?
      </p>
      <p className="w-fit max-w-[85%] rounded-3xl rounded-bl-md border border-slate-200 bg-white px-5 py-3.5 text-lg text-slate-800 shadow-sm">
        Berapa jumlah jualan kita?
      </p>
      <p className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-md bg-indigo-600 px-5 py-3.5 text-lg text-white shadow-[0_18px_40px_-20px_rgba(67,56,202,0.8)]">
        Which customer owes us the most?
      </p>
    </div>
  );
}

const STEPS = [
  {
    id: 'ask', icon: Languages, title: 'Ask in plain words',
    text: 'English or Bahasa Malaysia, the way you would ask a colleague.',
    visual: () => <AskVisual />,
  },
  {
    id: 'find', icon: Microscope, title: 'Find the right data',
    text: 'Our C-CaSE research links the question to the tables, joins and values it needs. The app runs a fast version of it.',
    visual: (play) => (
      <RingStat value={RESEARCH.spiderEx} play={play} caption={`Execution accuracy on Spider 2.0-Lite: ${RESEARCH.spiderCorrect} of ${RESEARCH.spiderTotal} enterprise questions.`} />
    ),
  },
  {
    id: 'gap', icon: Scale, title: 'Write several, then choose',
    text: 'Models often write a correct query and then pick the wrong one. That gap is where wrong answers come from.',
    visual: (play) => (
      <GapBars
        play={play}
        rows={[
          { label: 'A correct query was written', value: RESEARCH.generated, color: BEFORE },
          { label: 'The correct query was chosen', value: RESEARCH.chosen, color: AFTER },
        ]}
      />
    ),
  },
  {
    id: 'check', icon: ListChecks, title: 'Check against the real data',
    text: 'Probe queries catch double counting, unclear meanings, date traps and questions the data cannot answer.',
    visual: (play, types, compact) => <TrapRadar types={types} play={play} compact={compact} height={compact ? 300 : 400} />,
  },
  {
    id: 'decide', icon: BookOpenCheck, title: 'Answer, ask, or hand off',
    text: 'A calibrated confidence is compared with what a wrong figure costs your business.',
    visual: (play) => <ConfidenceGauge p={EXAMPLE.p} threshold={EXAMPLE.threshold} play={play} />,
  },
];

function Step({ step, index, active, onActive, types, inline }) {
  const ref = useRef(null);
  const [inlineRef, inlineInView] = useInView({ threshold: 0.3 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && onActive(index), { rootMargin: '-45% 0px -45% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [index, onActive]);
  const Icon = step.icon;
  return (
    <div ref={ref} className="flex flex-col justify-center py-10 lg:min-h-[72vh] lg:py-0">
      <div className={`transition duration-500 ${active ? 'lg:opacity-100' : 'lg:opacity-30'}`}>
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl transition duration-500 ${active ? 'bg-indigo-600 text-white shadow-[0_12px_28px_-12px_rgba(67,56,202,0.8)]' : 'bg-indigo-50 text-indigo-600'}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">{step.title}</h3>
        <p className="mt-3 max-w-md text-lg text-slate-600">{step.text}</p>
      </div>
      {/* Mobile: the visual sits under its step. */}
      {inline && (
        <div ref={inlineRef} className="mt-8 flex min-h-[18rem] items-center justify-center rounded-3xl border border-slate-200 bg-white p-4 sm:p-6">
          {step.visual(inlineInView, types, true)}
        </div>
      )}
    </div>
  );
}

export default function JourneySection() {
  const { summary } = useResearchSummary();
  const types = summary?.highlights?.trap_types?.types;
  const [active, setActive] = useState(0);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const still = prefersReducedMotion();

  return (
    <section id="how-it-works" className="bg-slate-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal variant="blur">
          <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-slate-950 text-balance sm:text-5xl">From question to checked answer</h2>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">Research finds the data. The trust layer decides whether the answer is safe to give.</p>
        </Reveal>

        <div className="mt-10 grid gap-10 lg:mt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="relative lg:pl-10">
            {/* progress rail */}
            <div aria-hidden="true" className="absolute bottom-[36vh] left-[1.35rem] top-[36vh] hidden w-px bg-slate-200 lg:block">
              <div className="w-px bg-indigo-600 transition-all duration-700" style={{ height: `${(active / (STEPS.length - 1)) * 100}%` }} />
            </div>
            {STEPS.map((step, index) => (
              <Step key={step.id} step={step} index={index} active={index === active} onActive={setActive} types={types} inline={!wide} />
            ))}
          </div>

          {wide && (
            <div className="hidden lg:block">
              <div className="sticky top-24 flex h-[calc(100dvh-8rem)] items-center">
                <div className="relative h-[34rem] w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_40px_90px_-50px_rgba(67,56,202,0.45)]">
                  <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-100/70 blur-3xl" />
                  {STEPS.map((step, index) => (
                    <div
                      key={step.id}
                      aria-hidden={index !== active}
                      className={`absolute inset-0 flex items-center justify-center p-10 transition duration-700 ${index === active ? 'opacity-100' : still ? 'opacity-0' : 'pointer-events-none translate-y-6 scale-[0.97] opacity-0'}`}
                    >
                      {step.visual(index === active, types)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
