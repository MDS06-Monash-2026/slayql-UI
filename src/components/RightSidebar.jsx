import React, { useState } from 'react';
import { Database, ShieldAlert, BarChart, Download, FileText, LayoutGrid, ChevronDown, ChevronRight } from 'lucide-react';
import { MOCK_SCHEMA } from '../mock/mockData';

export default function RightSidebar({ activeDatabase, lastExecutedQuery }) {
  const [expandedTable, setExpandedTable] = useState(null);

  const handleExport = (format) => {
    if (!lastExecutedQuery) {
      alert('Run a query in the workspace first to export the dataset.');
      return;
    }
    alert(`Exporting dataset in ${format} format...`);
  };

  return (
    <aside class="w-80 bg-white border-l border-slate-200 flex flex-col h-full overflow-y-auto">
      
      {/* Active DB Connection indicator */}
      <div class="p-4 border-b border-slate-200 bg-slate-50">
        <span class="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">Active Connection</span>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></div>
          <span class="text-sm font-semibold text-slate-800">{activeDatabase || 'local_postgres_demo'}</span>
        </div>
      </div>

      {/* Database Schema Catalog */}
      <div class="p-4 border-b border-slate-200">
        <div class="flex items-center gap-2 mb-3 text-slate-700 font-semibold text-xs uppercase tracking-wider">
          <Database class="w-4 h-4 text-indigo-500" />
          <span>Catalog Schema ({MOCK_SCHEMA.tables.length} tables)</span>
        </div>
        <div class="space-y-1.5">
          {MOCK_SCHEMA.tables.map((table, i) => {
            const isExpanded = expandedTable === table.name;
            return (
              <div key={i} class="border border-slate-100 rounded-lg overflow-hidden">
                <button 
                  onClick={() => setExpandedTable(isExpanded ? null : table.name)}
                  class="w-full flex items-center justify-between p-2 text-left text-xs font-medium hover:bg-slate-50 text-slate-700"
                >
                  <span class="font-mono">{table.name}</span>
                  {isExpanded ? <ChevronDown class="w-3 h-3" /> : <ChevronRight class="w-3 h-3" />}
                </button>
                {isExpanded && (
                  <div class="px-3 py-2 bg-slate-50 border-t border-slate-100 space-y-1">
                    {table.columns.map((col, idx) => (
                      <div key={idx} class="text-[11px] font-mono text-slate-500">{col}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Execution Performance metrics */}
      <div class="p-4 border-b border-slate-200">
        <div class="flex items-center gap-2 mb-3 text-slate-700 font-semibold text-xs uppercase tracking-wider">
          <BarChart class="w-4 h-4 text-indigo-500" />
          <span>Connection Metrics</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-center">
          <div class="p-2 rounded-lg bg-slate-50 border border-slate-100">
            <span class="text-[10px] text-slate-400 block mb-0.5">Latency</span>
            <span class="text-sm font-semibold text-slate-800">{lastExecutedQuery?.time || '42ms'}</span>
          </div>
          <div class="p-2 rounded-lg bg-slate-50 border border-slate-100">
            <span class="text-[10px] text-slate-400 block mb-0.5">Rows Index</span>
            <span class="text-sm font-semibold text-slate-800">{lastExecutedQuery?.rows_count || '2.8K rows'}</span>
          </div>
        </div>
      </div>

      {/* Compliance Guardrails status */}
      <div class="p-4 border-b border-slate-200">
        <div class="flex items-center gap-2 mb-3 text-slate-700 font-semibold text-xs uppercase tracking-wider">
          <ShieldAlert class="w-4 h-4 text-indigo-500" />
          <span>Compliance Guardrails</span>
        </div>
        <div class="space-y-2 text-xs text-slate-500 leading-relaxed">
          {MOCK_SCHEMA.guardrails.map((gr, idx) => (
            <div key={idx} class="flex items-start gap-1.5">
              <span class="text-emerald-500 mt-0.5 font-bold">✓</span>
              <span>{gr}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Export tools */}
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3 text-slate-700 font-semibold text-xs uppercase tracking-wider">
          <Download class="w-4 h-4 text-indigo-500" />
          <span>Export Tools</span>
        </div>
        <div class="space-y-2">
          <button 
            onClick={() => handleExport('SQL')}
            class="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all"
          >
            <div class="flex items-center gap-2">
              <FileText class="w-4 h-4 text-indigo-500" />
              <span>Export SQL Query</span>
            </div>
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => handleExport('CSV')}
            class="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all"
          >
            <div class="flex items-center gap-2">
              <LayoutGrid class="w-4 h-4 text-indigo-500" />
              <span>Download Dataset CSV</span>
            </div>
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </aside>
  );
}
