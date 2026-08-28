import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
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
  Settings2,
  Table2,
  Trash2,
} from 'lucide-react';
import AddConnectionModal from '../components/demo/AddConnectionModal';
import ConnectionSettingsModal from '../components/demo/ConnectionSettingsModal';
import ConfirmationModal from '../components/demo/ConfirmationModal';
import ERDiagram from '../components/demo/ERDiagram';
import AIDashboardBuilder from '../components/workbench/AIDashboardBuilder';
import DatabaseHealthPanel from '../components/workbench/DatabaseHealthPanel';
import SqlWorkbench from '../components/workbench/SqlWorkbench';
import {
  deleteConnection,
  fetchCatalog,
  fetchConnections,
  refreshConnectionCatalog,
  testConnection,
} from '../services/api';
import { getClientCache } from '../services/clientCache';

const NAV_ITEMS = [
  { id: 'workbench', label: 'SQL workbench', icon: Code2 },
  { id: 'tables', label: 'Tables and columns', icon: Table2 },
  { id: 'relationships', label: 'ER diagram', icon: Network },
  { id: 'dashboard', label: 'AI report studio', icon: LayoutDashboard },
  { id: 'health', label: 'Health agent', icon: Activity },
];

// In-memory persistent cache across component unmount/remount (0ms return)
const labMemoryState = {
  connections: null,
  selectedId: null,
  expandedId: null,
  catalogs: new Map(),
  activeSection: 'workbench',
  latestResult: null,
  latestSql: '',
  previewTable: null,
};

