import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CalendarClock,
  CalendarDays,
  Clock,
  Download,
  FileText,
  History,
  LifeBuoy,
  Loader2,
  Newspaper,
  Package,
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
import { AgentTimeline, ReportCopilot, StageRail } from './ReportAgentPanel';

const STARTERS = [
  { Icon: TrendingUp, title: 'Sales performance', text: 'How are sales, orders and average order value moving, and which customers and products drive them?' },
  { Icon: Truck, title: 'Operations and delivery', text: 'How are shipments, carriers and delivery problems performing?' },
  { Icon: Users, title: 'Customers', text: 'Which customer segments and cities are growing, and who are our most valuable customers?' },
  { Icon: LifeBuoy, title: 'Refunds and support', text: 'Where are we losing money: refunds, cancellations and support cases?' },
];

const HOW_IT_WORKS = [
  'Reads your tables and profiles the columns that matter',
  'Tests its queries before it commits to a plan',
  'Picks 8 or more charts, each a different type for its question',
  'Runs every figure on the full data through SlayQL’s checks',
  'Delivers the same checked report weekly or monthly by email',
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
  useEffect(() => () => abortRef.current?.abort(), []);

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

  const build = async (text = question, turns = []) => {
    const request = `${text.trim()}${questionsText(seeded)}`;
    if (!connectionId || !request.trim()) return;
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
      await streamReport(connectionId, { question: request, grain, history: turns }, (event) => {
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
          autosave(event.report);
        } else if (event.type === 'error') {
          setError(event.detail);
        }
      }, { signal: controller.signal });
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
    try {
      const { report: stored } = await fetchSavedReport(entry.id);
      adopt(stored);
      setQuestion(stored.question || '');
      setSavedId(entry.id);
      setSavedSnapshot(JSON.stringify(stored));
      setStage(null);
      setChat([]);
      setMessage(`Opened "${entry.title}". Change the period or filters to re-run it on today's data, free.`);
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
  const toolbarButton = 'inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
  const savedList = useMemo(() => saved.slice(0, 4), [saved]);

  const showHistory = () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    fetchSavedReports(connectionId).then(setSaved).catch(() => {}).finally(() => setHistoryLoading(false));
  };

  if (historyOpen) {
    return (
      <ReportHistory entries={saved} loading={historyLoading} currentId={savedId} onOpen={open} onDelete={removeSaved}
        onClose={() => setHistoryOpen(false)} />
    );
  }

  // --- Start ------------------------------------------------------------------------------------
  if (!report && !building) {
    return (
      <div className="space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-white dark:border-indigo-500/20 dark:bg-[#121622]">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(129,140,248,0.22),transparent_70%)]" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-28 right-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.2),transparent_70%)]" aria-hidden="true" />
          <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                <Bot className="h-3.5 w-3.5" /> AI report agent
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[28px]">What should this report tell you?</h2>
              <p className="mt-1.5 max-w-xl text-sm text-slate-600 dark:text-slate-300">
                Describe it like you would to an analyst. The agent explores your data, builds a dashboard of checked figures, and can send it to your inbox every week or month.
              </p>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_-36px_rgba(49,46,129,0.55)] focus-within:border-indigo-400 dark:border-slate-700 dark:bg-slate-900">
                <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} aria-label="What the report should cover"
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) build(); }}
                  placeholder="e.g. A weekly sales report for the owner: revenue, best customers, refunds and how deliveries are doing"
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
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-1 pt-2 dark:border-slate-800">
                  <div className="inline-flex rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Report period">
                    {[{ id: 'week', label: 'Weekly', Icon: CalendarDays }, { id: 'month', label: 'Monthly', Icon: CalendarClock }].map(({ id, label, Icon }) => (
                      <button key={id} type="button" onClick={() => setGrain(id)} aria-pressed={grain === id}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${grain === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setPicker('build')}
                    className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <History className="h-3.5 w-3.5" /> Add past questions
                  </button>
                  <button type="button" onClick={() => build()} disabled={!connectionId || (!question.trim() && !seeded.length)}
                    className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.8)] transition hover:brightness-110 disabled:opacity-50">
                    <Sparkles className="h-4 w-4" /> Build report
                  </button>
                </div>
              </div>
              {error && <p className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">How the agent works</p>
              <ol className="mt-3 space-y-3">
                {HOW_IT_WORKS.map((line, i) => (
                  <li key={line} className="flex gap-3 text-sm text-slate-700 dark:text-slate-200">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-[11px] font-semibold text-white">{i + 1}</span>
                    <span className="pt-0.5">{line}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="relative grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4 dark:border-slate-800">
            {STARTERS.map(({ Icon, title, text }) => (
              <button key={title} type="button" onClick={() => setQuestion(text)}
                className={`group rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${question === text ? 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10' : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700'}`}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"><Icon className="h-4 w-4" /></span>
                <span className="mt-2 block text-sm font-semibold text-slate-900 dark:text-white">{title}</span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{text}</span>
              </button>
            ))}
          </div>
        </section>

        {(savedList.length > 0 || templates.length > 0) && (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent reports</h3>
                {saved.length > 0 && (
                  <button type="button" onClick={showHistory} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-300">
                    View all history ({saved.length}) <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {savedList.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {savedList.map((entry) => (
                    <button key={entry.id} type="button" onClick={() => open(entry)}
                      className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-[#121622]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{entry.title}</span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {entry.summary?.period ? `${entry.summary.period} · ` : ''}{entry.summary?.charts?.length ? `${entry.summary.charts.length} charts · ` : ''}{new Date(entry.updated_at).toLocaleDateString()}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                    </button>
                  ))}
                </div>
              ) : <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">Reports you build are kept here automatically.</p>}
            </div>
            {templates.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Ready-made for this data</h3>
                {templates.map((template) => (
                  <button key={template.id} type="button" onClick={() => runTemplate(template)} disabled={Boolean(busy)} title={template.description}
                    className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-left hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                    {busy === 'template' ? <Loader2 className="h-4 w-4 animate-spin text-emerald-700" /> : <Package className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-emerald-900 dark:text-emerald-200">{template.title}</span>
                      <span className="block text-[11px] text-emerald-800/80 dark:text-emerald-300/80">No AI, free</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {picker && (
          <PastQuestionsPicker connectionId={connectionId} actionLabel="Include in the report" onClose={() => setPicker(null)}
            onAdd={(picked) => { setSeeded([...seeded, ...picked.filter((p) => !seeded.some((s) => s.id === p.id))].slice(0, 8)); setPicker(null); }} />
        )}
      </div>
    );
  }

  // --- Building ----------------------------------------------------------------------------------
  if (building || (clarify && !report?.meta)) {
    return (
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4 dark:border-slate-800 dark:bg-[#121622]">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white"><Bot className="h-4.5 w-4.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">The agent is building your report</p>
              <p className="truncate text-[11px] text-slate-500">{question || 'Management overview'}</p>
            </div>
            <button type="button" onClick={reset} title="Stop" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3"><StageRail stage={stage} /></div>
          {clarify ? (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/60 dark:bg-sky-950/30">
              <p className="text-sm font-semibold text-sky-950 dark:text-sky-100">{clarify.question}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {clarify.options.map((option) => (
                  <button key={option} type="button" onClick={() => answer(option)}
                    className="rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">{option}</button>
                ))}
              </div>
            </div>
          ) : (
            <div data-scroll-box className="mt-4 max-h-[60vh] overflow-y-auto overscroll-contain scroll-smooth pr-1"><AgentTimeline steps={steps} running={building && stage === 'explore'} /></div>
          )}
          {error && <p className="mt-3 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
        </aside>
        <div className="min-w-0">{report ? <ReportCanvas report={report} isDark={isDark} busy /> : <SkeletonDashboard />}</div>
      </div>
    );
  }

  // --- Built ----------------------------------------------------------------------------------------
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={reset} className={toolbarButton}><ArrowLeft className="h-4 w-4" /> New report</button>
        <button type="button" onClick={showHistory} className={toolbarButton}>
          <Clock className="h-4 w-4" /> History{saved.length ? ` (${saved.length})` : ''}
        </button>
        {savedId && !isDirty && <span className="hidden items-center gap-1 text-[11px] font-medium text-emerald-700 sm:inline-flex dark:text-emerald-400"><History className="h-3.5 w-3.5" /> Kept in history</span>}
        <p className="mx-2 hidden min-w-0 flex-1 truncate text-xs text-slate-500 xl:block dark:text-slate-400">{message || 'Change the period or a filter to re-run every checked figure, free. Click a bar to filter the report.'}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCopilot(!copilot)} aria-pressed={copilot}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition ${copilot ? 'bg-indigo-600 text-white' : 'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-200'}`}>
            <Bot className="h-4 w-4" /> Ask the agent
          </button>
          <button type="button" onClick={() => changeView(view, report, 'Re-ran every checked figure on current data. No AI was used, so this was free.')} disabled={Boolean(busy) || !ready} title="Re-run on current data, free" className={toolbarButton}>
            <RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={save} disabled={!isDirty} className={toolbarButton}><Save className="h-4 w-4" /> Save</button>
          <button type="button" onClick={() => setAutomate(true)} disabled={!ready}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3 text-xs font-semibold text-white shadow-[0_8px_20px_-12px_rgba(79,70,229,0.9)] transition hover:brightness-110 disabled:opacity-50">
            <Newspaper className="h-4 w-4" /> Automate
          </button>
          <button type="button" onClick={() => window.print()} className={toolbarButton} title="Print or save as PDF"><Printer className="h-4 w-4" /></button>
          <button type="button" onClick={exportJson} className={toolbarButton} title="Export the report and its SQL as JSON"><Download className="h-4 w-4" /></button>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 print:hidden dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <div className={`grid items-start gap-4 ${copilot ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
        <div className="min-w-0">
          <ReportCanvas report={report} isDark={isDark} busy={Boolean(busy) || chatting} refreshing={busy === 'refresh' || chatting} narrow={copilot}
            view={view} onView={(next) => changeView(next)} onChoose={choose}
            onAsk={(item) => { setCopilot(true); setDraft(`For "${item.label || item.title}": `); }} />
        </div>
        {copilot && (
          <ReportCopilot messages={chat} steps={chatSteps} running={chatting} draft={draft} setDraft={setDraft}
            model={report.agent?.model} onSend={(text) => sendChat(text)} onPickQuestions={() => setPicker('copilot')} onClose={() => setCopilot(false)} />
        )}
      </div>

      {automate && <ScheduleEmail connectionId={connectionId} report={report} onClose={() => setAutomate(false)} />}
      {picker && (
        <PastQuestionsPicker connectionId={connectionId} onClose={() => setPicker(null)}
          onAdd={(picked) => { setPicker(null); setCopilot(true); sendChat('', picked); }} />
      )}
    </div>
  );
}
