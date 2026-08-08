import React, { useState } from 'react';
import { Database, ChevronRight, ChevronDown, Table2, Key, Link, Search } from 'lucide-react';

// ─── Column type badge ────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const color =
    type === 'TEXT'    ? 'bg-blue-50 text-blue-600 border-blue-200' :
    type === 'INTEGER' ? 'bg-amber-50 text-amber-700 border-amber-200' :
    type === 'REAL'    ? 'bg-purple-50 text-purple-700 border-purple-200' :
    type === 'JSON'    ? 'bg-teal-50 text-teal-700 border-teal-200' :
                         'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-mono font-semibold ${color}`}>
      {type}
    </span>
  );
}

// ─── Single table row ─────────────────────────────────────────────────────────

function TableNode({ table, isExpanded, onToggle }) {
  const rowsFormatted = table.rowCount >= 1_000_000
    ? `${(table.rowCount / 1_000_000).toFixed(1)}M rows`
    : table.rowCount >= 1_000
    ? `${(table.rowCount / 1_000).toFixed(0)}K rows`
    : `${table.rowCount} rows`;

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-white hover:bg-slate-50 transition-all"
      >
        <Table2 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
        <span className="flex-1 text-xs font-semibold text-slate-700 font-mono truncate">
          {table.name}
        </span>
        <span className="text-[10px] text-slate-400 mr-1 hidden sm:block">{rowsFormatted}</span>
        {isExpanded
          ? <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
        }
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50">
          {table.columns.map((col, ci) => (
            <div key={ci} className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-100 last:border-0">
              {/* PK / FK icons */}
              {col.isPrimaryKey && (
                <Key className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" title="Primary Key" />
              )}
              {col.isForeignKey && !col.isPrimaryKey && (
                <Link className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" title="Foreign Key" />
              )}
              {!col.isPrimaryKey && !col.isForeignKey && (
                <span className="w-2.5 flex-shrink-0" />
              )}
              <span className="flex-1 text-[11px] font-mono text-slate-700 truncate">{col.name}</span>
              <TypeBadge type={col.type} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DataExplorer ─────────────────────────────────────────────────────────────

export default function DataExplorer({ schema }) {
  const [expandedTable, setExpandedTable] = useState(null);
  const [searchTerm, setSearchTerm]       = useState('');

  if (!schema) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse space-y-2">
        <div className="h-4 bg-slate-100 rounded w-1/2" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 bg-slate-100 rounded" />
        ))}
      </div>
    );
  }

  const filteredTables = schema.tables.filter((t) =>
    !searchTerm || t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.columns.some((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <Database className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800">{schema.name}</p>
          <p className="text-[10px] text-slate-400">{schema.tables.length} tables</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tables and columns…"
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
          />
        </div>
      </div>

      {/* Table list */}
      <div className="p-3 space-y-1.5 max-h-72 overflow-y-auto">
        {filteredTables.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No tables match "{searchTerm}"</p>
        ) : (
          filteredTables.map((table) => (
            <TableNode
              key={table.name}
              table={table}
              isExpanded={expandedTable === table.name}
              onToggle={() =>
                setExpandedTable(expandedTable === table.name ? null : table.name)
              }
            />
          ))
        )}
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center gap-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><Key className="w-2.5 h-2.5 text-amber-500" /> PK</span>
        <span className="flex items-center gap-1"><Link className="w-2.5 h-2.5 text-blue-400" /> FK</span>
      </div>
    </div>
  );
}
