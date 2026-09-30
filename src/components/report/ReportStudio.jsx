import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Mail,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  deleteSavedReport,
  fetchReportTemplates,
  fetchSavedReport,
  fetchSavedReports,
  refreshReport,
  reviseReportItem,
  runReportTemplate,
  saveReportToServer,
  streamReport,
} from '../../services/api';
import ReportCanvas from './ReportCanvas';
import ScheduleEmail from './ScheduleEmail';

const SUGGESTIONS = [
  'How is revenue trending, and which customer segments and products drive it?',
  'Where are we losing money: cancellations, refunds and discounts?',
  'How are deliveries and support cases performing?',
  'Berapa jualan kita setiap bulan, dan pelanggan mana yang paling penting?',
];

const STAGES = [
  { id: 'plan', label: 'Plan the figures' },
  { id: 'check', label: 'Run and check each query' },
  { id: 'findings', label: 'Compute findings and summary' },
];

// Matches MAX_PANELS in backend/app/workbench/trusted_report.py.
const MAX_PANELS = 6;

// Reports used to be saved in the browser only; they are moved to the server once.
const legacyStorageKey = (connectionId) => `slayql:trusted-reports:${connectionId}`;

function legacySaved(connectionId) {
  try {
    const value = JSON.parse(localStorage.getItem(legacyStorageKey(connectionId)) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const migrations = new Map();

async function migrateLegacy(connectionId) {
  const legacy = legacySaved(connectionId);
  if (!legacy.length) return;
  localStorage.removeItem(legacyStorageKey(connectionId));
  try {
    for (const entry of [...legacy].reverse()) {
      if (entry?.report) await saveReportToServer(connectionId, entry.report);
    }
  } catch (err) {
    // Not signed in or offline: keep them in the browser and try again next time.
    localStorage.setItem(legacyStorageKey(connectionId), JSON.stringify(legacy));
    throw err;
  }
}

async function loadSaved(connectionId) {
  // Run the one-time move once per data source, even if the component mounts twice.
  if (!migrations.has(connectionId)) migrations.set(connectionId, migrateLegacy(connectionId).catch(() => migrations.delete(connectionId)));
  await migrations.get(connectionId);
  return fetchSavedReports(connectionId);
}

function summarizeTrust(report) {
  const counts = { confident: 0, caveat: 0, clarify: 0, handoff: 0 };
  [...(report.kpis || []), ...(report.panels || [])].forEach((item) => {
    if (!item.pending && counts[item.outcome] !== undefined) counts[item.outcome] += 1;
  });
  return counts;
}

export default function ReportStudio({ connectionId, isDark = false, onDirtyChange, onRegisterSave }) {
  const [question, setQuestion] = useState(SUGGESTIONS[0]);
  const [report, setReport] = useState(null);
  const [stage, setStage] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState([]);
  const [savedId, setSavedId] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [editing, setEditing] = useState(null);
  const [showSaved, setShowSaved] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [scheduling, setScheduling] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    setSaved([]);
    if (connectionId) loadSaved(connectionId).then(setSaved).catch(() => {});
    setReport(null);
    setSavedId(null);
    setSavedSnapshot('');
  }, [connectionId]);

  useEffect(() => {
    setTemplates([]);
    if (connectionId) fetchReportTemplates(connectionId).then(setTemplates).catch(() => {});
  }, [connectionId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const isDirty = Boolean(report && !busy && JSON.stringify(report) !== savedSnapshot);

  const save = useCallback(async () => {
    if (!report || !connectionId) return false;
    try {
      const stored = await saveReportToServer(connectionId, report, savedId);
      setSavedId(stored.id);
      setSavedSnapshot(JSON.stringify(report));
      setSaved(await fetchSavedReports(connectionId));
      setMessage('Saved to your account. Open it from Saved reports on any device, and refresh it for free.');
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

  const build = async () => {
    if (!connectionId || !question.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy('build');
    setError('');
    setMessage('');
    setSavedId(null);
    setReport(null);
    setStage('plan');
    try {
      await streamReport(connectionId, { question: question.trim() }, (event) => {
        if (event.type === 'stage') setStage(event.stage);
        else if (event.type === 'plan') {
          setReport({
            title: event.title,
            subtitle: event.subtitle,
            question: question.trim(),
            kpis: event.kpis.map((k) => ({ ...k, pending: true })),
            panels: event.panels.map((p) => ({ ...p, pending: true })),
          });
        } else if (event.type === 'item') {
          setReport((current) => {
            if (!current) return current;
            const key = event.item.kind === 'kpi' ? 'kpis' : 'panels';
            return { ...current, [key]: current[key].map((i) => (i.id === event.item.id ? event.item : i)) };
          });
        } else if (event.type === 'report') {
          setReport(event.report);
          setStage('done');
        } else if (event.type === 'error') {
          setError(event.detail);
        }
      }, { signal: controller.signal });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.status === 402 ? 'Not enough credits to build a report.' : err.message || 'The report could not be built.');
      }
    } finally {
      setBusy('');
    }
  };

  const refresh = async (target = report, note = 'Refreshed on current data. No AI was used, so this was free.') => {
    if (!target) return;
    setBusy('refresh');
    setError('');
    try {
      const fresh = await refreshReport(connectionId, target);
      setReport(fresh);
      setMessage(note);
    } catch (err) {
      setError(err.message || 'Refresh failed.');
    } finally {
      setBusy('');
    }
  };

  const runTemplate = async (template) => {
    setBusy('template');
    setError('');
    setStage(null);
    try {
      const built = await runReportTemplate(connectionId, template.id);
      setReport(built);
      setSavedId(null);
      setSavedSnapshot('');
      setMessage('Built from the ready-made pack: every figure was run on the full data and checked. No AI was used, so this was free.');
    } catch (err) {
      setError(err.message || 'The pack could not be built.');
    } finally {
      setBusy('');
    }
  };

  const choose = (item, option) => {
    const key = item.kind === 'kpi' ? 'kpis' : 'panels';
    const next = { ...report, [key]: report[key].map((i) => (i.id === item.id ? { ...i, sql: option.sql } : i)) };
    refresh(next, `Using "${option.label}". To make every report and answer use it, approve it once in Definitions.`);
  };

  const remove = (item, kind) => {
    const key = kind === 'kpi' ? 'kpis' : 'panels';
    setEditing(null);
    refresh({ ...report, [key]: report[key].filter((i) => i.id !== item.id) }, 'Removed. Findings recomputed.');
  };

  const revise = async () => {
    if (!editing?.instruction.trim()) return;
    if (!editing.item && editing.kind === 'panel' && report.panels.length >= MAX_PANELS) {
      setError(`A report holds up to ${MAX_PANELS} charts. Remove one before adding another.`);
      return;
    }
    setBusy('revise');
    setError('');
    try {
      const response = await reviseReportItem(connectionId, {
        report: { question: report.question, title: report.title },
        instruction: editing.instruction.trim(),
        item: editing.item,
        kind: editing.kind,
      });
      const key = editing.kind === 'kpi' ? 'kpis' : 'panels';
      let item = response.item;
      if (!editing.item) {
        // An added figure must never replace an existing one that happens to share its id.
        const taken = new Set([...report.kpis, ...report.panels].map((i) => i.id));
        let id = item.id;
        for (let n = 2; taken.has(id); n += 1) id = `${item.id}-${n}`;
        item = { ...item, id };
      }
      const next = {
        ...report,
        [key]: editing.item ? report[key].map((i) => (i.id === item.id ? item : i)) : [...report[key], item],
      };
      setEditing(null);
      // Refresh recomputes the findings and summary for the changed figure (free).
      await refresh(next, 'Figure updated and checked. Findings recomputed.');
    } catch (err) {
      setError(err.message || 'That change could not be made.');
      setBusy('');
    }
  };

  const open = async (entry) => {
    setShowSaved(false);
    try {
      const { report: stored } = await fetchSavedReport(entry.id);
      setReport(stored);
      setQuestion(stored.question || question);
      setSavedId(entry.id);
      setSavedSnapshot(JSON.stringify(stored));
      setMessage(`Opened "${entry.title}". Refresh to run it on today's data.`);
    } catch (err) {
      setError(err.message || 'The saved report could not be opened.');
    }
  };

  const removeSaved = async (id) => {
    try {
      await deleteSavedReport(id);
      setSaved((items) => items.filter((item) => item.id !== id));
      if (savedId === id) setSavedId(null);
    } catch (err) {
      setError(err.message || 'The saved report could not be deleted.');
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

  const displayed = useMemo(() => (report ? { ...report, trust: report.trust || summarizeTrust(report) } : null), [report]);
  const building = busy === 'build';

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 print:hidden dark:border-slate-800 dark:bg-[#121622]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Report Studio</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ask a business question. SlayQL plans the figures, runs each one on the full data, checks it, and writes a summary that only uses checked numbers.
              </p>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <button type="button" onClick={() => setShowSaved(!showSaved)} disabled={!saved.length}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <FolderOpen className="h-4 w-4" /> Saved reports ({saved.length})
            </button>
            {showSaved && (
              <div className="absolute right-0 top-11 z-20 w-80 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {saved.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                    <button type="button" onClick={() => open(entry)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{entry.title}</p>
                      <p className="text-[11px] text-slate-500">Saved {new Date(entry.updated_at).toLocaleString()}</p>
                    </button>
                    <button type="button" onClick={() => removeSaved(entry.id)} title="Delete saved report" className="rounded p-2 text-slate-400 hover:text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) build(); }}
            rows={2}
            aria-label="Business question for the report"
            placeholder="e.g. How are sales by branch this quarter, and where are we behind?"
            className="flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={build}
            disabled={building || !connectionId || !question.trim()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {building ? 'Building…' : report ? 'Build new report' : 'Build report'}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setQuestion(s)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300">
              {s}
            </button>
          ))}
        </div>
        {templates.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ready-made for this data</span>
            {templates.map((template) => (
              <button key={template.id} type="button" onClick={() => runTemplate(template)} disabled={Boolean(busy) || building}
                title={template.description}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                {busy === 'template' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                {template.title} · no AI, free
              </button>
            ))}
          </div>
        )}

        {(building || stage === 'done') && (
          <ol className="mt-3 flex flex-wrap gap-4 text-xs" aria-live="polite">
            {STAGES.map((s) => {
              const order = STAGES.findIndex((x) => x.id === stage);
              const index = STAGES.findIndex((x) => x.id === s.id);
              const state = stage === 'done' || index < order ? 'done' : index === order ? 'active' : 'waiting';
              return (
                <li key={s.id} className={`inline-flex items-center gap-1.5 ${state === 'waiting' ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                  {state === 'done' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : state === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}
                  {s.label}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {error && (
        <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 print:hidden dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {displayed && (
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <p className="text-xs text-slate-500 dark:text-slate-400">{message || 'Click a badge to see its checks, or the pencil to change a figure.'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing({ kind: 'panel', item: null, instruction: '' })} disabled={Boolean(busy)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Add a chart
            </button>
            <button type="button" onClick={() => refresh()} disabled={Boolean(busy)} title="Re-run every checked query on current data, without AI"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> Refresh (free)
            </button>
            <button type="button" onClick={save} disabled={!isDirty}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <Save className="h-4 w-4" /> Save
            </button>
            <button type="button" onClick={() => setScheduling(!scheduling)} disabled={Boolean(busy)} title="Email this report every week"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <Mail className="h-4 w-4" /> Email weekly
            </button>
            <button type="button" onClick={() => window.print()} disabled={Boolean(busy)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
            <button type="button" onClick={exportJson} title="Export the report and its SQL as JSON"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {scheduling && displayed && (
        <ScheduleEmail connectionId={connectionId} report={report} onClose={() => setScheduling(false)} />
      )}

      {editing && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 print:hidden dark:border-indigo-900/60 dark:bg-indigo-950/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {editing.item ? `Change "${editing.item.label || editing.item.title}"` : 'Add a chart'}
            </p>
            <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-slate-500 hover:text-slate-800" title="Cancel"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              autoFocus
              value={editing.instruction}
              onChange={(e) => setEditing({ ...editing, instruction: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') revise(); }}
              placeholder={editing.item ? 'e.g. Show the last 6 months only, or split by customer segment' : 'e.g. Top 10 customers by completed revenue'}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button type="button" onClick={revise} disabled={busy === 'revise' || !editing.instruction.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {busy === 'revise' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Apply and check
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">The new query is checked like every other figure before it appears.</p>
            {editing.item && (
              <button type="button" onClick={() => remove(editing.item, editing.kind)} disabled={Boolean(busy)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-40">
                <Trash2 className="h-3.5 w-3.5" /> Remove this figure
              </button>
            )}
          </div>
        </div>
      )}

      {displayed ? (
        <div className={busy === 'refresh' || busy === 'revise' ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <ReportCanvas
            report={displayed}
            isDark={isDark}
            busy={Boolean(busy)}
            onChoose={choose}
            onEdit={(item, kind) => setEditing({ item, kind, instruction: '' })}
          />
        </div>
      ) : !building && (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <Sparkles className="mb-3 h-6 w-6 text-indigo-500" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">No report yet</p>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            Pick a suggested question or write your own. Each figure will show whether it passed SlayQL&apos;s checks, and anything uncertain is flagged instead of shown as fact.
          </p>
        </div>
      )}
    </div>
  );
}
