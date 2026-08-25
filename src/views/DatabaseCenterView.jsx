import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Database,
  LayoutDashboard,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  Table2,
  Trash2,
  UserRound,
} from 'lucide-react';
import AddConnectionModal from '../components/demo/AddConnectionModal';
import ConfirmationModal from '../components/demo/ConfirmationModal';
import ERDiagram from '../components/demo/ERDiagram';
import AIDashboardBuilder from '../components/workbench/AIDashboardBuilder';
import DatabaseHealthPanel from '../components/workbench/DatabaseHealthPanel';
import SqlWorkbench from '../components/workbench/SqlWorkbench';
import { deleteConnection, fetchCatalog, fetchConnections, testConnection } from '../services/api';

const NAV_ITEMS = [
  { id: 'workbench', label: 'SQL workbench', icon: Code2 },
  { id: 'tables', label: 'Tables and columns', icon: Table2 },
  { id: 'relationships', label: 'ER diagram', icon: Network },
  { id: 'dashboard', label: 'AI report studio', icon: LayoutDashboard },
  { id: 'health', label: 'Health agent', icon: Activity },
];

export default function DatabaseCenterView({ setView, session }) {
  const [theme] = useState(() => localStorage.getItem('slayql_theme') || 'light');
  const [connections, setConnections] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [activeSection, setActiveSection] = useState('workbench');
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState(null);
  const [notice, setNotice] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [tableFilter, setTableFilter] = useState('');
  const [previewTable, setPreviewTable] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [latestSql, setLatestSql] = useState('');

  const loadConnections = async (force = false) => {
    const items = await fetchConnections({ force });
    setConnections(items);
    if (!items.some((item) => item.id === selectedId)) {
      const defaultConnection = items.find((item) => item.is_default) || items[0];
      setSelectedId(defaultConnection?.id || null);
      setExpandedId(defaultConnection?.id || null);
    }
  };

  useEffect(() => {
    loadConnections().catch((error) => setNotice(error.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setCatalog(null);
    setNotice('');
    setLatestResult(null);
    setLatestSql('');
    fetchCatalog(selectedId).then(setCatalog).catch((error) => setNotice(error.message));
  }, [selectedId]);

  const selected = connections.find((item) => item.id === selectedId);
  const tableEntries = useMemo(() => Object.entries(catalog?.tables || {}).filter(([name]) => name.toLowerCase().includes(tableFilter.toLowerCase())), [catalog, tableFilter]);
  const totalRows = useMemo(() => Object.values(catalog?.tables || {}).reduce((sum, table) => sum + Number(table.row_count_estimate || 0), 0), [catalog]);

  const selectSource = (connection) => {
    setExpandedId((current) => current === connection.id ? null : connection.id);
    setSelectedId(connection.id);
  };

  const handleTest = async (connection) => {
    setTestingId(connection.id);
    try {
      const result = await testConnection(connection.id);
      setNotice(result.message);
      await loadConnections(true);
      if (selectedId === connection.id) {
        const freshCatalog = await fetchCatalog(connection.id, { force: true });
        setCatalog(freshCatalog);
      }
    } catch (error) {
      setNotice(error.message);
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteConnection(deleteTarget.id);
      const remaining = connections.filter((item) => item.id !== deleteTarget.id);
      setConnections(remaining);
      if (selectedId === deleteTarget.id) {
        const defaultConnection = remaining.find((item) => item.is_default) || remaining[0];
        setSelectedId(defaultConnection?.id || null);
        setExpandedId(defaultConnection?.id || null);
      }
      setDeleteTarget(null);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const openTable = (name) => {
    setPreviewTable({ name, key: Date.now() });
    setActiveSection('workbench');
  };

  return (
    <div className={`live-demo-shell theme-${theme} h-screen bg-[#f7f9fc] text-slate-900 flex flex-col overflow-hidden`}>
      <header className="h-[68px] px-4 sm:px-6 border-b border-slate-200 bg-white/95 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setView('demo')} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100" title="Back to chat"><ArrowLeft className="w-4 h-4" /></button>
          <div className="w-14 h-14 overflow-hidden bg-white p-0.5 shrink-0"><img src="/SlayQLlogo.png" alt="SlayQL" className="w-full h-full object-contain" /></div>
          <div className="min-w-0"><h1 className="text-sm font-bold text-slate-900">Database management</h1><p className="hidden sm:block text-[11px] text-slate-500 truncate">AI workbench for {session?.user?.name}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-indigo-200 bg-indigo-50 text-[10px] font-bold text-indigo-700"><Bot className="w-3.5 h-3.5" />Gemini 3.5 Flash-Lite</span>
          <button onClick={() => setView('profile')} className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600" title="Profile"><UserRound className="w-4 h-4" /></button>
          <button onClick={() => setAddOpen(true)} className="w-9 sm:w-auto h-9 sm:px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5" title="Add data source"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Add source</span></button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[294px_minmax(0,1fr)] min-h-0">
        <aside className="hidden lg:block border-r border-slate-200 bg-[#f1f4f9]/95 p-3 overflow-y-auto">
          <div className="flex items-center justify-between px-2 py-2"><p className="text-[10px] uppercase font-bold text-slate-400">Data sources</p><span className="text-[10px] text-slate-400">{connections.length}</span></div>
          {loading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mx-auto mt-8" /> : <div className="space-y-1.5">{connections.map((connection) => {
            const expanded = expandedId === connection.id;
            const active = selectedId === connection.id;
            return <div key={connection.id} className={`rounded-lg border overflow-hidden transition-all ${active ? 'bg-white border-indigo-200 shadow-sm' : 'border-transparent'}`}>
              <button onClick={() => selectSource(connection)} className={`w-full px-2.5 py-2.5 text-left transition-all ${active ? '' : 'hover:bg-slate-200/60'}`}>
                <span className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}><Database className="w-4 h-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800 truncate">{connection.name}</span><span className="block text-[10px] text-slate-400 capitalize">{connection.provider || connection.engine} / {connection.mode || 'built-in'}</span></span>
                  {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </span>
              </button>
              {expanded && active && <nav className="px-2 pb-2 space-y-0.5" aria-label={`${connection.name} tools`}>{NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} onClick={() => setActiveSection(item.id)} className={`w-full h-8 px-2 rounded-md flex items-center gap-2 text-[11px] font-semibold transition ${activeSection === item.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}><Icon className={`w-3.5 h-3.5 ${activeSection === item.id ? 'text-indigo-300' : ''}`} />{item.label}</button>;
              })}</nav>}
            </div>;
          })}</div>}
          <div className="mt-5 px-2 py-3 border-t border-slate-200"><div className="flex items-start gap-2"><div className="mt-0.5 w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="w-3.5 h-3.5" /></div><p className="text-[10px] leading-4 text-slate-500">Queries are read-only. Stored connection secrets stay encrypted and are never added to AI prompts.</p></div></div>
        </aside>

        <main className="min-w-0 overflow-y-auto">
          {!loading && !selected && <section className="min-h-full flex items-center justify-center px-6 py-16">
            <div className="max-w-sm text-center">
              <div className="mx-auto w-11 h-11 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"><Database className="w-5 h-5" /></div>
              <h2 className="mt-4 text-sm font-bold text-slate-900">No data sources</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Add a database connection for this account to begin exploring its schema.</p>
              <button onClick={() => setAddOpen(true)} className="mt-5 h-9 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5"><Plus className="w-4 h-4" />Add data source</button>
            </div>
          </section>}
          {selected && <>
            <div className="lg:hidden px-3 py-2 border-b border-slate-200 bg-[#f1f4f9]/95">
              <div className="relative">
                <Database className="absolute left-3 top-2.5 w-3.5 h-3.5 text-indigo-500 pointer-events-none" />
                <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setExpandedId(event.target.value); }} className="w-full h-9 pl-9 pr-8 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none">
                  {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
                </select>
              </div>
              <nav className="mt-2 flex gap-1 overflow-x-auto pb-1" aria-label="Database tools">{NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} onClick={() => setActiveSection(item.id)} className={`h-8 px-2.5 rounded-md inline-flex items-center gap-1.5 text-[10px] font-semibold whitespace-nowrap ${activeSection === item.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}><Icon className="w-3.5 h-3.5" />{item.label}</button>;
              })}</nav>
            </div>
            <section className="sticky top-0 z-10 px-4 sm:px-7 py-3.5 border-b border-slate-200 bg-white/95 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><Server className="w-4 h-4" /></div><div><h2 className="text-sm font-bold text-slate-900">{selected.name}</h2><div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500"><span className="capitalize">{selected.provider || selected.engine}</span><span>/</span><span>{Object.keys(catalog?.tables || {}).length || selected.table_count || 0} tables</span><span>/</span><span>{totalRows.toLocaleString()} profiled rows</span><span className={selected.status === 'error' ? 'text-red-600' : 'text-emerald-600'}>{selected.status}</span></div></div></div>
              <div className="flex items-center gap-2"><button onClick={() => handleTest(selected)} disabled={testingId === selected.id} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 disabled:opacity-50">{testingId === selected.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Test source</button>{!selected.managed_by_environment && <button onClick={() => setDeleteTarget(selected)} className="w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-red-600 hover:border-red-200 flex items-center justify-center" title="Delete data source"><Trash2 className="w-4 h-4" /></button>}</div>
            </section>

            <div className="px-4 sm:px-7 py-6 max-w-[1600px] mx-auto">
              {notice && <div className="mb-4 text-xs text-slate-600 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />{notice}</div>}
              {!catalog ? <div className="h-80 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div> : <>
                {activeSection === 'workbench' && <SqlWorkbench connectionId={selectedId} initialTable={previewTable?.name} initialTableKey={previewTable?.key} onResult={(result, sql) => { setLatestResult(result); setLatestSql(sql); }} />}
                {activeSection === 'tables' && <section>
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200"><div><h2 className="text-sm font-bold text-slate-900">Tables and columns</h2><p className="text-[11px] text-slate-500 mt-1">Browse the discovered schema, then open any table in the read-only workbench.</p></div><label className="relative"><Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" /><input value={tableFilter} onChange={(event) => setTableFilter(event.target.value)} placeholder="Filter tables" className="h-9 w-56 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-indigo-400" /></label></div>
                  <div className="divide-y divide-slate-200">{tableEntries.map(([name, table]) => <article key={name} className="py-4 flex flex-col xl:flex-row xl:items-start gap-3"><div className="xl:w-60 shrink-0"><div className="flex items-center gap-2"><Table2 className="w-3.5 h-3.5 text-indigo-500" /><p className="font-mono text-xs font-bold text-slate-800">{name}</p></div><p className="text-[10px] text-slate-400 mt-1">{Number(table.row_count_estimate || 0).toLocaleString()} rows / {table.columns?.length || 0} columns</p><button onClick={() => openTable(name)} className="mt-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-800">Preview in SQL workbench</button></div><div className="flex flex-wrap gap-1.5 min-w-0">{table.columns?.map((column) => <span key={column.name} className="px-2 py-1 rounded-md bg-slate-100 text-[10px] font-mono text-slate-600">{column.name} <span className="text-slate-400">{column.type}</span>{column.primary_key && <span className="ml-1 text-amber-600">PK</span>}</span>)}</div></article>)}</div>
                </section>}
                {activeSection === 'relationships' && <section><div className="pb-5"><h2 className="text-sm font-bold text-slate-900">Relationship map</h2><p className="text-[11px] text-slate-500 mt-1">Hover a table to isolate its foreign-key paths. Bridge tables are identified automatically.</p></div><ERDiagram catalog={catalog} isDark={theme === 'dark'} /></section>}
                {activeSection === 'dashboard' && <AIDashboardBuilder connectionId={selectedId} result={latestResult} sql={latestSql} />}
                {activeSection === 'health' && <DatabaseHealthPanel connectionId={selectedId} />}
              </>}
            </div>
          </>}
        </main>
      </div>

      <AddConnectionModal isOpen={addOpen} onClose={() => setAddOpen(false)} onConnectionAdded={(connection) => { setConnections((items) => [connection, ...items]); setSelectedId(connection.id); setExpandedId(connection.id); }} />
      <ConfirmationModal isOpen={Boolean(deleteTarget)} title="Delete data source?" message={`This removes ${deleteTarget?.name || 'this source'} and its stored credentials. Managed uploads are also removed from storage.`} confirmLabel="Delete source" onCancel={() => setDeleteTarget(null)} onConfirm={handleDelete} isWorking={deleting} />
    </div>
  );
}
