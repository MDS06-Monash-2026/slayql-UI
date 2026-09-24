import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Loader2, Send, ShieldQuestion, ThumbsDown, ThumbsUp } from 'lucide-react';
import TrustBadge from '../components/trust/TrustBadge';
import { askArena, fetchEvalSummary, joinArena, subscribeArena, voteArena } from '../services/arena';
import { companyEstimate, outcomesAt, thresholdFor } from '../utils/trustMath';

const STORAGE_KEY = 'slayql_arena_player';

function readCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('code') || '').toUpperCase();
}

function Card({ children }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{children}</div>;
}

function Button({ children, onClick, disabled, tone = 'indigo', className = '' }) {
  const tones = {
    indigo: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    rose: 'bg-rose-600 hover:bg-rose-700 text-white',
    slate: 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors disabled:opacity-50 ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

function JoinForm({ initialCode, onJoined }) {
  const [code, setCode] = useState(initialCode);
  const [nickname, setNickname] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const joined = await joinArena(code.trim().toUpperCase(), nickname, consent);
      onJoined({ code: code.trim().toUpperCase(), ...joined });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Trust or Bust</h1>
      <p className="text-slate-600">Can you spot a wrong number before it reaches the board meeting?</p>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Game code</span>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} required
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-2xl font-bold tracking-widest uppercase" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Nickname (optional, shown on the leaderboard)</span>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={24}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-base" />
      </label>
      <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5" />
        <span>
          Use my anonymous answers in the SlayQL student research study. No name or contact details are stored;
          your nickname is never saved with your answers. You can play without ticking this.
        </span>
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button disabled={busy || code.length < 4} className="w-full" onClick={submit}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Join
      </Button>
    </form>
  );
}

function VoteCard({ state, me, onVote }) {
  const card = state.card;
  const [confidence, setConfidence] = useState(3);
  const voted = me?.vote?.value;
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{state.step.title}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{card.question}</p>
      <p className="mt-3 rounded-xl bg-slate-900 px-4 py-3 text-center font-mono text-2xl font-bold text-white tabular-nums">{card.answer}</p>
      {card.evidence && !state.revealed && (
        <div className="mt-3 space-y-1">
          <TrustBadge outcome={card.evidence.outcome} size="sm" />
          {card.evidence.finding && <p className="text-sm text-slate-600">{card.evidence.finding.title}.</p>}
        </div>
      )}
      {!state.revealed ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Would you put this number in the board pack?</p>
          <div className="grid grid-cols-2 gap-3">
            <Button tone={voted === 'trust' ? 'emerald' : 'slate'} onClick={() => onVote({ value: 'trust', confidence })}>
              <ThumbsUp className="h-5 w-5" /> Trust
            </Button>
            <Button tone={voted === 'bust' ? 'rose' : 'slate'} onClick={() => onVote({ value: 'bust', confidence })}>
              <ThumbsDown className="h-5 w-5" /> Bust
            </Button>
          </div>
          <label className="block text-sm text-slate-600">
            How sure are you? {confidence}/5
            <input type="range" min="1" max="5" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full" />
          </label>
          {voted && <p className="text-sm text-slate-500">Vote recorded. You can change it until the reveal.</p>}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <p className={`text-lg font-bold ${card.correct ? 'text-emerald-700' : 'text-rose-700'}`}>
            {card.correct ? 'This number was right.' : 'This number was wrong.'}
            {voted && ((voted === 'trust') === card.correct ? ' You called it.' : ' It fooled you.')}
          </p>
          <p className="text-sm text-slate-700">{card.explanation}</p>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-700">What SlayQL's checks said:</p>
            <TrustBadge outcome={card.evidence.outcome} size="sm" />
            {card.evidence.finding && <p className="mt-1 text-slate-600">{card.evidence.finding.title}.</p>}
            {card.verifier_miss && <p className="mt-1 font-semibold text-amber-700">SlayQL missed this one too.</p>}
          </div>
        </div>
      )}
    </Card>
  );
}

