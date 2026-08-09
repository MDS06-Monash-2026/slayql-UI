import React, { useState, useEffect, useCallback } from 'react';

// ─── Dashboard-specific components ───────────────────────────────────────────
import DashboardSidebar    from '../components/dashboard/DashboardSidebar';
import DashboardHeader     from '../components/dashboard/DashboardHeader';
import DataExplorer        from '../components/dashboard/DataExplorer';
import QueryHistoryPanel   from '../components/dashboard/QueryHistoryPanel';
import WorkspaceHome       from '../components/dashboard/WorkspaceHome';
import DatabasesSection    from '../components/dashboard/DatabasesSection';

// ─── API / service layer ──────────────────────────────────────────────────────
import { generateSql, executeQuery } from '../lib/api/query';
import { getDbStatus, getSchema }    from '../lib/api/database';
import { getHistory, addToHistory, deleteHistoryItem } from '../lib/api/history';
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

// ─── DashboardView ─────────────────────────────────────────────────────────────

export default function DashboardView({ setView, activeDatabase, setActiveDatabase }) {
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
  const [submittedPrompt,  setSubmittedPrompt]  = useState('');
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
    const dbName = 
      activeDatabase === 'sqlite' || activeDatabase === 'spider2_sqlite_demo' || activeDatabase === 'local_postgres_demo' ? 'Spider2 / SQLite' : 
      activeDatabase === 'bigquery' ? 'BigQuery' : 
      activeDatabase === 'snowflake' ? 'Snowflake' : activeDatabase;
      
    setDbStatus({ id: activeDatabase, name: dbName });
    
    getSchema('spider2_sqlite_demo').then(setSchema);
    getHistory().then(setHistory);
  }, [activeDatabase]);

  // ── Submit query (NL → SQL) ───────────────────────────────────────────────
  const handleSubmit = useCallback(async (promptOverride) => {
    const prompt = (promptOverride ?? queryInput).trim();
    if (!prompt) return;

    setQueryInput(''); // Clear input for the next follow-up
    setSubmittedPrompt(prompt);
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
    if (submittedPrompt) handleSubmit(submittedPrompt);
  }, [submittedPrompt, handleSubmit]);

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
    setActiveSection('home');
    setQueryInput(item.prompt);
    handleSubmit(item.prompt);
  };

  const handleHistoryRunAgain = (item) => {
    setActiveSection('home');
    setQueryInput(item.prompt);
    handleSubmit(item.prompt);
  };

  const handleHistoryDelete = (id) => {
    deleteHistoryItem(id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
    showToast('Query removed from history');
  };

  // ── Section change ────────────────────────
  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId);
  };

  const handleManageDatabases = () => {
    setActiveSection('databases');
  };
  
  const handleDatabaseSelect = (dbId) => {
    if (setActiveDatabase) setActiveDatabase(dbId);
    showToast(`Connected to ${dbId}`, 'success');
  };

  // ── Render main content based on section ──────────────────────────────────
  const renderMainContent = () => {
    if (activeSection === 'home') {
      return (
        <WorkspaceHome
          userName="Jane"
          dbStatus={dbStatus}
          queryInput={queryInput}
          setQueryInput={setQueryInput}
          submittedPrompt={submittedPrompt}
          queryState={queryState}
          currentDataset={currentDataset}
          currentStepIndex={currentStepIndex}
          traceVisible={traceVisible}
          traceComplete={traceComplete}
          recentHistory={history.slice(0, 5)}
          handleSubmit={handleSubmit}
          handleClear={handleClear}
          handleExecute={handleExecute}
          handleRegenerate={handleRegenerate}
          onManageDatabases={handleManageDatabases}
          onHistoryOpen={handleHistoryOpen}
          setActiveDatabase={handleDatabaseSelect}
        />
      );
    }
    
    if (activeSection === 'history') {
      return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Query History</h2>
          <QueryHistoryPanel
            history={history}
            onOpen={handleHistoryOpen}
            onRunAgain={handleHistoryRunAgain}
            onDelete={handleHistoryDelete}
            maxItems={50} // show more items on the dedicated page
          />
        </div>
      );
    }
    
    if (activeSection === 'databases') {
      return (
        <DatabasesSection 
          activeDatabase={activeDatabase || 'sqlite'} 
          onConnect={handleDatabaseSelect} 
        />
      );
    }

    if (activeSection === 'explorer') {
      return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Data Explorer</h2>
          <DataExplorer schema={schema} />
        </div>
      );
    }

    // Default fallback
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <h2 className="text-xl font-semibold mb-2">Section under construction</h2>
        <p className="text-sm">This section is not implemented yet.</p>
      </div>
    );
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
          {renderMainContent()}
        </main>
      </div>

      {/* Toast notification */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
