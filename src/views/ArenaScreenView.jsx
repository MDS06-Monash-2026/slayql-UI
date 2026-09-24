import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Trophy } from 'lucide-react';
import TrustBadge from '../components/trust/TrustBadge';
import { fetchEvalSummary, subscribeArena } from '../services/arena';
import { outcomesAt, thresholdFor } from '../utils/trustMath';

function useQr(text) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (text) QRCode.toDataURL(text, { margin: 1, width: 512 }).then(setSrc).catch(() => setSrc(''));
  }, [text]);
  return src;
}

function Bar({ label, value, total, tone = 'bg-indigo-500' }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-2xl"><span>{label}</span><span className="font-bold tabular-nums">{value} ({pct}%)</span></div>
      <div className="mt-1 h-5 rounded-full bg-slate-800"><div className={`h-5 rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Headline({ children }) {
  return <h2 className="text-5xl font-bold leading-tight">{children}</h2>;
}

export default function ArenaScreenView() {
  const code = (new URLSearchParams(window.location.search).get('code') || '').toUpperCase();
  const [state, setState] = useState(null);
  const [summary, setSummary] = useState(null);
  const joinUrl = `${window.location.origin}/play?code=${code}`;
  const qr = useQr(code ? joinUrl : '');

  useEffect(() => (code ? subscribeArena(code, {}, setState) : undefined), [code]);
  useEffect(() => {
    fetchEvalSummary().then((data) => setSummary(data.datasets.bird || data.datasets.trap || null)).catch(() => {});
  }, []);

  const penaltyAgg = state?.step?.kind === 'penalty' ? state.aggregate : null;
  const median = penaltyAgg?.median_penalty || 4;
  const penaltyOutcome = useMemo(() => (summary?.questions?.length ? outcomesAt(summary.questions, median) : null), [summary, median]);

  if (!code) return <main className="grid min-h-screen place-items-center bg-slate-950 text-3xl text-white">Open this page with ?code=GAMECODE</main>;
  if (!state) return <main className="grid min-h-screen place-items-center bg-slate-950 text-3xl text-white">Connecting to game {code}...</main>;

  const { step, revealed, aggregate } = state;
  const card = state.card;

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xl font-semibold uppercase tracking-widest text-indigo-300">SlayQL · Trust or Bust</p>
          <p className="text-lg text-slate-400">The AI analyst that knows when it's wrong</p>
        </div>
        {step.kind !== 'lobby' && (
          <div className="flex items-center gap-4 rounded-2xl bg-white p-3 text-slate-900">
            {qr && <img src={qr} alt="QR code to join" className="h-28 w-28" />}
            <div><p className="text-sm">Join at</p><p className="text-lg font-semibold">{window.location.host}/play</p><p className="text-3xl font-bold tracking-widest">{code}</p></div>
          </div>
        )}
      </header>

      <section className="mt-10 grid grid-cols-3 gap-10">
        <div className="col-span-2 space-y-8">
          {step.kind === 'lobby' && (
            <div className="flex items-center gap-12">
              {qr && <img src={qr} alt="QR code to join" className="h-96 w-96 rounded-3xl bg-white p-4" />}
              <div className="space-y-4">
                <Headline>Scan to play</Headline>
                <p className="text-3xl text-slate-300">{window.location.host}/play</p>
                <p className="text-8xl font-black tracking-widest">{code}</p>
                <p className="text-3xl">{state.participants} players joined</p>
              </div>
            </div>
          )}

          {step.kind === 'ab_poll' && (
            <>
              <Headline>{step.title}</Headline>
              <p className="text-3xl text-slate-300">Tool A answers every question instantly. Tool B answers most instantly and sends the rest to an analyst.</p>
              {revealed && aggregate.counts ? (
                <div className="space-y-4">
                  <Bar label="Tool A" value={aggregate.counts.A || 0} total={aggregate.votes} tone="bg-rose-500" />
                  <Bar label="Tool B" value={aggregate.counts.B || 0} total={aggregate.votes} tone="bg-emerald-500" />
                  {summary && (
                    <p className="text-3xl">
                      Measured on {summary.n} test questions: Tool A (a plain AI tool) gave a wrong answer to{' '}
                      <b>{Math.round((summary.configs.B0.silent_error_rate || 0) * 100)}%</b> of questions. Tool B (SlayQL) answered{' '}
                      <b>{Math.round(summary.configs.B3.coverage * 100)}%</b> and gave a wrong answer to{' '}
                      <b>{Math.round(summary.configs.B3.silent_error_rate * 100)}%</b>.
                    </p>
                  )}
                </div>
              ) : <p className="text-4xl">{aggregate.votes} votes so far</p>}
            </>
          )}

          {step.kind === 'card' && card && (
            <>
              <p className="text-2xl uppercase tracking-wide text-slate-400">{step.title}</p>
              <Headline>{card.question}</Headline>
              <p className="inline-block rounded-3xl bg-white px-10 py-6 font-mono text-7xl font-black text-slate-900 tabular-nums">{card.answer}</p>
              <p className="text-3xl">Would you put this number in the board pack?</p>
              {revealed ? (
                <div className="space-y-6">
                  <p className={`text-5xl font-bold ${card.correct ? 'text-emerald-400' : 'text-rose-400'}`}>{card.correct ? 'Right number' : 'Wrong number'}</p>
                  <p className="text-3xl text-slate-200">{card.explanation}</p>
                  <div className="flex items-center gap-4 text-2xl">SlayQL's checks: <TrustBadge outcome={card.evidence.outcome} isDark />
                    {card.evidence.finding && <span className="text-slate-300">{card.evidence.finding.title}</span>}
                  </div>
                  {['plain', 'evidence'].map((condition) => {
                    const votes = aggregate.by_condition?.[condition] || { trust: 0, bust: 0 };
                    const total = votes.trust + votes.bust;
                    return (
                      <div key={condition}>
                        <p className="text-2xl text-slate-400">{condition === 'plain' ? 'Players who saw only the number' : 'Players who saw SlayQL\'s checks'}</p>
                        <Bar label="Trusted it" value={votes.trust} total={total} tone={card.correct ? 'bg-emerald-500' : 'bg-rose-500'} />
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-4xl">{aggregate.votes} of {state.participants} voted</p>}
            </>
          )}

          {step.kind === 'penalty' && (
            <>
              <Headline>What is a wrong number worth to you?</Headline>
              <p className="text-3xl">Room median: a wrong number costs <b>{median}×</b> a right one, so SlayQL answers only above <b>{Math.round(thresholdFor(median) * 100)}%</b> confidence.</p>
              {penaltyOutcome && (
                <div className="grid grid-cols-2 gap-8">
                  <div className="rounded-3xl bg-slate-900 p-8"><p className="text-2xl text-slate-400">Plain AI tool, per 100 questions</p><p className="text-7xl font-black text-rose-400">{penaltyOutcome.plain.wrong}</p><p className="text-2xl">wrong numbers</p></div>
                  <div className="rounded-3xl bg-slate-900 p-8"><p className="text-2xl text-slate-400">SlayQL, per 100 questions</p><p className="text-7xl font-black text-emerald-400">{penaltyOutcome.slayql.wrong}</p><p className="text-2xl">wrong numbers · {penaltyOutcome.slayql.deferred} sent to an analyst</p></div>
                </div>
              )}
              {penaltyAgg?.by_decision && Object.keys(penaltyAgg.by_decision).length > 0 && (
                <ul className="text-2xl text-slate-300">
                  {Object.entries(penaltyAgg.by_decision).map(([decision, value]) => <li key={decision}>{decision}: {value}×</li>)}
                </ul>
              )}
              <p className="text-xl text-slate-500">{penaltyAgg?.votes || 0} answers · computed from SlayQL's measured results on {summary?.n || 0} test questions</p>
            </>
          )}

          {step.kind === 'stump' && (
            <>
              <Headline>Stump SlayQL</Headline>
              <p className="text-3xl text-slate-300">Ask on your phone. A confirmed confident mistake is worth 5 points.</p>
              <ul className="space-y-4">
                {state.wall.map((entry) => (
                  <li key={entry.id} className="rounded-2xl bg-slate-900 p-5">
                    <p className="text-2xl font-semibold">{entry.question}</p>
                    <div className="mt-2 flex items-center gap-3 text-xl">
                      {entry.outcome && <TrustBadge outcome={entry.outcome} isDark />}
                      <span className="font-mono">{entry.preview}</span>
                      {entry.confident_miss && <span className="font-bold text-amber-300">Confident miss!</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {step.kind === 'definition' && (
            <>
              <Headline>Agree what "revenue" means</Headline>
              <div className="space-y-4">
                {state.definitions.map((d) => (
                  <Bar key={d.id} label={d.label} value={aggregate.counts?.[d.id] || 0} total={aggregate.votes} />
                ))}
              </div>
              {state.approved_definition && <p className="text-3xl text-indigo-300">Approved: {state.approved_definition.label} (version {state.approved_definition.version})</p>}
              {state.reask?.status === 'done' && (
                <div className="rounded-3xl bg-slate-900 p-8">
                  <p className="text-2xl text-slate-400">Asked again: "{state.reask.question}"</p>
                  <p className="font-mono text-6xl font-black">{state.reask.preview}</p>
                  <TrustBadge outcome={state.reask.outcome} approved={(state.reask.definitions_used || []).length > 0} isDark />
                </div>
              )}
              {state.reask?.status === 'running' && <p className="text-3xl">Asking again...</p>}
            </>
          )}

          {step.kind === 'results' && (
            <>
              <Headline>What we measured today</Headline>
              <div className="grid grid-cols-2 gap-8">
                {['plain', 'evidence'].map((condition) => {
                  const d = state.detection?.[condition];
                  return (
                    <div key={condition} className="rounded-3xl bg-slate-900 p-8">
                      <p className="text-2xl text-slate-400">{condition === 'plain' ? 'Number only' : 'With SlayQL evidence'}</p>
                      <p className="text-7xl font-black">{d?.caught_rate !== null && d?.caught_rate !== undefined ? `${Math.round(d.caught_rate * 100)}%` : 'n/a'}</p>
                      <p className="text-2xl">of wrong numbers caught ({d?.wrong_answers_seen || 0} votes)</p>
                      {d?.false_alarm_rate !== null && d?.false_alarm_rate !== undefined && <p className="text-xl text-slate-400">{Math.round(d.false_alarm_rate * 100)}% of right numbers rejected</p>}
                    </div>
                  );
                })}
              </div>
              {summary && (
                <p className="text-2xl text-slate-300">
                  Benchmark ({summary.n} held-out questions, {summary.model}): silent wrong answers fell from{' '}
                  {Math.round(summary.configs.B0.silent_error_rate * 100)}% to {Math.round(summary.configs.B3.silent_error_rate * 100)}%,
                  answering {Math.round(summary.configs.B3.coverage * 100)}% of questions immediately.
                </p>
              )}
              <p className="text-xl text-slate-500">Small live sample; results are indicative, not conclusive.</p>
            </>
          )}

          {step.kind === 'exit_poll' && (
            <>
              <Headline>Before you go</Headline>
              {Object.entries(aggregate.tallies || {}).map(([key, tally]) => {
                const total = Object.values(tally).reduce((a, b) => a + b, 0);
                return (
                  <div key={key} className="space-y-2">
                    <p className="text-2xl text-slate-400">{{ role: 'Role', has_numbers_person: 'Has "the one person who knows the numbers"', barrier: 'Biggest barrier' }[key]}</p>
                    {Object.entries(tally).map(([answer, count]) => <Bar key={answer} label={answer} value={count} total={total} />)}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <aside className="space-y-4">
          <p className="flex items-center gap-2 text-2xl font-semibold"><Trophy className="h-7 w-7 text-amber-300" /> Leaderboard</p>
          <ol className="space-y-2 text-2xl">
            {state.leaderboard.map((row, index) => (
              <li key={`${row.nickname}-${index}`} className="flex justify-between rounded-xl bg-slate-900 px-4 py-2">
                <span>{index + 1}. {row.nickname}</span><span className="font-bold tabular-nums">{row.score}</span>
              </li>
            ))}
          </ol>
          <p className="text-xl text-slate-400">{state.participants} players · step {state.step_index + 1} of {state.step_count}</p>
        </aside>
      </section>
    </main>
  );
}