function PenaltyRound({ state, me, onVote, summary }) {
  const [decision, setDecision] = useState(state.decisions[0]);
  const [penalty, setPenalty] = useState(4);
  const questions = summary?.questions || [];
  const outcome = useMemo(() => (questions.length ? outcomesAt(questions, penalty) : null), [questions, penalty]);
  return (
    <Card>
      <p className="text-lg font-semibold text-slate-900">What is a wrong number worth to you?</p>
      <label className="mt-3 block text-sm font-semibold text-slate-700">A decision your business makes with a number
        <select value={decision} onChange={(e) => setDecision(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3">
          {state.decisions.map((d) => <option key={d}>{d}</option>)}
        </select>
      </label>
      <label className="mt-3 block text-sm text-slate-700">
        A wrong number costs <span className="font-bold">{penalty}×</span> what a right one is worth
        <input type="range" min="1" max="20" value={penalty} onChange={(e) => setPenalty(Number(e.target.value))} className="w-full" />
      </label>
      <p className="mt-2 text-sm text-slate-600">SlayQL would answer only when at least {Math.round(thresholdFor(penalty) * 100)}% confident.</p>
      {outcome && (
        <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          Per 100 questions: SlayQL answers {outcome.slayql.answered} and sends {outcome.slayql.deferred} to an analyst,
          with {outcome.slayql.wrong} wrong. A plain AI tool answers {outcome.plain.answered}, with {outcome.plain.wrong} wrong.
        </p>
      )}
      <Button className="mt-3 w-full" onClick={() => onVote({ decision, penalty })}>
        {me?.vote ? <Check className="h-5 w-5" /> : null} {me?.vote ? 'Update my answer' : 'Submit'}
      </Button>
    </Card>
  );
}

function StumpRound({ me, onAsk }) {
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      await onAsk(question);
      setQuestion('');
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Card>
      <p className="text-lg font-semibold text-slate-900">Stump SlayQL</p>
      <p className="mt-1 text-sm text-slate-600">
        Ask anything about the demo company's sales, customers, stock or support cases, in English or Bahasa Malaysia.
        Find an answer SlayQL is confident about but gets wrong: that is worth 5 points.
      </p>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={300}
        className="mt-3 w-full rounded-xl border border-slate-300 p-3 text-base" placeholder="e.g. Which region has the most delivered shipments?" />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button className="mt-2 w-full" disabled={question.trim().length < 3} onClick={submit}><Send className="h-5 w-5" /> Ask</Button>
      <ul className="mt-4 space-y-3">
        {(me?.stumps || []).map((entry) => (
          <li key={entry.id} className="rounded-xl border border-slate-200 p-3">
            <p className="font-medium text-slate-800">{entry.question}</p>
            {entry.status === 'done' || entry.status === 'failed' ? (
              <div className="mt-1 space-y-1">
                {entry.outcome && <TrustBadge outcome={entry.outcome} size="sm" />}
                {entry.preview && <p className="font-mono text-sm text-slate-700">{entry.preview}</p>}
                <p className="text-sm text-slate-600">{entry.answer}</p>
                {entry.confident_miss && <p className="text-sm font-semibold text-emerald-700">Confirmed confident miss: +5 points!</p>}
              </div>
            ) : (
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking...</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CompanyCalculator({ summary }) {
  const [questionsPerWeek, setQuestionsPerWeek] = useState(20);
  const [minutesPerQuestion, setMinutesPerQuestion] = useState(30);
  if (!summary?.questions?.length) return null;
  const rates = outcomesAt(summary.questions, 4);
  const estimate = companyEstimate({ questionsPerWeek, minutesPerQuestion }, rates);
  return (
    <Card>
      <p className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Calculator className="h-5 w-5" /> Your company</p>
      <label className="mt-3 block text-sm text-slate-700">Data questions a week that need someone else: <b>{questionsPerWeek}</b>
        <input type="range" min="1" max="200" value={questionsPerWeek} onChange={(e) => setQuestionsPerWeek(Number(e.target.value))} className="w-full" />
      </label>
      <label className="mt-2 block text-sm text-slate-700">Minutes each takes that person: <b>{minutesPerQuestion}</b>
        <input type="range" min="5" max="240" step="5" value={minutesPerQuestion} onChange={(e) => setMinutesPerQuestion(Number(e.target.value))} className="w-full" />
      </label>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
        <div className="rounded-xl bg-emerald-50 p-3"><dt className="text-emerald-800">Analyst time released</dt><dd className="text-xl font-bold text-emerald-900">{estimate.analystHoursReleased} hours a month</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-600">Still needing a person</dt><dd className="text-xl font-bold text-slate-800">{estimate.handoffsPerMonth} questions a month</dd></div>
        <div className="rounded-xl bg-sky-50 p-3"><dt className="text-sky-800">Fewer wrong numbers than a plain AI tool</dt><dd className="text-xl font-bold text-sky-900">{estimate.fewerWrongNumbersPerMonth} a month</dd></div>
      </dl>
      <p className="mt-2 text-xs text-slate-500">Your inputs × SlayQL's measured rates on {summary.n} test questions. This is time, not a ringgit saving, and not a promise.</p>
    </Card>
  );
}

function ExitPoll({ state, me, onVote }) {
  const [answers, setAnswers] = useState({});
  return (
    <Card>
      <p className="text-lg font-semibold text-slate-900">Before you go</p>
      {Object.entries(state.exit_questions).map(([key, options]) => (
        <label key={key} className="mt-3 block text-sm font-semibold text-slate-700">
          {{ role: 'Your role', has_numbers_person: 'Does your workplace have "the one person who knows the numbers"?', barrier: 'What would stop you using a tool like SlayQL?' }[key]}
          <select value={answers[key] || ''} onChange={(e) => setAnswers({ ...answers, [key]: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal">
            <option value="" disabled>Choose one</option>
            {options.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
      ))}
      <Button className="mt-4 w-full" disabled={Object.keys(answers).length < 3} onClick={() => onVote(answers)}>
        {me?.vote ? 'Thanks! Update' : 'Submit'}
      </Button>
    </Card>
  );
}

export default function ArenaPlayerView() {
  const [player, setPlayer] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const code = readCodeFromUrl();
      return saved && (!code || saved.code === code) ? saved : null;
    } catch {
      return null;
    }
  });
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [showCalculator, setShowCalculator] = useState(false);

  useEffect(() => {
    fetchEvalSummary().then((data) => setSummary(data.datasets.bird || data.datasets.trap || null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!player) return undefined;
    return subscribeArena(player.code, { token: player.token }, setState, (err) => {
      if (err.status === 404) {
        localStorage.removeItem(STORAGE_KEY);
        setPlayer(null);
      }
    });
  }, [player]);

  const onJoined = (joined) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(joined));
    setPlayer(joined);
  };

  const vote = async (payload) => {
    setError('');
    try {
      await voteArena(player.code, player.token, payload);
    } catch (err) {
      setError(err.message);
    }
  };

  const kind = state?.step?.kind;
  const me = state?.me;
  const definitionVotes = state?.aggregate?.counts || {};

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-md space-y-4">
        {!player ? (
          <Card><JoinForm initialCode={readCodeFromUrl()} onJoined={onJoined} /></Card>
        ) : !state ? (
          <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Connecting...</p>
        ) : (
          <>
            <header className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Game {state.code}</p>
                <p className="font-semibold">{me?.nickname} · {me?.score ?? 0} points</p>
              </div>
              <button type="button" onClick={() => setShowCalculator(!showCalculator)} className="rounded-lg border border-slate-300 bg-white p-2" aria-label="Your company calculator">
                <Calculator className="h-5 w-5" />
              </button>
            </header>
            {showCalculator && <CompanyCalculator summary={summary} />}
            {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

            {kind === 'lobby' && <Card><p className="text-lg font-semibold">You're in!</p><p className="text-slate-600">Watch the big screen. The game starts soon.</p></Card>}

            {kind === 'ab_poll' && (
              <Card>
                <p className="text-lg font-semibold">{state.step.title}</p>
                <div className="mt-3 grid gap-3">
                  <Button tone={me?.vote?.value === 'A' ? 'indigo' : 'slate'} onClick={() => vote({ value: 'A' })}>Tool A: answers every question instantly</Button>
                  <Button tone={me?.vote?.value === 'B' ? 'indigo' : 'slate'} onClick={() => vote({ value: 'B' })}>Tool B: answers most instantly, sends the rest to an analyst</Button>
                </div>
              </Card>
            )}

            {kind === 'card' && state.card && <VoteCard state={state} me={me} onVote={vote} />}
            {kind === 'penalty' && <PenaltyRound state={state} me={me} onVote={vote} summary={summary} />}
            {kind === 'stump' && <StumpRound me={me} onAsk={(q) => askArena(player.code, player.token, q)} />}

            {kind === 'definition' && (
              <Card>
                <p className="text-lg font-semibold">What should "revenue" mean for this company?</p>
                <div className="mt-3 grid gap-3">
                  {state.definitions.map((d) => (
                    <Button key={d.id} tone={me?.vote?.value === d.id ? 'indigo' : 'slate'} onClick={() => vote({ value: d.id })}>
                      {d.label} {definitionVotes[d.id] ? `· ${definitionVotes[d.id]}` : ''}
                    </Button>
                  ))}
                </div>
                {state.approved_definition && (
                  <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800">
                    Approved: {state.approved_definition.label} (version {state.approved_definition.version}). Everyone now gets the same number.
                  </p>
                )}
                {state.reask?.status === 'done' && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <p className="font-semibold">Asked again: "{state.reask.question}"</p>
                    <p className="font-mono text-lg">{state.reask.preview}</p>
                    <TrustBadge outcome={state.reask.outcome} size="sm" approved={(state.reask.definitions_used || []).length > 0} />
                  </div>
                )}
              </Card>
            )}

            {kind === 'results' && (
              <>
                <Card>
                  <p className="text-lg font-semibold">How this room did</p>
                  {['plain', 'evidence'].map((condition) => {
                    const d = state.detection?.[condition];
                    return d && d.caught_rate !== null ? (
                      <p key={condition} className="mt-2 text-sm text-slate-700">
                        {condition === 'plain' ? 'Without SlayQL evidence' : 'With SlayQL evidence'}: caught {Math.round(d.caught_rate * 100)}% of wrong numbers
                        {d.false_alarm_rate !== null ? `, rejected ${Math.round(d.false_alarm_rate * 100)}% of right ones` : ''}.
                      </p>
                    ) : null;
                  })}
                  <p className="mt-2 text-xs text-slate-500">You were in the {me?.condition === 'evidence' ? 'with-evidence' : 'without-evidence'} group.</p>
                </Card>
                <CompanyCalculator summary={summary} />
              </>
            )}

            {kind === 'exit_poll' && <ExitPoll state={state} me={me} onVote={vote} />}

            {kind !== 'lobby' && kind !== 'stump' && (
              <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldQuestion className="h-4 w-4" /> {state.participants} players in this game</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
