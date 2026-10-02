import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertOctagon, AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronDown, Flag, HelpCircle, Info, Loader2, Pencil, Play, UserCheck, X,
} from 'lucide-react';
import AnalystNav from '../components/trust/AnalystNav';
import LearningPanel from '../components/trust/LearningPanel';
import { executeCustomSql, fetchCalibration, fetchConnections, fetchReviewItems, resolveReviewItem } from '../services/api';
import { getClientCache } from '../services/clientCache';

// Results already run in this session, so switching between items is instant.
const RESULT_CACHE = new Map();

// The review queue as an inbox: what is waiting on the left, one decision at a time on the
// right. The analyst sees why the question came here and what the SQL actually returns
// before deciding, and moves to the next item automatically.

const SOURCE = {
  handoff: { label: 'Sent by SlayQL', why: 'SlayQL was not confident enough to state a figure.', Icon: UserCheck, tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  clarify: { label: 'Two meanings', why: 'The question could mean different things with different numbers.', Icon: HelpCircle, tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300' },
  flag: { label: 'Flagged by a user', why: 'Someone doubted a number SlayQL gave.', Icon: Flag, tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
};
const SEVERITY = {
  blocking: { Icon: AlertOctagon, tone: 'text-rose-600 dark:text-rose-400' },
  ambiguity: { Icon: HelpCircle, tone: 'text-sky-600 dark:text-sky-400' },
  warning: { Icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400' },
  info: { Icon: Info, tone: 'text-slate-500' },
};
const FILTERS = [
  { id: 'open', label: 'To review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
];

function timeAgo(iso) {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

const cell = (v) => (v === null || v === undefined ? '–' : typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v));

function ResultPreview({ sql, connectionId }) {
  const key = `${connectionId}|${sql}`;
  const [state, setState] = useState(() => RESULT_CACHE.get(key) || { loading: false, result: null, error: '' });
  const run = useCallback(async (force = false) => {
    if (!force && RESULT_CACHE.has(key)) { setState(RESULT_CACHE.get(key)); return; }
    setState({ loading: true, result: null, error: '' });
    try {
      const res = await executeCustomSql('review', sql, connectionId);
      const next = { loading: false, result: res.result, error: res.result?.error || '' };
      RESULT_CACHE.set(key, next);
      setState(next);
    } catch (err) {
      setState({ loading: false, result: null, error: err.message });
    }
  }, [key, sql, connectionId]);
  useEffect(() => { if (sql) run(); }, [sql, run]);

  if (!sql) return null;
  const r = state.result;
  return (
    <div className="stage-fill rounded-2xl">
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Live result, read-only</p>
        <button type="button" onClick={() => run(true)} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300">
          <Play className="h-3 w-3" aria-hidden="true" /> Run again
        </button>
      </div>
      <div className="border-t border-indigo-100/80 px-4 py-3 dark:border-slate-800">
        {state.loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Running read-only...</p>
        ) : state.error ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>
        ) : r && r.rows?.length === 1 && r.columns?.length <= 3 ? (
          <dl className="flex flex-wrap gap-6">
            {r.columns.map((c, i) => (
              <div key={c}>
                <dt className="text-xs text-slate-500">{c.replace(/_/g, ' ')}</dt>
                <dd className={typeof r.rows[0][i] === 'number' ? 'text-2xl font-semibold tabular-nums text-slate-950 dark:text-white' : 'text-sm text-slate-800 dark:text-slate-200'}>{cell(r.rows[0][i])}</dd>
              </div>
            ))}
          </dl>
        ) : r ? (
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500"><tr>{r.columns.map((c) => <th key={c} className="pb-1.5 pr-4 font-medium">{c}</th>)}</tr></thead>
              <tbody className="text-slate-800 dark:text-slate-200">
                {r.rows.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">{row.map((v, j) => <td key={j} className="py-1 pr-4 tabular-nums">{cell(v)}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {r.rows.length > 10 && <p className="mt-1.5 text-xs text-slate-500">Showing 10 of {r.rows.length} rows</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Detail({ item, onResolved, onBack }) {
  const [mode, setMode] = useState(null);
  const [correctedSql, setCorrectedSql] = useState(item.sql || '');
  const [note, setNote] = useState('');
  const [saveVerified, setSaveVerified] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showSql, setShowSql] = useState(false);
  const v = item.verification || {};
  const findings = v.findings || [];
  const source = SOURCE[item.source] || SOURCE.handoff;
  const open = item.status === 'open';
  // When the checks show the SQL never read data, the honest decision is "can't be answered".
  const unanswerable = findings.some((f) => /does not read any data|has nothing about/i.test(f.title || '')) || (findings.some((f) => f.check === 'coverage' && f.severity === 'blocking'));

  useEffect(() => { setMode(null); setCorrectedSql(item.sql || ''); setNote(''); setError(''); setShowSql(false); }, [item.id, item.sql]);

  const resolve = async (resolution) => {
    setBusy(resolution);
    setError('');
    try {
      await resolveReviewItem(item.id, {
        resolution,
        note,
        correctedSql: resolution === 'corrected' ? correctedSql : null,
        saveVerifiedQuery: resolution !== 'dismissed' && saveVerified,
      });
      onResolved(item.id, resolution);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <article className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="review-question px-5 pb-5 pt-5 sm:px-7">
        <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 lg:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All items
        </button>
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${source.tone}`}>
              <source.Icon className="h-3 w-3" aria-hidden="true" /> {source.label}
            </span>
            <span className="text-slate-500">{timeAgo(item.created_at)}</span>
            {typeof v.probability === 'number' && <span className="text-slate-500">Confidence {Math.round(v.probability * 100)}%</span>}
          </div>
          <h2 className="mt-2.5 text-2xl font-semibold leading-snug tracking-tight text-slate-950 dark:text-white">{item.question}</h2>
          {item.note && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">“{item.note}”</p>}
        </div>
        </div>
        <div className="space-y-6 px-5 pb-6 sm:px-7">

        <section>
          <h3 className="flex items-center text-sm font-semibold text-slate-900 dark:text-slate-100"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-[11px] font-semibold text-white">1</span>Why it came to you</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{source.why}</p>
          {findings.length > 0 && (
            <ul className="mt-2.5 space-y-2">
              {findings.map((f, i) => {
                const sev = SEVERITY[f.severity] || SEVERITY.info;
                return (
                  <li key={i} className="flex gap-2 text-sm">
                    <sev.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${sev.tone}`} aria-hidden="true" />
                    <span className="text-slate-700 dark:text-slate-300"><b className="font-medium text-slate-900 dark:text-slate-100">{f.title}.</b> {f.detail}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {(v.clarify_options || []).length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">The meanings SlayQL found</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {v.clarify_options.map((o) => (
                <div key={o.label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-sm text-slate-700 dark:text-slate-300">{o.label}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-950 dark:text-white">{o.preview}</p>
                  {open && o.sql && (
                    <button type="button" onClick={() => { setMode('correct'); setCorrectedSql(o.sql); }} className="mt-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300">
                      Use this meaning
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {open && unanswerable && (
          <p className="flex gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 text-sm text-indigo-900 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Suggested: the data does not seem to hold this. Mark it "Can't be answered", or fix the SQL if it does.
          </p>
        )}

        {item.sql && (
          <section>
            <h3 className="mb-2 flex items-center text-sm font-semibold text-slate-900 dark:text-slate-100"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-[11px] font-semibold text-white">2</span>{mode === 'correct' ? 'What your corrected SQL returns' : 'What the SQL returns'}</h3>
            <ResultPreview sql={mode === 'correct' ? correctedSql : item.sql} connectionId={item.connection_id} />
          </section>
        )}

        {item.sql && (
          <section>
            {mode === 'correct' ? (
              <>
                <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Corrected SQL</h3>
                <textarea
                  value={correctedSql}
                  onChange={(e) => setCorrectedSql(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700"
                />
              </>
            ) : (
              <>
                <button type="button" onClick={() => setShowSql((s) => !s)} className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <ChevronDown className={`h-4 w-4 transition-transform ${showSql ? 'rotate-180' : ''}`} aria-hidden="true" /> {showSql ? 'Hide' : 'Show'} the SQL SlayQL wrote
                </button>
                {showSql && <pre className="mt-2 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{item.sql}</pre>}
              </>
            )}
          </section>
        )}

        {!open && (
          <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            {item.resolution} by {item.reviewed_by || 'an analyst'}{item.resolution_note ? `: ${item.resolution_note}` : ''}
          </p>
        )}
        </div>
      </div>

      {open && (
        <footer className="space-y-3 border-t border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-4 dark:border-slate-800 dark:from-[#121622] dark:to-[#0f131d] sm:px-7">
          <p className="flex items-center text-sm font-semibold text-slate-900 dark:text-slate-100"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-[11px] font-semibold text-white">3</span>Your decision</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the person who asked (optional)"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-400" title="Next time this exact question is asked, SlayQL uses this SQL directly">
              <input type="checkbox" checked={saveVerified} onChange={(e) => setSaveVerified(e.target.checked)} className="accent-indigo-600" />
              Reuse for this question next time
            </label>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {mode === 'correct' ? (
              <>
                <button type="button" disabled={!!busy || !correctedSql.trim()} onClick={() => resolve('corrected')} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.8)] transition hover:brightness-110 disabled:opacity-50">
                  {busy === 'corrected' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Send corrected answer
                </button>
                <button type="button" onClick={() => { setMode(null); setCorrectedSql(item.sql || ''); }} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
              </>
            ) : (
              <>
                <button type="button" disabled={!!busy || !item.sql} onClick={() => resolve('confirmed')} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${unanswerable ? 'border border-slate-300 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800' : 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-[0_10px_24px_-12px_rgba(5,150,105,0.8)] hover:brightness-110'}`}>
                  {busy === 'confirmed' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Answer is right
                </button>
                <button type="button" disabled={!!busy || !item.sql} onClick={() => setMode('correct')} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Fix the SQL
                </button>
              </>
            )}
            <button type="button" disabled={!!busy} onClick={() => resolve('dismissed')} title="The data cannot answer this question" className={`ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition ${unanswerable && mode !== 'correct' ? 'bg-slate-900 font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900' : 'font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}>
              {busy === 'dismissed' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />} Can't be answered
            </button>
          </div>
        </footer>
      )}
    </article>
  );
}

export default function ReviewQueueView({ setView, session }) {
  const [status, setStatus] = useState('open');
  // Open from the last-known queue straight away; the network refresh replaces it quietly.
  const [items, setItems] = useState(() => getClientCache('review-items:open', 24 * 3600 * 1000) || []);
  const [selectedId, setSelectedId] = useState(() => (getClientCache('review-items:open', 24 * 3600 * 1000) || [])[0]?.id || null);
  const [loading, setLoading] = useState(() => !getClientCache('review-items:open', 24 * 3600 * 1000));
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showDetailOnMobile, setShowDetailOnMobile] = useState(false);
  const [connections, setConnections] = useState([]);
  const [connectionId, setConnectionId] = useState('');
  const [calibration, setCalibration] = useState(null);
  const [showLearning, setShowLearning] = useState(false);

  const load = useCallback(async () => {
    const cached = getClientCache(`review-items:${status}`, 24 * 3600 * 1000);
    if (cached) {
      setItems(cached);
      setSelectedId((cur) => (cached.some((i) => i.id === cur) ? cur : cached[0]?.id || null));
    }
    setLoading(!cached);
    setError('');
    try {
      const list = await fetchReviewItems(status, { force: true });
      setItems(list);
      setSelectedId((cur) => (list.some((i) => i.id === cur) ? cur : list[0]?.id || null));
    } catch (err) {
      setError(err.status === 401 || err.status === 403 ? 'The review queue needs the analyst or owner role. Ask an owner of your organisation.' : err.message);
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchConnections().then((list) => {
      setConnections(list);
      setConnectionId((current) => current || (list.find((c) => c.is_default) || list[0])?.id || '');
    }).catch(() => {});
  }, []);
  const loadCalibration = useCallback(() => {
    if (!connectionId) return;
    fetchCalibration(connectionId).then(setCalibration).catch(() => setCalibration(null));
    // (cached for five minutes; resolving an item clears it)
  }, [connectionId]);
  useEffect(() => { loadCalibration(); }, [loadCalibration]);

  const selected = items.find((i) => i.id === selectedId) || null;
  const openCount = status === 'open' ? items.length : undefined;

  const handleResolved = (id, resolution) => {
    // Move to the next item straight away; the list refreshes in the background.
    const index = items.findIndex((i) => i.id === id);
    const rest = items.filter((i) => i.id !== id);
    setItems(rest);
    setSelectedId(rest[Math.min(index, rest.length - 1)]?.id || null);
    const word = { confirmed: 'Confirmed', corrected: 'Corrected answer sent', dismissed: 'Marked as not answerable' }[resolution] || 'Done';
    setToast(`${word}. ${rest.length ? `${rest.length} left` : 'All caught up'}`);
    setTimeout(() => setToast(''), 2600);
    loadCalibration();
  };

  const counts = { open: status === 'open' ? items.length : null };

  return (
    <main className="review-page flex h-screen flex-col dark:bg-[#0b0e16]">
      <AnalystNav current="review" setView={setView} session={session} openCount={openCount} />

      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6">
        {/* hero: what this page is for, and where things stand */}
        <section className={`review-hero relative mb-4 overflow-hidden rounded-3xl border border-indigo-100/80 px-5 py-4 sm:px-7 sm:py-5 dark:border-indigo-500/20 ${showDetailOnMobile ? 'hidden lg:block' : ''}`}>
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Review queue</h1>
              <p className="mt-1 hidden max-w-xl text-sm text-slate-600 dark:text-slate-300 sm:block">
                Questions SlayQL was not sure about, or that someone flagged. Check the answer, decide, and the person who asked is told.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: 'Waiting', value: status === 'open' ? items.length : '–', accent: true },
                { label: 'Reviewed so far', value: calibration ? calibration.labels : '–' },
                { label: 'Answers right', value: calibration && calibration.correct + calibration.wrong ? `${Math.round((calibration.correct / (calibration.correct + calibration.wrong)) * 100)}%` : '–' },
              ].map((stat) => (
                <div key={stat.label} className="min-w-[96px] rounded-2xl bg-white/80 px-3.5 py-2.5 shadow-[0_10px_30px_-20px_rgba(67,56,202,0.6)] ring-1 ring-white backdrop-blur dark:bg-white/5 dark:ring-white/10">
                  <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{stat.label}</dt>
                  <dd className={`text-2xl font-semibold tabular-nums ${stat.accent ? 'bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-300 dark:to-violet-300' : 'text-slate-950 dark:text-white'}`}>{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {!error && calibration && (
            <div className="relative mt-4">
              <button type="button" onClick={() => setShowLearning((v) => !v)} aria-expanded={showLearning} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showLearning ? 'rotate-180' : ''}`} aria-hidden="true" />
                {showLearning ? 'Hide what SlayQL has learned' : 'What SlayQL has learned from your reviews'}
              </button>
              {showLearning && (
                <div className="mt-3">
                  <LearningPanel status={calibration} connections={connections} connectionId={connectionId} onConnectionChange={setConnectionId} />
                </div>
              )}
            </div>
          )}
        </section>

        {error ? (
          <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_30px_80px_-50px_rgba(49,46,129,0.45)] dark:border-slate-800 dark:bg-[#121622]">
            {/* inbox list */}
            <section className={`flex w-full flex-col border-r border-slate-200 dark:border-slate-800 lg:w-[360px] lg:shrink-0 ${showDetailOnMobile ? 'hidden lg:flex' : 'flex'}`} aria-label="Review items">
              <div className="flex items-center gap-1 border-b border-slate-200 p-2 dark:border-slate-800" role="tablist">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={status === f.id}
                    onClick={() => setStatus(f.id)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition ${status === f.id ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                  >
                    {f.label}
                    {f.id === 'open' && counts.open ? <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">{counts.open}</span> : null}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="space-y-2 p-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-16 rounded-xl" />)}</div>
                ) : items.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
                    <p className="mt-3 font-medium text-slate-900 dark:text-slate-100">{status === 'open' ? 'All caught up' : 'Nothing here yet'}</p>
                    <p className="mt-1 text-sm text-slate-500">{status === 'open' ? 'New questions appear here when SlayQL is unsure or someone flags a number.' : 'Decisions you make will be listed here.'}</p>
                    {status === 'open' && (
                      <button type="button" onClick={() => setView('demo')} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Back to chat</button>
                    )}
                  </div>
                ) : (
                  <ul>
                    {items.map((item) => {
                      const s = SOURCE[item.source] || SOURCE.handoff;
                      const on = item.id === selectedId;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => { setSelectedId(item.id); setShowDetailOnMobile(true); }}
                            aria-current={on ? 'true' : undefined}
                            className={`relative flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition dark:border-slate-800/80 ${on ? 'bg-gradient-to-r from-indigo-50 via-violet-50/60 to-transparent dark:from-indigo-500/15 dark:via-violet-500/5' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                          >
                            {on && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-gradient-to-b from-indigo-600 via-violet-500 to-sky-400" />}
                            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.tone}`}><s.Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">{item.question}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">{s.label} · {timeAgo(item.created_at)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* decision */}
            <section className={`min-w-0 flex-1 ${showDetailOnMobile ? 'block' : 'hidden lg:block'}`}>
              {selected ? (
                <Detail item={selected} onResolved={handleResolved} onBack={() => setShowDetailOnMobile(false)} />
              ) : !loading && (
                <div className="flex h-full items-center justify-center p-8 text-sm text-slate-500">Select an item to review it.</div>
              )}
            </section>
          </div>
        )}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg slide-in-up">
          {toast}
        </div>
      )}
    </main>
  );
}
