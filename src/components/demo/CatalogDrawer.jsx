import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Database, Key, Link2, Lock, MessageSquarePlus, Plus, Search, Table2, X } from 'lucide-react';

// Schema catalog as a side panel: find a table or column, see its columns with real sample
// values, follow its relationships both ways, and start a question about it. The shared demo
// database is read-only, so adding tables is offered only on the user's own sources.

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : n ?? '0');

function typeTone(type, isDark) {
  const t = String(type || '').toUpperCase();
  if (/INT|REAL|NUM|DEC|FLOAT|DOUBLE/.test(t)) return isDark ? 'bg-sky-500/15 text-sky-300' : 'bg-sky-50 text-sky-700';
  if (/DATE|TIME/.test(t)) return isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700';
  if (/BOOL/.test(t)) return isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700';
  return isDark ? 'bg-slate-700/60 text-slate-300' : 'bg-slate-100 text-slate-600';
}

export default function CatalogDrawer({
  isOpen, onClose, catalog, onOpenAddTable, onOpenAddConnection, readOnly = false, isDark = false, onAskAbout,
}) {
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const tables = catalog?.tables || {};
  const names = useMemo(() => Object.keys(tables).sort(), [tables]);

  // Relationships pointing at each table (the reverse of foreign keys).
  const incoming = useMemo(() => {
    const map = {};
    for (const name of names) {
      for (const fk of tables[name]?.foreign_keys || []) {
        (map[fk.to_table] ||= []).push({ table: name, column: fk.from_column, to_column: fk.to_column });
      }
    }
    return map;
  }, [names, tables]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return names.map((name) => ({ name, columns: [] }));
    return names
      .map((name) => ({ name, columns: (tables[name]?.columns || []).filter((c) => c.name.toLowerCase().includes(q)).map((c) => c.name) }))
      .filter((m) => m.name.toLowerCase().includes(q) || m.columns.length);
  }, [names, tables, query]);

  if (!isOpen || !catalog) return null;
  // The detail follows the search: a selected table hidden by the search gives way to the first match.
  const visible = matches.some((m) => m.name === selected);
  const activeName = tables[selected] && visible ? selected : matches[0]?.name || (query ? null : names[0]);
  const active = tables[activeName];
  const totalColumns = names.reduce((sum, n) => sum + (tables[n]?.columns?.length || 0), 0);
  const fkColumns = new Set((active?.foreign_keys || []).map((fk) => fk.from_column));
  const tone = {
    panel: isDark ? 'bg-[#121622] text-slate-100' : 'bg-white text-slate-900',
    border: isDark ? 'border-slate-800' : 'border-slate-200',
    muted: isDark ? 'text-slate-400' : 'text-slate-500',
    strong: isDark ? 'text-slate-100' : 'text-slate-900',
    hover: isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50',
    soft: isDark ? 'bg-white/5' : 'bg-slate-50',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px] animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Schema catalog"
        className={`flex h-full w-full max-w-5xl flex-col border-l shadow-[-30px_0_80px_-40px_rgba(15,23,42,0.5)] ${tone.panel} ${tone.border}`}
      >
        {/* header */}
        <header className={`flex items-start justify-between gap-4 border-b px-6 py-4 ${tone.border}`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isDark ? 'bg-indigo-500/15 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
              <Database className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className={`flex flex-wrap items-center gap-2 text-base font-semibold ${tone.strong}`}>
                {catalog.database_name || 'Schema catalog'}
                {readOnly && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                    <Lock className="h-3 w-3" aria-hidden="true" /> Read-only demo
                  </span>
                )}
              </h2>
              <p className={`text-xs ${tone.muted}`}>{catalog.engine || 'database'} · {names.length} tables · {fmt(totalColumns)} columns</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!readOnly && onOpenAddTable && (
              <button type="button" onClick={onOpenAddTable} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add table
              </button>
            )}
            {onOpenAddConnection && (
              <button type="button" onClick={onOpenAddConnection} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${tone.border} ${tone.hover} ${tone.strong}`}>
                <Database className="h-3.5 w-3.5" aria-hidden="true" /> Connect a database
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close catalog" className={`rounded-xl p-2 transition ${tone.muted} ${tone.hover}`}>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* table list with search */}
          <nav className={`flex max-h-56 shrink-0 flex-col border-b md:max-h-none md:w-72 md:border-b-0 md:border-r ${tone.border}`} aria-label="Tables">
            <div className="p-3">
              <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${tone.border} ${tone.soft}`}>
                <Search className={`h-4 w-4 ${tone.muted}`} aria-hidden="true" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a table or column"
                  aria-label="Find a table or column"
                  className={`min-w-0 flex-1 bg-transparent text-[13px] outline-none ${tone.strong} ${isDark ? 'placeholder-slate-500' : 'placeholder-slate-400'}`}
                />
              </label>
            </div>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
              {matches.length === 0 && <li className={`px-3 py-4 text-center text-xs ${tone.muted}`}>Nothing matches "{query}"</li>}
              {matches.map(({ name, columns }) => {
                const on = name === activeName;
                return (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => setSelected(name)}
                      aria-current={on ? 'true' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${on ? (isDark ? 'bg-indigo-500/15' : 'bg-indigo-50') : tone.hover}`}
                    >
                      <Table2 className={`h-4 w-4 shrink-0 ${on ? (isDark ? 'text-indigo-300' : 'text-indigo-600') : tone.muted}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-mono text-[13px] ${on ? (isDark ? 'text-indigo-200' : 'text-indigo-900') : tone.strong}`}>{name}</span>
                        {columns.length > 0 && <span className={`block truncate text-[11px] ${tone.muted}`}>{columns.join(', ')}</span>}
                      </span>
                      <span className={`shrink-0 text-[11px] tabular-nums ${tone.muted}`}>{fmt(tables[name]?.row_count_estimate)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* table detail */}
          {active && (
            <section className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className={`font-mono text-xl font-semibold ${tone.strong}`}>{active.name}</h3>
                  <p className={`mt-0.5 text-sm ${tone.muted}`}>
                    {fmt(active.row_count_estimate)} rows · {active.columns.length} columns
                    {active.description ? ` · ${active.description}` : ''}
                  </p>
                </div>
                {onAskAbout && (
                  <button
                    type="button"
                    onClick={() => onAskAbout(active.name)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${isDark ? 'bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" /> Ask about this table
                  </button>
                )}
              </div>

              {/* relationships, both ways */}
              {((active.foreign_keys || []).length > 0 || (incoming[active.name] || []).length > 0) && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    { title: 'Links to', icon: ArrowRight, items: (active.foreign_keys || []).map((fk) => ({ table: fk.to_table, label: `${fk.from_column} → ${fk.to_table}.${fk.to_column}` })) },
                    { title: 'Linked from', icon: ArrowLeft, items: (incoming[active.name] || []).map((r) => ({ table: r.table, label: `${r.table}.${r.column} → ${r.to_column}` })) },
                  ].map(({ title, icon: Icon, items }) => items.length > 0 && (
                    <div key={title} className={`rounded-2xl p-3 ${tone.soft}`}>
                      <p className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${tone.muted}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /> {title}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => { setSelected(item.table); setQuery(''); }}
                            title={`Open ${item.table}`}
                            className={`rounded-lg border px-2 py-1 font-mono text-[11px] transition ${isDark ? 'border-slate-700 bg-[#121622] text-slate-200 hover:border-indigo-500/60' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* columns */}
              <ul className={`mt-5 divide-y rounded-2xl border ${tone.border} ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {active.columns.map((col) => (
                  <li key={col.name} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 items-center gap-2 sm:w-64 sm:shrink-0">
                      <span className={`truncate font-mono text-[13px] font-semibold ${tone.strong}`}>{col.name}</span>
                      {col.primary_key && (
                        <span title="Primary key" className={`inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[10px] font-semibold ${isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                          <Key className="h-2.5 w-2.5" aria-hidden="true" /> key
                        </span>
                      )}
                      {fkColumns.has(col.name) && (
                        <span title="Links to another table" className={`inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[10px] font-semibold ${isDark ? 'bg-violet-500/15 text-violet-300' : 'bg-violet-50 text-violet-700'}`}>
                          <Link2 className="h-2.5 w-2.5" aria-hidden="true" /> link
                        </span>
                      )}
                    </div>
                    <span className={`w-fit shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium ${typeTone(col.type, isDark)}`}>{col.type || 'TEXT'}</span>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {(col.sample_values || []).slice(0, 5).map((v, i) => (
                        <span key={`${v}-${i}`} className={`max-w-[12rem] truncate rounded-md px-1.5 py-0.5 text-[11px] ${tone.soft} ${tone.muted}`}>{String(v)}</span>
                      ))}
                      {!(col.sample_values || []).length && <span className={`text-[11px] ${tone.muted}`}>No sample values</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
