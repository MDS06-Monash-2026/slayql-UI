import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { pct, useResearchSummary } from '../services/useResearchSummary';
import ResultsDumbbell from './landing/ResultsDumbbell';

// A before -> after figure; the colour of the change says whether it is better, with an icon and words.
function Change({ label, before, after, better = 'lower', note }) {
  const improved = better === 'lower' ? after < before : after > before;
  const Arrow = after < before ? ArrowDownRight : ArrowUpRight;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{pct(after)}</p>
      <p className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${improved ? 'text-emerald-700' : 'text-slate-600'}`}>
        <Arrow className="h-3.5 w-3.5" aria-hidden="true" />
        {improved ? 'Better' : 'Changed'}: {after < before ? 'down' : 'up'} from {pct(before)}
      </p>
      {note && <p className="mt-1 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}

function Card({ title, subtitle, children, source }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
      {source && <p className="mt-3 text-[11px] text-slate-400">{source}</p>}
    </div>
  );
}

function LearningCard({ learning }) {
  const points = learning.points || [];
  const start = points[0];
  const at40 = points.find((point) => point.reviews === 40);
  if (!start || !at40) return null;
  return (
    <div className="grid gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <h3 className="text-lg font-bold text-slate-900">It learns from your analyst</h3>
        <p className="mt-2 text-sm text-slate-700">
          On an unfamiliar database the default confidence is too sure of itself: at the default setting it would state a wrong answer as
          fact for {pct(start.silent_error_c4)} of questions. Each answer an analyst confirms or corrects recalibrates SlayQL for that database.
          After {at40.reviews} reviews that falls to {pct(at40.silent_error_c4)}, because SlayQL has learned which questions to hand over.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          BIRD Mini-Dev, {learning.test} held-out questions; reviews drawn at random from the other half, averaged over {learning.repeats} orders.
        </p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 16, bottom: 20, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="reviews" type="number" domain={[0, 'dataMax']} tick={{ fontSize: 11, fill: '#64748b' }} label={{ value: 'Answers reviewed by an analyst', position: 'insideBottom', offset: -10, fontSize: 12 }} />
            <YAxis domain={[0, 'auto']} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={45} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip formatter={(v) => pct(v)} labelFormatter={(v) => `${v} reviews`} />
            <Line type="monotone" dataKey="silent_error_c4" name="Wrong answers given as fact" stroke="#4338ca" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function TrustResultsSection() {
  const { summary, error } = useResearchSummary();
  const h = summary?.highlights || {};
  const bird = summary?.datasets?.bird;
  const baseRisk = bird ? bird.configs.B0.selective_risk : null;
  const loops = h.human_loop || {};

  const rows = [
    h.trap && { label: 'Business trap set', detail: `${h.trap.n} questions with known traps`, before: h.trap.before, after: h.trap.after, source: `${h.trap.source} · ${h.trap.model}` },
    h.distributor && { label: 'Malaysian distributor', detail: `${h.distributor.n} AutoCount-style questions`, before: h.distributor.before, after: h.distributor.after, source: `${h.distributor.source} · ${h.distributor.model}` },
    h.bird && { label: 'BIRD public benchmark', detail: `${h.bird.n} held-out questions, lenient setting`, before: h.bird.before, after: h.bird.after, source: `${h.bird.source} · ${h.bird.model}` },
    h.learning && { label: 'BIRD after 40 reviews', detail: 'default setting, learning from the analyst', before: h.learning.start, after: h.learning.after_40, source: h.learning.source },
  ].filter(Boolean);

  return (
    <section id="results" className="border-t border-slate-200 bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm font-medium text-indigo-700">Measured, not claimed</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-5xl">How often is the answer silently wrong?</h2>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Each figure compares the plain AI pipeline with SlayQL on the same generated queries, scored against known answers.
          </p>
        </div>

        {error && <p className="mt-8 text-center text-sm text-slate-500">Results are not available right now.</p>}

        <div className="mt-10 space-y-6">
          <ResultsDumbbell rows={rows} />

          <div className="grid gap-6 lg:grid-cols-2">
            {h.starter_pack && (
              <Card
                title="Approve the meaning once, answer more"
                subtitle="Malaysian distributor questions with the AutoCount starter pack approved"
                source={`${h.starter_pack.source} · ${h.starter_pack.model}`}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Change label="Questions answered" before={h.starter_pack.answered_before} after={h.starter_pack.answered_after} better="higher" />
                  <Change label="Right answers held back" before={h.starter_pack.held_back_before} after={h.starter_pack.held_back_after} />
                  {h.starter_pack.profile_answered !== null && (
                    <Change label="Answered with the data profile" before={h.starter_pack.answered_before} after={h.starter_pack.profile_answered} better="higher" note="real codes and date ranges shown to the model" />
                  )}
                </div>
              </Card>
            )}
            {(loops.trap || loops.distributor_pack) && (
              <Card
                title="With a person in the loop"
                subtitle="A second model plays the person who asked and the analyst, who never sees the answer key"
                source={`Simulated, not observed · ${(loops.trap || loops.distributor_pack).human_model}`}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {loops.trap && (
                    <Change label="Business trap set, ends correct" before={loops.trap.correct_without} after={loops.trap.correct_with} better="higher" note={`a person needed on ${pct(loops.trap.needed_person)}`} />
                  )}
                  {loops.distributor_pack && (
                    <Change label="Distributor + starter pack, ends correct" before={loops.distributor_pack.correct_without} after={loops.distributor_pack.correct_with} better="higher" note={`a person needed on ${pct(loops.distributor_pack.needed_person)}`} />
                  )}
                </div>
                {loops.trap?.clarify_picks !== null && loops.trap?.clarify_picks !== undefined && (
                  <p className="mt-3 text-sm text-slate-600">
                    When a question had two meanings, the simulated user picked the option giving the meaning they intended {pct(loops.trap.clarify_picks, 0)} of the time.
                  </p>
                )}
              </Card>
            )}
          </div>

          {bird && (
            <Card
              title="On a hard public benchmark, it declines to guess"
              subtitle={`BIRD Mini-Dev: 11 unfamiliar databases, asked without hints · ${bird.n} held-out questions`}
              source={`results/bird.json · ${bird.model}`}
            >
              <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                <p className="text-sm text-slate-700">
                  Here the model is usually wrong: {pct(bird.configs.B0.selective_risk)} of its answers are incorrect. SlayQL's confidence ranks
                  answers well (calibration error {bird.ece}) but never reaches 80%, so at the default setting it answers nothing rather than guess.
                  {bird.configs.B3_c1 && ` At a lenient setting it answers ${pct(bird.configs.B3_c1.coverage)} of questions and states a wrong answer as fact on ${pct(bird.configs.B3_c1.silent_error_rate)} of all questions, against ${pct(bird.configs.B0.silent_error_rate)} for the plain pipeline.`}
                </p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bird.risk_coverage} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                      <CartesianGrid vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="coverage" type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: '#64748b' }} label={{ value: 'Share of questions answered', position: 'insideBottom', offset: -10, fontSize: 12 }} />
                      <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={45} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip formatter={(v) => pct(v)} labelFormatter={(v) => `Answering ${pct(v)}`} />
                      {baseRisk !== null && <ReferenceLine y={baseRisk} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Plain pipeline', fontSize: 11, fill: '#64748b', position: 'insideTopRight' }} />}
                      <Line type="monotone" dataKey="risk" name="Wrong among answered" stroke="#4338ca" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          )}

          {summary?.learning && <LearningCard learning={summary.learning} />}

          <p className="text-center text-xs text-slate-400">
            Test sets: business trap set and distributor set written by the team (invented data); BIRD is public. The person in the loop is simulated by
            a second model. Every figure comes from backend/eval/results; details and limits in the project report.
          </p>
        </div>
      </div>
    </section>
  );
}
