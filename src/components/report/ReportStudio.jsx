import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  Download,
  History,
  LifeBuoy,
  Loader2,
  MoreHorizontal,
  Newspaper,
  Package,
  Play,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  X,
} from 'lucide-react';
import {
  deleteSavedReports,
  fetchReportTemplates,
  fetchSavedReport,
  fetchSavedReports,
  refreshReport,
  runReportTemplate,
  saveReportToServer,
  streamReport,
  streamReportFollowUp,
} from '../../services/api';
import ReportCanvas from './ReportCanvas';
import ScheduleEmail from './ScheduleEmail';
import PastQuestionsPicker from './PastQuestionsPicker';
import ReportHistory from './ReportHistory';
import ReportHistoryRail from './ReportHistoryRail';
import { AgentTimeline, ReportCopilot, StageRail } from './ReportAgentPanel';

const STARTERS = [
  { Icon: TrendingUp, title: 'Sales performance', text: 'How are sales, orders and average order value moving, and which customers and products drive them?' },
  { Icon: Truck, title: 'Operations and delivery', text: 'How are shipments, carriers and delivery problems performing?' },
  { Icon: Users, title: 'Customers', text: 'Which customer segments and cities are growing, and who are our most valuable customers?' },
  { Icon: LifeBuoy, title: 'Refunds and support', text: 'Where are we losing money: refunds, cancellations and support cases?' },
];

// Reports used to be saved in the browser only; they are moved to the server once.
const legacyStorageKey = (connectionId) => `slayql:trusted-reports:${connectionId}`;
const migrations = new Map();

async function migrateLegacy(connectionId) {
  let legacy = [];
  try {
    legacy = JSON.parse(localStorage.getItem(legacyStorageKey(connectionId)) || '[]');
  } catch {
    legacy = [];
  }
  if (!Array.isArray(legacy) || !legacy.length) return;
  localStorage.removeItem(legacyStorageKey(connectionId));
  try {
    for (const entry of [...legacy].reverse()) {
      if (entry?.report) await saveReportToServer(connectionId, entry.report);
    }
  } catch (err) {
    localStorage.setItem(legacyStorageKey(connectionId), JSON.stringify(legacy));
    throw err;
  }
}

async function loadSaved(connectionId) {
  if (!migrations.has(connectionId)) migrations.set(connectionId, migrateLegacy(connectionId).catch(() => migrations.delete(connectionId)));
  await migrations.get(connectionId);
  return fetchSavedReports(connectionId);
}

// A recorded build for demos (see public/demo/report-replay.json), replayed in about 5 s.
const REPLAY_URL = '/demo/report-replay.json';
const REPLAY_CONNECTION = 'sqlite_demo';
// Three acts: the agent explores (0-8.5 s), the dashboard fills top to bottom (8.5-18 s), the summary (18-20 s).
const REPLAY_TOTAL_MS = 20000;
const REPLAY_PLAN_MS = 8500;
const REPLAY_FILL_END_MS = 17600;
const REPLAY_FINDINGS_MS = 18400;

function questionsText(questions) {
  if (!questions.length) return '';
  return `\n\nAlso include these questions I asked before, as figures:\n${questions.map((q) => `- ${q.question} (SQL: ${q.sql})`).join('\n')}`;
}

function SkeletonDashboard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#f4f6fb] dark:border-slate-800 dark:bg-[#0b0e16]" aria-hidden="true">
      <div className="h-28 bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4338ca] p-5">
        <div className="h-3 w-40 rounded bg-white/20" />
        <div className="mt-3 h-6 w-72 rounded bg-white/25" />
        <div className="mt-2 h-3 w-96 max-w-full rounded bg-white/15" />
      </div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-32 rounded-2xl" />)}</div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="skel h-72 rounded-2xl lg:col-span-2" />
          <div className="skel h-72 rounded-2xl" />
          {[0, 1, 2].map((i) => <div key={i} className="skel h-64 rounded-2xl" />)}
        </div>
      </div>
    </div>
  );
}

