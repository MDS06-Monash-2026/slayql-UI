import React, { useEffect, useState } from 'react';
import { ArrowLeft, Database, LayoutDashboard, Moon, Sun } from 'lucide-react';
import ReportStudio from '../components/report/ReportStudio';
import { fetchConnections } from '../services/api';
import { getClientCache } from '../services/clientCache';

const SOURCE_KEY = 'slayql_reports_connection';

function pickSource(list) {
  let stored = null;
  try {
    stored = localStorage.getItem(SOURCE_KEY);
  } catch {
    stored = null;
  }
  return (list.find((c) => c.id === stored) || list.find((c) => c.is_default) || list[0])?.id || null;
}

// Reports: the AI report agent, its dashboards, history and email automation, on their own page.
export default function ReportsView({ setView, session, theme: propTheme, setTheme: propSetTheme }) {
  const [localTheme, setLocalTheme] = useState(() => {
    try {
      return localStorage.getItem('slayql_theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const theme = propTheme || localTheme;
  const setTheme = propSetTheme || setLocalTheme;
  const isDark = theme === 'dark';
  const cached = getClientCache('connections', 30 * 60 * 1000) || [];
  const [connections, setConnections] = useState(cached);
  const [connectionId, setConnectionId] = useState(() => pickSource(cached));
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('slayql_theme', theme);
    } catch {
      // Private mode: the theme still applies for this visit.
    }
  }, [isDark, theme]);

  // Load data sources once signed in; the session can arrive after this page opens.
  useEffect(() => {
    let active = true;
    setLoadError('');
    fetchConnections({ force: attempt > 0 }).then((list) => {
      if (!active) return;
      setConnections(list);
      setConnectionId((current) => (list.some((c) => c.id === current) ? current : pickSource(list)));
    }).catch((err) => { if (active) setLoadError(err.message || 'Could not load your data sources.'); });
    return () => { active = false; };
  }, [session, attempt]);

  const choose = (id) => {
    setConnectionId(id);
    try {
      localStorage.setItem(SOURCE_KEY, id);
    } catch {
      // Not remembered, but still used.
    }
  };

  return (
    <div className={`live-demo-shell theme-${theme} review-page flex h-screen flex-col overflow-hidden text-slate-900 dark:bg-[#0b0e16] dark:text-slate-100`}>
      <header className="z-30 shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-[#0f131d]/90">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={() => setView('demo')}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back to chat</span>
          </button>
          <span className="h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          <span className="slayql-logo text-[22px] tracking-tight"><span className="slay">Slay</span><span className="ql">QL</span></span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-1 text-xs font-semibold text-white">
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" /> Reports
          </span>

          <div className="ml-auto flex items-center gap-2">
            <label className="inline-flex max-w-[16rem] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:max-w-xs">
              <Database className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
              <span className="sr-only">Data source</span>
              <select value={connectionId || ''} onChange={(e) => choose(e.target.value)}
                className="lab-source-select min-w-0 truncate bg-transparent pr-1 text-[13px] font-medium text-slate-900 outline-none dark:text-slate-100 [&>option]:text-slate-900">
                {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label={isDark ? 'Use light mode' : 'Use dark mode'}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
          {connectionId ? (
            <ReportStudio key={connectionId} connectionId={connectionId} isDark={isDark} />
          ) : loadError || (connections.length === 0 && attempt > 0) ? (
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
              <Database className="h-6 w-6 text-indigo-500" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">{loadError ? 'Your data sources did not load' : 'No data sources yet'}</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">{loadError || 'Add one in AI Database Lab, then build a report on it.'}</p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Retry</button>
                <button type="button" onClick={() => setView('databases')} className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Open AI Database Lab</button>
              </div>
            </div>
          ) : (
            <div className="skel h-80 rounded-3xl" aria-label="Loading data sources" />
          )}
        </div>
      </main>
    </div>
  );
}
