import React, { useState, useEffect, useCallback } from 'react';

// ─── Dashboard-specific components ───────────────────────────────────────────
import DashboardSidebar    from '../components/dashboard/DashboardSidebar';
import DashboardHeader     from '../components/dashboard/DashboardHeader';
import WelcomeBanner       from '../components/dashboard/WelcomeBanner';
import DbStatusCard        from '../components/dashboard/DbStatusCard';
import QueryInputPanel     from '../components/dashboard/QueryInputPanel';
import ReasoningTrace      from '../components/dashboard/ReasoningTrace';
import SqlResultPanel      from '../components/dashboard/SqlResultPanel';
import DataExplorer        from '../components/dashboard/DataExplorer';
import QueryHistoryPanel   from '../components/dashboard/QueryHistoryPanel';

// ─── API / service layer ──────────────────────────────────────────────────────
import { generateSql, executeQuery } from '../lib/api/query';
import { getDbStatus, getSchema }    from '../lib/api/database';
import { getHistory, addToHistory, deleteHistoryItem, toggleSaved } from '../lib/api/history';
import { SSE_STEPS } from '../mock/mockData';

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type = 'info' }) {
  const colors =
    type === 'success' ? 'bg-emerald-700 text-white' :
    type === 'error'   ? 'bg-red-600 text-white'     :
                          'bg-slate-800 text-white';
  return (
    <div className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-xl text-sm font-medium slide-in-right ${colors}`}>
      {message}
    </div>
  );
}

// ─── Quick Stats row ──────────────────────────────────────────────────────────

function StatCard({ label, value, delta }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex-1 min-w-0">
      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {delta != null && (
        <p className="text-[10px] text-emerald-600 mt-0.5">↑ {delta} this week</p>
      )}
    </div>
  );
}

// ─── DashboardView ─────────────────────────────────────────────────────────────

/**
 * Query state machine:
 *   idle → generating → generated → executing → success | error
 */
export default function DashboardView({ setView, activeDatabase }) {
  // ── Layout state ─────────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false);
  const [activeSection,    setActiveSection]    = useState('home');

  // ── Data state ────────────────────────────────────────────────────────────
  const [dbStatus,  setDbStatus]  = useState(null);
  const [schema,    setSchema]    = useState(null);
  const [history,   setHistory]   = useState([]);

  // ── Query state machine ───────────────────────────────────────────────────
  const [queryInput,       setQueryInput]       = useState('');
  const [queryState,       setQueryState]       = useState('idle'); // idle|generating|generated|executing|success|error
  const [currentDataset,   setCurrentDataset]   = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [traceVisible,     setTraceVisible]     = useState(false);
  const [traceComplete,    setTraceComplete]     = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'info', durationMs = 2500) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), durationMs);
  };

  // ── Bootstrap data ────────────────────────────────────────────────────────
  useEffect(() => {
    getDbStatus().then(setDbStatus);
    getSchema('spider2_sqlite_demo').then(setSchema);
    getHistory().then(setHistory);
  }, []);

  // ── Submit query (NL → SQL) ───────────────────────────────────────────────
  const handleSubmit = useCallback(async (promptOverride) => {
    const prompt = (promptOverride ?? queryInput).trim();
    if (!prompt) return;

    setQueryInput(prompt);
    setQueryState('generating');
    setCurrentDataset(null);
    setCurrentStepIndex(-1);
    setTraceVisible(true);
    setTraceComplete(false);

    try {
      const dataset = await generateSql(prompt, {
        onStep: (step, idx) => setCurrentStepIndex(idx + 1),
      });
      setCurrentDataset(dataset);
      setQueryState('generated');
      setTraceComplete(true);
      setCurrentStepIndex(SSE_STEPS.length);
    } catch (err) {
      setQueryState('error');
      showToast('Failed to generate SQL. Please try again.', 'error');
    }
  }, [queryInput]);

  // ── Execute SQL ───────────────────────────────────────────────────────────
  const handleExecute = useCallback(async () => {
    if (!currentDataset?.sql) return;
    setQueryState('executing');

    try {
      const result = await executeQuery(currentDataset.sql, 'spider2_sqlite_demo');
      setCurrentDataset((prev) => ({ ...prev, ...result }));
      setQueryState('success');

      // Add to history
      const newItem = addToHistory({ ...currentDataset, prompt: queryInput, ...result });
      setHistory((prev) => [newItem, ...prev]);

      showToast(`Query completed in ${result.time}`, 'success');
    } catch (err) {
      setQueryState('error');
      showToast('Query execution failed.', 'error');
    }
  }, [currentDataset, queryInput]);

  // ── Regenerate ────────────────────────────────────────────────────────────
  const handleRegenerate = useCallback(() => {
    if (queryInput) handleSubmit(queryInput);
  }, [queryInput, handleSubmit]);

  // ── Clear ─────────────────────────────────────────────────────────────────
  const handleClear = () => {
    setQueryInput('');
    setQueryState('idle');
    setCurrentDataset(null);
    setTraceVisible(false);
    setTraceComplete(false);
    setCurrentStepIndex(-1);
  };

  // ── History actions ───────────────────────────────────────────────────────
  const handleHistoryOpen = (item) => {
    setQueryInput(item.prompt);
    handleSubmit(item.prompt);
  };

  const handleHistoryRunAgain = (item) => {
    setQueryInput(item.prompt);
    handleSubmit(item.prompt);
  };

  const handleHistoryDelete = (id) => {
    deleteHistoryItem(id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
    showToast('Query removed from history');
  };

  const handleHistoryToggleSave = (id) => {
    const updated = toggleSaved(id);
    setHistory((prev) =>
      prev.map((h) => (h.id === id ? { ...h, saved: !h.saved } : h))
    );
    showToast(updated?.saved ? 'Query saved ✓' : 'Query unsaved');
  };

  // ── Section change clears query if navigating away ────────────────────────
  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId);
    if (sectionId === 'new-query') {
      handleClear();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* Left Sidebar */}
      <DashboardSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        setView={setView}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Right column: header + scrollable content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top header */}
        <DashboardHeader
          dbStatus={dbStatus}
          activeSection={activeSection}
          onMobileMenuToggle={() => setMobileMenuOpen((o) => !o)}
        />

        {/* Scrollable main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

            {/* Welcome banner */}
            <WelcomeBanner userName="Jane" />

            {/* ── Quick stats + DB status row ─────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DbStatusCard
                  dbStatus={dbStatus}
                  onManage={() => setActiveSection('databases')}
                />
              </div>
              <div className="flex gap-3 flex-col sm:flex-row lg:flex-col">
                <StatCard
                  label="Queries Today"
                  value={history.filter(h => {
                    const d = new Date(h.createdAt);
                    return d.toDateString() === new Date().toDateString();
                  }).length || 1}
                  delta={null}
                />
                <StatCard
                  label="Total Queries"
                  value={history.length || 4}
                  delta={null}
                />
              </div>
            </div>

            {/* ── Query input ──────────────────────────────────────────── */}
            <QueryInputPanel
              value={queryInput}
              onChange={setQueryInput}
              onSubmit={handleSubmit}
              onClear={handleClear}
              queryState={queryState}
            />

            {/* ── Reasoning trace — shown while generating / after done ─ */}
            {traceVisible && (
              <ReasoningTrace
                steps={SSE_STEPS}
                currentStepIndex={currentStepIndex}
                dataset={currentDataset}
                isDone={traceComplete}
              />
            )}

            {/* ── SQL result panel — shown once SQL is generated ──────── */}
            {(queryState === 'generated' || queryState === 'executing' || queryState === 'success' || queryState === 'error') && currentDataset && (
              <SqlResultPanel
                dataset={currentDataset}
                queryState={queryState}
                onExecute={handleExecute}
                onRegenerate={handleRegenerate}
              />
            )}

            {/* ── Lower two-column: history + explorer ────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <QueryHistoryPanel
                history={history}
                onOpen={handleHistoryOpen}
                onRunAgain={handleHistoryRunAgain}
                onDelete={handleHistoryDelete}
                onToggleSave={handleHistoryToggleSave}
              />
              <DataExplorer schema={schema} />
            </div>

            {/* Breathing room at the bottom */}
            <div className="h-8" />
          </div>
        </main>
      </div>

      {/* Toast notification */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