export default function ReportStudio({ connectionId, isDark = false, onDirtyChange, onRegisterSave }) {
  const [question, setQuestion] = useState('');
  const [grain, setGrain] = useState('week');
  const [seeded, setSeeded] = useState([]);
  const [report, setReport] = useState(null);
  const [view, setView] = useState({});
  const [stage, setStage] = useState(null);
  const [steps, setSteps] = useState([]);
  const [clarify, setClarify] = useState(null);
  const [history, setHistory] = useState([]);
  const [building, setBuilding] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState([]);
  const [savedId, setSavedId] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [replayed, setReplayed] = useState(false);
  const replayTimers = useRef([]);
  const savedIdRef = useRef(null);
  const [templates, setTemplates] = useState([]);
  const [automate, setAutomate] = useState(false);
  const [picker, setPicker] = useState(null);
  const [copilot, setCopilot] = useState(false);
  const [chat, setChat] = useState([]);
  const [chatSteps, setChatSteps] = useState([]);
  const [chatting, setChatting] = useState(false);
  const [draft, setDraft] = useState('');
  const abortRef = useRef(null);

  useEffect(() => { savedIdRef.current = savedId; }, [savedId]);

  useEffect(() => {
    setSaved([]);
    setHistoryLoading(true);
    if (connectionId) loadSaved(connectionId).then(setSaved).catch(() => {}).finally(() => setHistoryLoading(false));
    setReport(null);
    setSavedId(null);
    setSavedSnapshot('');
    setTemplates([]);
    if (connectionId) fetchReportTemplates(connectionId).then(setTemplates).catch(() => {});
  }, [connectionId]);
  useEffect(() => () => { abortRef.current?.abort(); replayTimers.current.forEach(clearTimeout); }, []);

  const isDirty = Boolean(report && !building && !busy && report.meta && JSON.stringify(report) !== savedSnapshot);

  const save = useCallback(async () => {
    if (!report || !connectionId) return false;
    try {
      const stored = await saveReportToServer(connectionId, report, savedId);
      setSavedId(stored.id);
      setSavedSnapshot(JSON.stringify(report));
      setSaved(await fetchSavedReports(connectionId));
      setMessage('Saved to your account. Open it from Saved reports on any device; changing the period or filters is free.');
      return true;
    } catch (err) {
      setError(err.status === 401 ? 'Sign in to save reports.' : err.message || 'The report could not be saved. Export it instead.');
      return false;
    }
  }, [report, connectionId, savedId]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
    onRegisterSave?.(save);
    return () => onRegisterSave?.(null);
  }, [isDirty, onDirtyChange, onRegisterSave, save]);

  // Every report the agent builds or edits goes into the history automatically.
  const autosave = async (next) => {
    if (!connectionId || !next?.meta) return;
    try {
      const stored = await saveReportToServer(connectionId, next, savedIdRef.current);
      savedIdRef.current = stored.id;
      setSavedId(stored.id);
      setSavedSnapshot(JSON.stringify(next));
      setSaved(await fetchSavedReports(connectionId));
    } catch {
      // Not signed in: the report still works, it just is not kept.
    }
  };

  const adopt = (next) => {
    setReport(next);
    setView({ grain: next.period?.grain, offset: next.period?.offset || 0, filter_state: next.filter_state || {} });
  };

  // One handler for a live build and a replayed recording, so both draw the same screens.
  const onBuildEvent = (event, request, { keep = true } = {}) => {
    if (event.type === 'stage') setStage(event.stage);
    else if (event.type === 'tool') setSteps((current) => [...current, event]);
    else if (event.type === 'plan') {
      setReport({
        title: event.title, subtitle: event.subtitle, question: request, period: event.period, filters: event.filters,
        kpis: event.kpis.map((k) => ({ ...k, pending: true })), panels: event.panels.map((p) => ({ ...p, pending: true })),
      });
    } else if (event.type === 'item') {
      setReport((current) => {
        if (!current) return current;
        const key = event.item.kind === 'kpi' ? 'kpis' : 'panels';
        return { ...current, [key]: current[key].map((i) => (i.id === event.item.id ? event.item : i)) };
      });
    } else if (event.type === 'clarify') {
      setClarify(event);
      setStage(null);
    } else if (event.type === 'report') {
      adopt(event.report);
      setStage('done');
      setSeeded([]);
      if (keep) autosave(event.report);
    } else if (event.type === 'error') {
      setError(event.detail);
    }
  };

  const stopReplay = () => {
    replayTimers.current.forEach(clearTimeout);
    replayTimers.current = [];
  };

  // A recorded agent build on the demo database, replayed in about five seconds for demos:
  // the agent's steps, then each checked figure, then the finished (live, interactive) report.
  const replay = async () => {
    stopReplay();
    abortRef.current?.abort();
    let recording;
    try {
      const response = await fetch(REPLAY_URL);
      if (!response.ok) throw new Error();
      recording = await response.json();
    } catch {
      setError('The demo replay could not be loaded.');
      return;
    }
    const all = recording.events.map((e) => e.event);
    const plan = all.find((e) => e.type === 'plan');
    const final = all.find((e) => e.type === 'report');
    const exploring = all.slice(0, all.indexOf(plan)).filter((e) => e.type === 'tool' || e.type === 'stage');
    // Figures arrive top to bottom: KPIs, then charts in the plan's order, not in finishing order.
    const order = [...plan.kpis, ...plan.panels].map((item) => item.id);
    const items = all.filter((e) => e.type === 'item').sort((a, b) => order.indexOf(a.item.id) - order.indexOf(b.item.id));
    const timeline = [
      ...exploring.map((event, i) => ({ event, at: 200 + (REPLAY_PLAN_MS - 500) * (i / Math.max(1, exploring.length - 1)) })),
      { event: plan, at: REPLAY_PLAN_MS },
      { event: { type: 'stage', stage: 'check' }, at: REPLAY_PLAN_MS + 100 },
      ...items.map((event, i) => ({ event, at: REPLAY_PLAN_MS + 400 + (REPLAY_FILL_END_MS - REPLAY_PLAN_MS - 400) * (i / Math.max(1, items.length - 1)) })),
      { event: { type: 'stage', stage: 'findings' }, at: REPLAY_FINDINGS_MS },
      { event: final, at: REPLAY_TOTAL_MS },
    ];
    document.querySelector('main')?.scrollTo({ top: 0 });
    setQuestion(recording.question);
    setBuilding(true);
    setReplaying(true);
    setReplayed(false);
    setError('');
    setMessage('');
    setSavedId(null);
    savedIdRef.current = null;
    setSavedSnapshot('');
    setReport(null);
    setClarify(null);
    setHistoryOpen(false);
    setSteps([]);
    setChat([]);
    setCopilot(false);
    setStage('explore');
    // The camera: follow each chart as it fills in, then return to the top for the summary.
    // The page shell cannot scroll (overflow: clip), so only the report area moves.
    const follow = (event) => {
      const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (event.type === 'item' && event.item.kind === 'panel') {
        setTimeout(() => document.getElementById(`panel-${event.item.id}`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' }), 80);
      } else if (event.type === 'report') {
        setTimeout(() => document.querySelector('main')?.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' }), 120);
      }
    };
    replayTimers.current = timeline.map(({ event, at }) => setTimeout(() => {
      onBuildEvent(event, recording.question, { keep: false });
      follow(event);
      if (event.type === 'report') {
        setBuilding(false);
        setReplaying(false);
        setReplayed(true);
        const minutes = Math.max(1, Math.round((recording.recorded_seconds || 0) / 60));
        setMessage(`Replayed a ${minutes}-minute agent build in ${REPLAY_TOTAL_MS / 1000} seconds`);
      }
    }, at));
  };

  const build = async (text = question, turns = []) => {
    const request = `${text.trim()}${questionsText(seeded)}`;
    if (!connectionId || !request.trim()) return;
    stopReplay();
    setReplayed(false);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBuilding(true);
    setError('');
    setMessage('');
    setSavedId(null);
    savedIdRef.current = null;
    setSavedSnapshot('');
    setReport(null);
    setClarify(null);
    setHistoryOpen(false);
    setSteps([]);
    setChat([]);
    setChatSteps([]);
    setStage('explore');
    setHistory(turns);
    try {
      await streamReport(connectionId, { question: request, grain, history: turns }, (event) => onBuildEvent(event, request),
        { signal: controller.signal });
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.status === 402 ? 'Not enough credits to build a report.' : err.message || 'The report could not be built.');
    } finally {
      setBuilding(false);
    }
  };

  const answer = (option) => {
    const turns = [...history, { role: 'assistant', content: clarify.question }, { role: 'user', content: option }];
    build(question, turns);
  };

  const changeView = async (next, target = report, note = '') => {
    if (!target) return;
    setView(next);
    setBusy('refresh');
    setError('');
    try {
      const fresh = await refreshReport(connectionId, target, {
        grain: next.grain || undefined, offset: next.offset || 0, filter_state: next.filter_state || {},
      });
      setReport(fresh);
      if (note) setMessage(note);
    } catch (err) {
      setError(err.message || 'The report could not be refreshed.');
    } finally {
      setBusy('');
    }
  };

  const runTemplate = async (template) => {
    setBusy('template');
    setError('');
    try {
      const built = await runReportTemplate(connectionId, template.id);
      adopt(built);
      setSavedId(null);
      setSavedSnapshot('');
      setMessage('Built from the ready-made pack: every figure was run on the full data and checked. No AI was used, so this was free.');
      savedIdRef.current = null;
      autosave(built);
    } catch (err) {
      setError(err.message || 'The pack could not be built.');
    } finally {
      setBusy('');
    }
  };

  const choose = (item, option) => {
    const key = item.kind === 'kpi' ? 'kpis' : 'panels';
    const next = { ...report, [key]: report[key].map((i) => (i.id === item.id ? { ...i, sql: option.sql } : i)) };
    changeView(view, next, `Using "${option.label}". To make every report and answer use it, approve it once in Definitions.`);
  };

  const sendChat = async (text, questions = []) => {
    if (!report || chatting) return;
    setChat((current) => [...current, { role: 'user', content: text || 'Add these questions to the report.', questions }]);
    setDraft('');
    setChatting(true);
    setChatSteps([]);
    try {
      await streamReportFollowUp(connectionId, { report, message: text, questions }, (event) => {
        if (event.type === 'tool') setChatSteps((current) => [...current, event]);
        else if (event.type === 'reply') setChat((current) => [...current, { role: 'assistant', content: event.text }]);
        else if (event.type === 'report') { adopt(event.report); autosave(event.report); }
        else if (event.type === 'error') setChat((current) => [...current, { role: 'assistant', content: event.detail, error: true }]);
      });
    } catch (err) {
      setChat((current) => [...current, { role: 'assistant', content: err.status === 402 ? 'Not enough credits for a change.' : err.message, error: true }]);
    } finally {
      setChatting(false);
      setChatSteps([]);
    }
  };

  const open = async (entry) => {
    setHistoryOpen(false);
    stopReplay();
    setReplayed(false);
    try {
      const { report: stored } = await fetchSavedReport(entry.id);
      adopt(stored);
      setQuestion(stored.question || '');
      setSavedId(entry.id);
      setSavedSnapshot(JSON.stringify(stored));
      setStage(null);
      setChat([]);
    } catch (err) {
      setError(err.message || 'The saved report could not be opened.');
    }
  };

  const removeSaved = async (ids) => {
    try {
      await deleteSavedReports(ids);
      setSaved((items) => items.filter((item) => !ids.includes(item.id)));
      if (ids.includes(savedIdRef.current)) {
        setSavedId(null);
        savedIdRef.current = null;
        setSavedSnapshot('');
      }
    } catch (err) {
      setError(err.message || 'The report could not be deleted.');
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(report.title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    stopReplay();
    setReplaying(false);
    setReplayed(false);
    setBuilding(false);
    abortRef.current?.abort();
    setReport(null);
    setStage(null);
    setSteps([]);
    setClarify(null);
    setCopilot(false);
    setChat([]);
    setMessage('');
    setError('');
  };

  const ready = Boolean(report?.meta) && !building;
  const iconButton = 'inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white';

  const showHistory = () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    fetchSavedReports(connectionId).then(setSaved).catch(() => {}).finally(() => setHistoryLoading(false));
  };

  // Short-lived notices instead of a status line that is always there.
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(timer);
  }, [message]);

  const openCopilot = (text = '') => {
    setCopilot(true);
    setRailCollapsed(true);
    if (text) setDraft(text);
  };

  if (historyOpen) {
    return (
      <ReportHistory entries={saved} loading={historyLoading} currentId={savedId} onOpen={open} onDelete={removeSaved}
        onClose={() => setHistoryOpen(false)} />
    );
  }

  let content;
  if (!report && !building) {
    // --- Start: one question, nothing else to read --------------------------------------------
    content = (
      <div className="mx-auto flex max-w-2xl flex-col items-center pt-8 text-center sm:pt-14">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-[0_12px_30px_-14px_rgba(79,70,229,0.9)]">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 [text-wrap:balance] dark:text-white">What should this report show?</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The agent builds a checked dashboard from your data.</p>

        <div className="mt-6 w-full rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-[0_24px_60px_-40px_rgba(49,46,129,0.6)] focus-within:border-indigo-400 dark:border-slate-700 dark:bg-slate-900">
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} aria-label="What the report should cover"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) build(); }}
            placeholder="e.g. Weekly sales for the owner: revenue, best customers, refunds"
            className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-slate-800 outline-none dark:text-slate-100" />
          {seeded.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pb-2">
              {seeded.map((q) => (
                <span key={q.id} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-indigo-50 py-1 pl-2 pr-1 text-[11px] font-medium text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200">
                  <History className="h-3 w-3 shrink-0" /><span className="truncate">{q.question}</span>
                  <button type="button" onClick={() => setSeeded(seeded.filter((s) => s.id !== q.id))} className="rounded p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-500/25" aria-label="Remove"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 px-1 pt-1">
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Report period">
              {[{ id: 'week', label: 'Weekly' }, { id: 'month', label: 'Monthly' }].map(({ id, label }) => (
                <button key={id} type="button" onClick={() => setGrain(id)} aria-pressed={grain === id}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${grain === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setPicker('build')} title="Include questions you asked in chat" aria-label="Include past questions"
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-700 dark:text-slate-400 dark:hover:bg-slate-800">
              <History className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => build()} disabled={!connectionId || (!question.trim() && !seeded.length)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.8)] transition hover:brightness-110 disabled:opacity-40">
              Build <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {STARTERS.map(({ Icon, title, text }) => (
            <button key={title} type="button" onClick={() => setQuestion(text)} title={text}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${question === text
                ? 'border-indigo-400 bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200'
                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {title}
            </button>
          ))}
          {templates.map((template) => (
            <button key={template.id} type="button" onClick={() => runTemplate(template)} disabled={Boolean(busy)} title={`${template.description || template.title}. No AI, free.`}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              {busy === 'template' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />} {template.title}
            </button>
          ))}
        </div>
        {connectionId === REPLAY_CONNECTION && (
          <button type="button" onClick={replay}
            className="group mt-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-4 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white transition group-hover:bg-indigo-600 dark:bg-white dark:text-slate-900"><Play className="h-3 w-3 translate-x-px fill-current" /></span>
            Replay a demo build in 20 s
          </button>
        )}
        {error && <p className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-left text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}
      </div>
    );
  } else if (building || (clarify && !report?.meta)) {
    // --- Building: the agent's steps beside the dashboard filling in ------------------------------
    content = (
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-4 xl:sticky xl:top-0 dark:border-slate-800 dark:bg-[#121622]" aria-label="Agent progress">
          {replaying && <ReplayProgress />}
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-900 [text-wrap:balance] dark:text-white">{question || 'Management overview'}</p>
            <button type="button" onClick={reset} title="Stop" aria-label="Stop building" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3"><StageRail stage={stage} /></div>
          {clarify ? (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/60 dark:bg-sky-950/30">
              <p className="text-sm font-semibold text-sky-950 dark:text-sky-100">{clarify.question}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {clarify.options.map((option) => (
                  <button key={option} type="button" onClick={() => answer(option)}
                    className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">{option}</button>
                ))}
              </div>
            </div>
          ) : (
            <div data-scroll-box className="mt-4 max-h-[60vh] overflow-y-auto overscroll-contain scroll-smooth pr-1"><AgentTimeline steps={steps} running={building && stage === 'explore'} compact /></div>
          )}
          {error && <p className="mt-3 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
        </section>
        <div className="min-w-0">{report ? <ReportCanvas report={report} isDark={isDark} busy reveal={replaying} /> : <SkeletonDashboard />}</div>
      </div>
    );
  } else {
    // --- Built: the dashboard, with three actions and the rest behind "More" ----------------------
    content = (
      <div className="space-y-3">
        <div className="flex items-center gap-1 print:hidden">
          <button type="button" onClick={showHistory} className={`${iconButton} lg:hidden`}><History className="h-4 w-4" /> <span className="sr-only">History</span></button>
          {replayed && (
            <button type="button" onClick={replay} className={iconButton} title="Replay the recorded build"><Play className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Replay</span></button>
          )}
          {savedId && !isDirty && <span className="hidden items-center gap-1 pl-1 text-[11px] text-slate-400 sm:inline-flex" title="Kept in your report history"><Check className="h-3.5 w-3.5 text-emerald-600" /> Saved</span>}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => (copilot ? setCopilot(false) : openCopilot())} aria-pressed={copilot} aria-label="Ask the agent"
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition ${copilot ? 'bg-indigo-600 text-white' : 'text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/15'}`}>
              <Bot className="h-4 w-4" /> <span className="hidden sm:inline">Ask the agent</span>
            </button>
            <button type="button" onClick={() => changeView(view, report, 'Re-ran every figure on current data, free.')} disabled={Boolean(busy) || !ready} title="Re-run every figure on current data, free" className={iconButton}>
              <RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">Refresh</span>
            </button>
            <button type="button" onClick={() => setAutomate(true)} disabled={!ready}
              className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 text-xs font-semibold text-white shadow-[0_8px_20px_-12px_rgba(79,70,229,0.9)] transition hover:brightness-110 disabled:opacity-50">
              <Newspaper className="h-4 w-4" /> <span className="hidden sm:inline">Automate</span>
            </button>
            <MoreMenu items={[
              { label: isDirty ? 'Save changes' : 'Saved', Icon: Save, onClick: save, disabled: !isDirty },
              { label: 'Print or PDF', Icon: Printer, onClick: () => window.print() },
              { label: 'Export JSON', Icon: Download, onClick: exportJson },
            ]} />
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 print:hidden dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <div className={`grid items-start gap-4 ${copilot ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
          <div className="min-w-0">
            <ReportCanvas report={report} isDark={isDark} busy={Boolean(busy) || chatting} refreshing={busy === 'refresh' || chatting} narrow={copilot}
              view={view} onView={(next) => changeView(next)} onChoose={choose}
              onAsk={(item) => openCopilot(`For "${item.label || item.title}": `)} />
          </div>
          {copilot && (
            <ReportCopilot messages={chat} steps={chatSteps} running={chatting} draft={draft} setDraft={setDraft}
              model={report.agent?.model} onSend={(text) => sendChat(text)} onPickQuestions={() => setPicker('copilot')} onClose={() => setCopilot(false)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`grid items-start gap-5 ${railCollapsed ? 'lg:grid-cols-[44px_minmax(0,1fr)]' : 'lg:grid-cols-[248px_minmax(0,1fr)]'}`}>
      <ReportHistoryRail entries={saved} loading={historyLoading} currentId={report?.meta ? savedId : null} onOpen={open} onNew={reset}
        onDelete={removeSaved} onManage={showHistory} collapsed={railCollapsed} onToggle={() => setRailCollapsed(!railCollapsed)} />
      <div className="min-w-0">{content}</div>

      {automate && report && <ScheduleEmail connectionId={connectionId} report={report} onClose={() => setAutomate(false)} />}
      {picker && (
        <PastQuestionsPicker connectionId={connectionId} actionLabel={picker === 'build' ? 'Include in the report' : 'Add to report'} onClose={() => setPicker(null)}
          onAdd={(picked) => {
            setPicker(null);
            if (picker === 'build') setSeeded([...seeded, ...picked.filter((p) => !seeded.some((s) => s.id === p.id))].slice(0, 8));
            else { openCopilot(); sendChat('', picked); }
          }} />
      )}
      {message && (
        <p role="status" className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-lg print:hidden dark:bg-white dark:text-slate-900">
          {message}
        </p>
      )}
    </div>
  );
}

// The replay's own clock: a bar and "0:04 / 0:10", so the audience knows it is a fast-forward.
function ReplayProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.min(REPLAY_TOTAL_MS, Date.now() - started)), 100);
    return () => clearInterval(timer);
  }, []);
  const clock = (ms) => `0:${String(Math.floor(ms / 1000)).padStart(2, '0')}`;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-[11px] font-semibold">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-2.5 py-1 text-white dark:bg-white dark:text-slate-900">
          <Play className="h-3 w-3 fill-current" /> Recorded build, replayed
        </span>
        <span className="tabular-nums text-slate-500">{clock(elapsed)} / {clock(REPLAY_TOTAL_MS)}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="replay-fill h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-600" style={{ '--replay-ms': `${REPLAY_TOTAL_MS}ms` }} />
      </div>
    </div>
  );
}

function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const escape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title="More" aria-label="More actions"
        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-30 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {items.map(({ label, Icon, onClick, disabled }) => (
            <button key={label} type="button" role="menuitem" disabled={disabled} onClick={() => { setOpen(false); onClick(); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800">
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