export default function DatabaseCenterView({ setView, session, theme: propTheme, setTheme: propSetTheme }) {
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

  useEffect(() => {
    try {
      localStorage.setItem('slayql_theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch {}
  }, [theme]);
  
  const initialCachedConnections = labMemoryState.connections || getClientCache('connections', 30 * 60 * 1000) || [];
  const initialSelectedId = labMemoryState.selectedId || initialCachedConnections.find((c) => c.is_default)?.id || initialCachedConnections[0]?.id || null;
  const initialCatalog = initialSelectedId
    ? labMemoryState.catalogs.get(initialSelectedId) || getClientCache(`catalog:${initialSelectedId}`, 30 * 60 * 1000) || null
    : null;

  const [connections, setConnections] = useState(initialCachedConnections);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [expandedId, setExpandedId] = useState(labMemoryState.expandedId || initialSelectedId);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [activeSection, setActiveSection] = useState(labMemoryState.activeSection || 'workbench');
  const [loading, setLoading] = useState(initialCachedConnections.length === 0);
  const [testingId, setTestingId] = useState(null);
  const [notice, setNotice] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [tableFilter, setTableFilter] = useState('');
  const [previewTable, setPreviewTable] = useState(labMemoryState.previewTable);
  const [latestResult, setLatestResult] = useState(labMemoryState.latestResult);
  const [latestSql, setLatestSql] = useState(labMemoryState.latestSql);

  // Synchronize with module-level memory cache
  useEffect(() => {
    labMemoryState.connections = connections;
    labMemoryState.selectedId = selectedId;
    labMemoryState.expandedId = expandedId;
    labMemoryState.activeSection = activeSection;
    labMemoryState.previewTable = previewTable;
    labMemoryState.latestResult = latestResult;
    labMemoryState.latestSql = latestSql;
    if (selectedId && catalog) {
      labMemoryState.catalogs.set(selectedId, catalog);
    }
  }, [connections, selectedId, expandedId, activeSection, previewTable, latestResult, latestSql, catalog]);

  const loadConnections = async (force = false) => {
    const items = await fetchConnections({ force });
    setConnections(items);
    labMemoryState.connections = items;
    if (!items.some((item) => item.id === selectedId)) {
      const defaultConnection = items.find((item) => item.is_default) || items[0];
      const nextId = defaultConnection?.id || null;
      setSelectedId(nextId);
      setExpandedId(nextId);
    }
  };

  useEffect(() => {
    loadConnections().catch((error) => setNotice(error.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const cachedCatalog = labMemoryState.catalogs.get(selectedId) || getClientCache(`catalog:${selectedId}`, 30 * 60 * 1000);
    if (cachedCatalog) {
      setCatalog(cachedCatalog);
    }
    setNotice('');
    fetchCatalog(selectedId)
      .then((fresh) => {
        setCatalog(fresh);
        labMemoryState.catalogs.set(selectedId, fresh);
      })
      .catch((error) => {
        if (!cachedCatalog) setNotice(error.message);
      });
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

  const handleRefreshCatalog = async () => {
    if (!selectedId) return;
    setRefreshingCatalog(true);
    try {
      const freshCatalog = await refreshConnectionCatalog(selectedId);
      setCatalog(freshCatalog);
      labMemoryState.catalogs.set(selectedId, freshCatalog);
      await loadConnections(true);
      setNotice('Schema refreshed from the current data source.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setRefreshingCatalog(false);
    }
  };

  const handleConnectionUpdated = async (result) => {
    const updated = result.connection;
    if (updated) {
      setConnections((items) => items.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    }
    if (result.catalog) {
      setCatalog(result.catalog);
      labMemoryState.catalogs.set(selectedId, result.catalog);
    }
    await loadConnections(true);
    setNotice(result.message || 'Data source updated.');
  };

  const openTable = (name) => {
    setPreviewTable({ name, key: Date.now() });
    setActiveSection('workbench');
  };

  return (
    <div className={`live-demo-shell theme-${theme} h-screen bg-[#f7f9fc] dark:bg-[#0b0e14] text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden transition-colors`}>
      {/* Top Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#121622]/95 backdrop-blur-md flex items-center justify-between gap-4 shrink-0 transition-colors relative overflow-hidden">
        {/* Ambient top-left soft blue/indigo blur */}
        <div className="absolute top-0 left-0 w-44 h-14 bg-gradient-to-r from-blue-500/15 via-indigo-500/10 to-transparent blur-xl pointer-events-none" />

        <div className="flex items-center gap-2.5 min-w-0 relative z-10">
          {/* Back Button with subtle blur aura */}
          <div className="relative group flex items-center">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/30 to-indigo-500/20 rounded-xl blur-sm opacity-60 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
            <button
              onClick={() => setView('demo')}
              className="relative w-7 h-7 rounded-lg border border-blue-200/80 dark:border-indigo-800/80 bg-white/95 dark:bg-slate-800/90 hover:bg-blue-50/80 dark:hover:bg-slate-700 text-blue-600 dark:text-sky-400 flex items-center justify-center transition-all shadow-2xs active:scale-95 shrink-0"
              title="Back to SlayQL Workspace"
              aria-label="Back to SlayQL Workspace"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Database Identity Badge & Header */}
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-extrabold tracking-tight truncate flex items-center gap-1">
              <span className="text-blue-600 dark:text-sky-400">Database</span>
              <span className="text-slate-900 dark:text-slate-100 font-bold">Management</span>
            </h1>
            <p className="hidden sm:block text-[10px] text-slate-400 dark:text-slate-500 truncate">
              AI schema workbench & query studio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddOpen(true)}
            className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition-all"
            title="Add data source"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add source</span>
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[294px_minmax(0,1fr)] min-h-0">
        {/* Left SlayQL Style Sidebar */}
        <aside className="hidden lg:block border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121622] p-3 overflow-y-auto transition-colors">
          <div className="flex items-center justify-between px-2 py-2">
            <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Data sources</p>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{connections.length}</span>
          </div>

          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mx-auto mt-8" />
          ) : (
            <div className="space-y-1.5">
              {connections.map((connection) => {
                const expanded = expandedId === connection.id;
                const active = selectedId === connection.id;
                return (
                  <div
                    key={connection.id}
                    className={`rounded-xl border overflow-hidden transition-all ${
                      active 
                        ? 'bg-slate-50/80 dark:bg-slate-800/50 border-indigo-200 dark:border-indigo-900/60 shadow-2xs' 
                        : 'border-transparent'
                    }`}
                  >
                    <button
                      onClick={() => selectSource(connection)}
                      className={`w-full px-2.5 py-2.5 text-left transition-all ${
                        active ? '' : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          active 
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                          <Database className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{connection.name}</span>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500 capitalize">{connection.provider || connection.engine} / {connection.mode || 'built-in'}</span>
                        </span>
                        {expanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </span>
                    </button>
                    {expanded && active && (
                      <nav className="px-2 pb-2 space-y-0.5" aria-label={`${connection.name} tools`}>
                        {NAV_ITEMS.map((item) => {
                          const Icon = item.icon;
                          const isSectionActive = activeSection === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => setActiveSection(item.id)}
                              className={`w-full h-8 px-2 rounded-lg flex items-center gap-2 text-[11px] font-semibold transition ${
                                isSectionActive
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                              }`}
                            >
                              <Icon className={`w-3.5 h-3.5 ${isSectionActive ? 'text-white' : ''}`} />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </nav>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0 overflow-y-auto">
          {!loading && !selected && (
            <section className="min-h-full flex items-center justify-center px-6 py-16">
              <div className="max-w-sm text-center">
                <div className="mx-auto w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <h2 className="mt-4 text-sm font-bold text-slate-900 dark:text-slate-100">No data sources</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Add a database connection for this account to begin exploring its schema.
                </p>
                <button
                  onClick={() => setAddOpen(true)}
                  className="mt-5 h-9 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add data source</span>
                </button>
              </div>
            </section>
          )}

          {selected && (
            <>
              {/* Mobile View Switcher */}
              <div className="lg:hidden px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121622]">
                <div className="relative">
                  <Database className="absolute left-3 top-2.5 w-3.5 h-3.5 text-indigo-500 pointer-events-none" />
                  <select
                    value={selectedId}
                    onChange={(event) => {
                      setSelectedId(event.target.value);
                      setExpandedId(event.target.value);
                    }}
                    className="w-full h-9 pl-9 pr-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                  >
                    {connections.map((connection) => (
                      <option key={connection.id} value={connection.id}>{connection.name}</option>
                    ))}
                  </select>
                </div>
                <nav className="mt-2 flex gap-1 overflow-x-auto pb-1" aria-label="Database tools">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isSectionActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={`h-8 px-2.5 rounded-md inline-flex items-center gap-1.5 text-[10px] font-semibold whitespace-nowrap ${
                          isSectionActive
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Sub-Header with Active Database Info & Actions */}
              <section className="sticky top-0 z-10 px-4 sm:px-7 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#121622]/95 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{selected.name}</h2>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="capitalize">{selected.provider || selected.engine}</span>
                      <span>/</span>
                      <span>{Object.keys(catalog?.tables || {}).length || selected.table_count || 0} tables</span>
                      <span>/</span>
                      <span>{totalRows.toLocaleString()} profiled rows</span>
                      <span className={selected.status === 'error' ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}>
                        ● {selected.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshCatalog}
                    disabled={refreshingCatalog}
                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-200 dark:hover:text-indigo-300 dark:hover:border-indigo-800 flex items-center justify-center transition-all disabled:opacity-50"
                    title="Refresh schema"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingCatalog ? 'animate-spin' : ''}`} />
                  </button>
                  {!selected.managed_by_environment && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-200 dark:hover:text-indigo-300 dark:hover:border-indigo-800 flex items-center justify-center transition-all"
                        title={selected.engine === 'sqlite' ? 'Replace database file' : 'Edit connection'}
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(selected)}
                        className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-800 flex items-center justify-center transition-all"
                        title="Delete data source"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </section>

              {/* Main Content Workspace */}
              <div className="px-4 sm:px-7 py-6 max-w-[1600px] mx-auto">
                {notice && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{notice}</span>
                  </div>
                )}

                {!catalog ? (
                  <div className="h-80 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  </div>
                ) : (
                  <>
                    {activeSection === 'workbench' && (
                      <SqlWorkbench
                        connectionId={selectedId}
                        initialTable={previewTable?.name}
                        initialTableKey={previewTable?.key}
                        onResult={(result, sql) => {
                          setLatestResult(result);
                          setLatestSql(sql);
                        }}
                        theme={theme}
                      />
                    )}

                    {activeSection === 'tables' && (
                      <section className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                          <div>
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Tables and columns</h2>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              Browse the discovered schema, then open any table in the read-only workbench.
                            </p>
                          </div>
                          <label className="relative">
                            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                            <input
                              value={tableFilter}
                              onChange={(event) => setTableFilter(event.target.value)}
                              placeholder="Filter tables..."
                              className="h-8.5 w-56 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                            />
                          </label>
                        </div>

                        <div className="divide-y divide-slate-200 dark:divide-slate-800">
                          {tableEntries.map(([name, table]) => (
                            <article key={name} className="py-4 flex flex-col xl:flex-row xl:items-start gap-3">
                              <div className="xl:w-60 shrink-0">
                                <div className="flex items-center gap-2">
                                  <Table2 className="w-3.5 h-3.5 text-indigo-500" />
                                  <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{name}</p>
                                </div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                                  {Number(table.row_count_estimate || 0).toLocaleString()} rows / {table.columns?.length || 0} columns
                                </p>
                                <button
                                  onClick={() => openTable(name)}
                                  className="mt-2 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  Preview in SQL workbench →
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1.5 min-w-0">
                                {table.columns?.map((column) => (
                                  <span
                                    key={column.name}
                                    className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-[10px] font-mono text-slate-700 dark:text-slate-300"
                                  >
                                    {column.name}{' '}
                                    <span className="text-slate-400 dark:text-slate-500 text-[9px]">{column.type}</span>
                                    {column.primary_key && (
                                      <span className="ml-1 text-amber-600 dark:text-amber-400 font-bold">PK</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    )}

                    {activeSection === 'relationships' && (
                      <section>
                        <div className="pb-4">
                          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Relationship map</h2>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Hover a table to isolate its foreign-key paths. Bridge tables are identified automatically.
                          </p>
                        </div>
                        <ERDiagram catalog={catalog} isDark={isDark} />
                      </section>
                    )}

                    {activeSection === 'dashboard' && (
                      <AIDashboardBuilder connectionId={selectedId} result={latestResult} sql={latestSql} isDark={isDark} />
                    )}

                    {activeSection === 'health' && (
                      <DatabaseHealthPanel connectionId={selectedId} isDark={isDark} />
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <AddConnectionModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onConnectionAdded={(connection) => {
          setConnections((items) => [connection, ...items]);
          setSelectedId(connection.id);
          setExpandedId(connection.id);
        }}
      />
      <ConnectionSettingsModal
        connection={selected}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUpdated={handleConnectionUpdated}
        theme={theme}
      />
      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        title="Delete data source?"
        message={`This removes ${deleteTarget?.name || 'this source'} and its stored credentials. Managed uploads are also removed from storage.`}
        confirmLabel="Delete source"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isWorking={deleting}
      />
    </div>
  );
}
