import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, EyeOff, ExternalLink, Loader2, Play, RefreshCw, Star } from 'lucide-react';
import TrustBadge from '../components/trust/TrustBadge';
import { arenaExportUrl, createArenaSession, hostArena, subscribeArena } from '../services/arena';

const HOST_KEY = 'slayql_arena_host';

export default function ArenaHostView({ session }) {
  const [game, setGame] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HOST_KEY) || 'null'); } catch { return null; }
  });
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cardCount, setCardCount] = useState(4);

  useEffect(() => {
    if (!game) return undefined;
    return subscribeArena(game.code, { hostToken: game.host_token }, setState, (err) => {
      if (err.status === 404) { localStorage.removeItem(HOST_KEY); setGame(null); }
    });
  }, [game]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const created = await createArenaSession(cardCount);
      localStorage.setItem(HOST_KEY, JSON.stringify(created));
      setGame(created);
    } catch (err) {
      setError(err.status === 401 || err.status === 403 ? 'Sign in with an admin account (for example the reviewer account) to host a game.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (action, extra = {}) => {
    setError('');
    try {
      setState(await hostArena(game.code, game.host_token, action, extra));
    } catch (err) {
      setError(err.message);
    }
  };

  if (!game) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-2xl font-bold">Host Trust or Bust</h1>
          <p className="text-slate-600">Signed in as {session?.user?.email || 'nobody'}. Hosting needs an admin role.</p>
          <label className="block text-sm font-semibold">Answer cards in the stage run
            <input type="number" min="2" max="8" value={cardCount} onChange={(e) => setCardCount(Number(e.target.value))} className="mt-1 w-24 rounded-lg border border-slate-300 px-2 py-1" />
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="button" onClick={create} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Create game
          </button>
        </div>
      </main>
    );
  }

  const step = state?.step;
  const stumps = state?.host?.stumps || [];

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Host console · game {game.code}</h1>
            <p className="text-sm text-slate-600">
              {state?.participants ?? 0} players ({state?.host?.conditions?.plain ?? 0} number-only, {state?.host?.conditions?.evidence ?? 0} with evidence) · {state?.host?.consenting ?? 0} consented to the study
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <a className="inline-flex items-center gap-1 rounded-lg border px-3 py-2" href={`/arena/screen?code=${game.code}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Big screen</a>
            <a className="inline-flex items-center gap-1 rounded-lg border px-3 py-2" href={`/play?code=${game.code}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Player view</a>
            <a className="inline-flex items-center gap-1 rounded-lg border px-3 py-2" href={arenaExportUrl(game.code, game.host_token)}><Download className="h-4 w-4" /> Study CSV</a>
            <button type="button" className="rounded-lg border px-3 py-2" onClick={() => { localStorage.removeItem(HOST_KEY); setGame(null); setState(null); }}>End</button>
          </div>
        </header>

        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        {state && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {state.step_index + 1} of {state.step_count} · {step.kind}</p>
                <p className="text-xl font-semibold">{step.title}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => act('back')} className="rounded-lg border px-3 py-2"><ChevronLeft className="h-5 w-5" /></button>
                {['card', 'ab_poll', 'definition', 'penalty', 'exit_poll'].includes(step.kind) && !state.revealed && (
                  <button type="button" onClick={() => act('reveal')} className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-white">Close voting & reveal</button>
                )}
                <button type="button" onClick={() => act('next')} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">Next <ChevronRight className="h-5 w-5" /></button>
              </div>
            </div>

            {step.kind === 'card' && state.card && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                <p><b>{state.card.question}</b> → <span className="font-mono">{state.card.answer}</span></p>
                <p className="mt-1">Checks: <TrustBadge outcome={state.card.evidence?.outcome} size="sm" /> {state.card.evidence?.finding?.title}</p>
                <p className="mt-1">Votes: {state.aggregate.votes}</p>
              </div>
            )}

            {step.kind === 'definition' && (
              <div className="mt-4 space-y-2 text-sm">
                <p>Votes: {JSON.stringify(state.aggregate.counts || {})}</p>
                <div className="flex flex-wrap gap-2">
                  {state.definitions.map((d) => (
                    <button key={d.id} type="button" onClick={() => act('approve-definition', { definition_id: d.id })} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 font-semibold text-indigo-800">
                      Approve: {d.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => act('reask')} disabled={!state.approved_definition} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-40">
                    <RefreshCw className="h-4 w-4" /> Ask "What is our total revenue?" again
                  </button>
                </div>
                {state.approved_definition && <p>Approved: {state.approved_definition.label} v{state.approved_definition.version}</p>}
                {state.reask && <p>Re-ask: {state.reask.status} {state.reask.preview} {state.reask.outcome}</p>}
              </div>
            )}

            {state.detection && step.kind === 'results' && (
              <pre className="mt-4 overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{JSON.stringify(state.detection, null, 2)}</pre>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Stump questions (moderate before they reach the screen)</h2>
          {stumps.length === 0 ? <p className="mt-2 text-sm text-slate-500">No questions yet.</p> : (
            <ul className="mt-3 divide-y divide-slate-100">
              {stumps.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{entry.question} <span className="text-xs text-slate-500">· {entry.nickname}</span></p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      {entry.status === 'done' ? <TrustBadge outcome={entry.outcome} size="sm" /> : <span className="text-slate-500">{entry.status}</span>}
                      <span className="font-mono">{entry.preview}</span>
                    </div>
                    {entry.answer && <p className="mt-1 text-xs text-slate-500">{entry.answer}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => act(entry.approved_for_screen ? 'hide-stump' : 'show-stump', { entry_id: entry.id })} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-sm">
                      {entry.approved_for_screen ? <><EyeOff className="h-4 w-4" /> Hide</> : <><Eye className="h-4 w-4" /> Show</>}
                    </button>
                    <button type="button" disabled={entry.confident_miss || !['confident', 'caveat'].includes(entry.outcome)} onClick={() => act('confident-miss', { entry_id: entry.id })}
                      title="Only for answers SlayQL was confident about but which are wrong"
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-800 disabled:opacity-40">
                      <Star className="h-4 w-4" /> Confident miss (+5)
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
