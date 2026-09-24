import React, { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchEvalSummary } from '../services/arena';

const pct = (value) => (value === null || value === undefined ? 'n/a' : `${Math.round(value * 1000) / 10}%`);

function Stat({ label, before, after, better = 'lower' }) {
  const improved = better === 'lower' ? after < before : after > before;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-sm text-slate-400 line-through decoration-slate-300">{pct(before)}</span>
        <span className={`text-2xl font-bold ${improved ? 'text-emerald-700' : 'text-slate-900'}`}>{pct(after)}</span>
      </p>
    </div>
  );
}

function DatasetCard({ title, subtitle, data, note }) {
  const b0 = data.configs.B0;
  const b3 = data.configs.B3;
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500">{subtitle} · {data.n} held-out questions</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Wrong answers given as fact" before={b0.silent_error_rate} after={b3.silent_error_rate} />
        <Stat label="Questions answered immediately" before={b0.coverage} after={b3.coverage} better="higher" />
        <Stat label="Right answers wrongly withheld" before={0} after={b3.false_alarm_rate ?? 0} />
      </div>
      <p className="mt-3 text-sm text-slate-600">{note}</p>
    </div>
  );
}

export default function TrustResultsSection() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEvalSummary().then(setSummary).catch((err) => setError(err.message));
  }, []);

  const trap = summary?.datasets?.trap;
  const bird = summary?.datasets?.bird;
  const baseRisk = bird ? bird.configs.B0.selective_risk : null;
  const top20 = bird?.risk_coverage?.find((point) => point.coverage >= 0.2);

  return (
    <section id="results" className="border-t border-slate-200 bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Measured, not claimed</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How often is the answer silently wrong?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-500">
            Each figure compares the plain pipeline with SlayQL's trust layer on the same generated queries, scored against known answers.
          </p>
        </div>

        {error && <p className="mt-8 text-center text-sm text-slate-500">Results are not available right now.</p>}

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {trap && (
            <DatasetCard
              title="Business trap set"
              subtitle="Our questions on the demo company: double counting, cancelled orders, dates, Bahasa Malaysia"
              data={trap}
              note="Draft set written by the team; results will be re-run after independent review. The remaining wrong answer is a question the data cannot answer, which SlayQL does not yet detect."
            />
          )}
          {bird && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-bold text-slate-900">BIRD Mini-Dev (public benchmark)</h3>
              <p className="text-sm text-slate-500">Hard questions on 11 unfamiliar databases, asked without hints · {bird.n} held-out questions</p>
              <p className="mt-3 text-sm text-slate-700">
                Here the model is usually wrong: {pct(bird.configs.B0.selective_risk)} of its answers are incorrect.
                SlayQL's confidence ranks answers well (calibration error {bird.ece}), but never reaches 80%, so at the default setting it answers nothing rather than guess.
                {top20 && ` Its most confident 20% of answers are wrong ${pct(top20.risk)} of the time.`}
              </p>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bird.risk_coverage} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="coverage" type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} label={{ value: 'Share of questions answered', position: 'insideBottom', offset: -10, fontSize: 12 }} />
                    <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={45} />
                    <Tooltip formatter={(v) => pct(v)} labelFormatter={(v) => `Answering ${pct(v)}`} />
                    {baseRisk !== null && <ReferenceLine y={baseRisk} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: 'Plain pipeline', fontSize: 11, fill: '#f43f5e', position: 'insideTopRight' }} />}
                    <Line type="monotone" dataKey="risk" name="Wrong among answered" stroke="#4f46e5" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Earlier result, reported honestly</p>
          <p className="mt-1">
            SlayQL's earlier schema-retrieval pipeline scored 72/178 (40.45%) on Spider 2.0-Lite against 71/178 for the AutoLink baseline:
            16 questions improved and 15 got worse, so no meaningful difference. Improving accuracy alone was not enough, which is why this project
            focuses on knowing when an answer should not be trusted.
          </p>
        </div>

        {(trap || bird) && (
          <p className="mt-4 text-center text-xs text-slate-400">
            Model {(bird || trap).model} · commit {(bird || trap).commit} · evaluated {new Date((bird || trap).evaluated_at).toLocaleDateString()} · source: backend/eval/results
          </p>
        )}
      </div>
    </section>
  );
}
