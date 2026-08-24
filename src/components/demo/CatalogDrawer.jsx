import React, { useState } from 'react';
import { Database, Key, Link2, X, ChevronRight, ChevronDown, Table2, Plus } from 'lucide-react';

export default function CatalogDrawer({ isOpen, onClose, catalog, onOpenAddTable, onOpenAddConnection }) {
  const [selectedTable, setSelectedTable] = useState('customers');

  if (!isOpen || !catalog) return null;

  const tableNames = Object.keys(catalog.tables || {});
  const activeTable = catalog.tables[selectedTable] || catalog.tables[tableNames[0]];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] slide-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Live Enterprise Schema Catalog</h2>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                  Introspected
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {catalog.database_name} • {tableNames.length} relational tables
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenAddTable && (
              <button
                onClick={onOpenAddTable}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Table</span>
              </button>
            )}

            {onOpenAddConnection && (
              <button
                onClick={onOpenAddConnection}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                <span>Add Database</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Table List Rail */}
          <div className="w-64 border-r border-slate-100 bg-slate-50/40 p-3 overflow-y-auto space-y-1">
            <div className="flex items-center justify-between px-3 py-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Tables ({tableNames.length})
              </p>
            </div>
            {tableNames.map((tbl) => {
              const info = catalog.tables[tbl];
              const isSelected = selectedTable === tbl;
              return (
                <button
                  key={tbl}
                  onClick={() => setSelectedTable(tbl)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Table2 className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate font-mono">{tbl}</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200/60 text-slate-500'
                    }`}
                  >
                    {info?.row_count_estimate ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table Columns & Detail */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5">
            {activeTable && (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 font-mono">{activeTable.name}</h3>
                    <p className="text-xs text-slate-500">
                      Estimated {activeTable.row_count_estimate} rows • {activeTable.columns.length} columns
                    </p>
                  </div>
                </div>

                {/* Columns Table */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Columns & Data Types
                  </h4>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">Name</th>
                          <th className="p-2.5">Type</th>
                          <th className="p-2.5">Constraints</th>
                          <th className="p-2.5">Grounding Sample Values</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeTable.columns.map((col, ci) => (
                          <tr key={ci} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-mono font-bold text-slate-800">{col.name}</td>
                            <td className="p-2.5 font-mono text-indigo-600">{col.type}</td>
                            <td className="p-2.5">
                              {col.primary_key ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
                                  <Key className="w-2.5 h-2.5" /> PK
                                </span>
                              ) : col.nullable ? (
                                <span className="text-slate-400 text-[10px]">nullable</span>
                              ) : (
                                <span className="text-slate-600 text-[10px] font-semibold">not null</span>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-500 font-mono text-[11px] truncate max-w-xs">
                              {col.sample_values?.length > 0 ? col.sample_values.join(', ') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Foreign Keys */}
                {activeTable.foreign_keys?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Foreign Key Graph Outlinks
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {activeTable.foreign_keys.map((fk, fki) => (
                        <div
                          key={fki}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-xs font-mono text-purple-800"
                        >
                          <Link2 className="w-3.5 h-3.5 text-purple-600" />
                          <span>
                            {fk.from_column} → <strong>{fk.to_table}.{fk.to_column}</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
