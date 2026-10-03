import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  Database,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Table2,
  Trash2,
} from 'lucide-react';
import AddConnectionModal from '../components/demo/AddConnectionModal';
import ConnectionSettingsModal from '../components/demo/ConnectionSettingsModal';
import ConfirmationModal from '../components/demo/ConfirmationModal';
import ERDiagram from '../components/demo/ERDiagram';
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
  { id: 'workbench', label: 'SQL workbench', icon: Code2, hint: 'Write SQL yourself or let AI draft it, then run it on this data source.' },
  { id: 'tables', label: 'Tables', icon: Table2, hint: 'Every table and column, with row counts and types.' },
  { id: 'relationships', label: 'ER diagram', icon: Network, hint: 'How the tables link to each other through their keys.' },
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

const VALID_SECTIONS = ['workbench', 'tables', 'relationships'];

function getInitialLabSection() {
  const path = (window.location.pathname || '').toLowerCase().replace(/\/+$/, '');
  const hash = (window.location.hash || '').replace(/^#\/?/, '').toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const queryTab = searchParams.get('tab') || searchParams.get('section');
  if (queryTab && VALID_SECTIONS.includes(queryTab)) {
    return queryTab;
  }
  const combined = `${path}/${hash}`;
  if (combined.includes('/tables') || combined.includes('tables')) return 'tables';
  if (combined.includes('/relationships') || combined.includes('relationships') || combined.includes('/er-diagram') || combined.includes('er-diagram')) return 'relationships';
  if (combined.includes('/workbench') || combined.includes('workbench')) return 'workbench';
  return VALID_SECTIONS.includes(labMemoryState.activeSection) ? labMemoryState.activeSection : 'workbench';
}

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
  const [activeSection, setActiveSection] = useState(() => getInitialLabSection());
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
  const changeSection = (nextSection) => {
    if (nextSection === activeSection) return;
    setActiveSection(nextSection);
    const targetSlug = `/database-lab/${nextSection}`;
    if (window.location.pathname !== targetSlug) {
      try {
        window.history.pushState({ section: nextSection }, '', targetSlug);
      } catch {}
    }
  };

  // Synchronize on browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const section = getInitialLabSection();
      setActiveSection(section);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  const activeItem = NAV_ITEMS.find((item) => item.id === activeSection) || NAV_ITEMS[0];

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
    <div className={`live-demo-shell theme-${theme} h-screen bg-[#f8fafc] dark:bg-[#0b0e16] text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden transition-colors`}>
      {/* Top navbar: way back, brand, the five tools, add a source */}
      <header className="shrink-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md transition-colors dark:border-slate-800 dark:bg-[#0f131d]/90">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:h-16 lg:flex-nowrap lg:py-0">
          <button
            type="button"
            onClick={() => setView('demo')}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back to chat</span>
          </button>
          <span className="h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          <span className="flex items-center gap-2">
            <span className="slayql-logo text-[22px] tracking-tight"><span className="slay">Slay</span><span className="ql">QL</span></span>
            <span className="rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Lab</span>
          </span>

          <nav
            aria-label="Database tools"
            className="order-last flex w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 lg:order-none lg:mx-auto lg:w-auto dark:bg-slate-800/70"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const on = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.hint}
                  aria-current={on ? 'page' : undefined}
                  onClick={() => changeSection(item.id)}
                  className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                    on
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${on ? 'text-indigo-600 dark:text-indigo-300' : ''}`} aria-hidden="true" />
                  <span>{item.label}</span>
                  {on && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600" aria-hidden="true" />}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.8)] transition hover:brightness-110 active:scale-95 lg:ml-0"
            title="Add data source"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add source</span>
          </button>
        </div>
      </header>

      <main className="review-page min-w-0 flex-1 overflow-y-auto dark:bg-[#0b0e16]">
          {loading && !selected && (
            <div className="flex h-80 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            </div>
          )}

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
              {/* Title band: compact, so the tool below gets the room */}
              <div className="mx-auto max-w-[1600px] px-4 pt-3 sm:px-7">
                <section className="review-hero relative overflow-hidden rounded-2xl border border-indigo-100/80 px-4 py-3 sm:px-5 dark:border-indigo-500/20">
                  <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                        <h1 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{activeItem.label}</h1>
                        <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-700 dark:text-indigo-300">
                          <Sparkles className="h-3 w-3" aria-hidden="true" /> AI Database Lab
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">{activeItem.hint}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex max-w-full items-center gap-2 rounded-xl bg-white/80 px-2.5 py-1.5 text-sm shadow-sm ring-1 ring-white dark:bg-white/5 dark:ring-white/10">
                        <Database className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
                        <span className="sr-only">Data source</span>
                        <select
                          value={selectedId}
                          onChange={(event) => {
                            setSelectedId(event.target.value);
                            setExpandedId(event.target.value);
                          }}
                          className="lab-source-select min-w-0 max-w-[14rem] truncate bg-transparent pr-1 text-[13px] font-medium text-slate-900 outline-none dark:text-slate-100 [&>option]:text-slate-900"
                        >
                          {connections.map((connection) => (
                            <option key={connection.id} value={connection.id}>{connection.name}</option>
                          ))}
                        </select>
                      </label>
                      <span
                        title={`${selected.provider || selected.engine} / ${selected.mode || 'built-in'}`}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                          selected.status === 'error'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${selected.status === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`} aria-hidden="true" />
                        {selected.status}
                      </span>
                      {selected.managed_by_environment && (
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10">Read-only demo</span>
                      )}
                      <span className="hidden h-5 w-px bg-indigo-200/70 sm:block dark:bg-white/10" aria-hidden="true" />
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        <b className="font-semibold tabular-nums text-slate-950 dark:text-white">{(Object.keys(catalog?.tables || {}).length || selected.table_count || 0).toLocaleString()}</b> tables
                        <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                        <b className="font-semibold tabular-nums text-slate-950 dark:text-white">{totalRows.toLocaleString()}</b> rows
                      </span>
                      <div className="flex items-center gap-0.5 rounded-xl bg-white/80 p-0.5 shadow-sm ring-1 ring-white dark:bg-white/5 dark:ring-white/10">
                        <button
                          type="button"
                          onClick={handleRefreshCatalog}
                          disabled={refreshingCatalog}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
                          title="Refresh schema"
                          aria-label="Refresh schema"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${refreshingCatalog ? 'animate-spin' : ''}`} />
                        </button>
                        {!selected.managed_by_environment && (
                          <>
                            <button
                              type="button"
                              onClick={() => setSettingsOpen(true)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
                              title={selected.engine === 'sqlite' ? 'Replace database file' : 'Edit connection'}
                              aria-label={selected.engine === 'sqlite' ? 'Replace database file' : 'Edit connection'}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(selected)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15"
                              title="Delete data source"
                              aria-label="Delete data source"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Main Content Workspace */}
              <div className="px-4 sm:px-7 pt-4 pb-6 max-w-[1600px] mx-auto">
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

                  </>
                )}
              </div>
            </>
          )}
      </main>

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
