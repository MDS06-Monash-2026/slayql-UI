import React, { useState, useMemo } from 'react';
import {
  Table2,
  ChevronUp,
  ChevronDown,
  Download,
  Search,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';

const PAGE_SIZE = 10;

export default function DataTablePanel({ columns = [], rows = [], isTruncated, executionTimeMs }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [filterText, setFilterText] = useState('');

  // Filter & Sort
  const filteredRows = useMemo(() => {
    if (!filterText.trim()) return rows;
    const lower = filterText.toLowerCase();
    return rows.filter((r) => r.some((val) => String(val).toLowerCase().includes(lower)));
  }, [rows, filterText]);

  const sortedRows = useMemo(() => {
    if (sortCol === null) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      const na = parseFloat(va);
      const nb = parseFloat(vb);
      const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredRows, sortCol, sortDir]);

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE) || 1;
  const pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (idx) => {
    if (sortCol === idx) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(idx);
      setSortDir('asc');
    }
    setPage(0);
  };

  const handleExportCsv = () => {
    if (!rows.length) return;
    const csvContent = [
      columns.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `slayql_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!rows || rows.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
        <Table2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
        <p className="text-sm font-semibold text-slate-700">No result rows returned</p>
        <p className="text-xs text-slate-400 mt-1">Execute the query to inspect returned data.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 space-y-4">
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => {
                setFilterText(e.target.value);
                setPage(0);
              }}
              placeholder="Filter in results..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
            />
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {sortedRows.length} {sortedRows.length === 1 ? 'row' : 'rows'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {executionTimeMs !== undefined && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
              {executionTimeMs}ms execution
            </span>
          )}
          {isTruncated && (
            <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold">
              Truncated (200 limit)
            </span>
          )}
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 font-bold text-slate-400 uppercase tracking-wider w-10">#</th>
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    onClick={() => handleSort(idx)}
                    className="px-3 py-2.5 font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100/80 select-none transition-all"
                  >
                    <div className="flex items-center gap-1">
                      <span>{col}</span>
                      {sortCol === idx ? (
                        sortDir === 'asc' ? (
                          <ChevronUp className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-indigo-600" />
                        )
                      ) : (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-3 py-2.5 text-slate-400 font-mono text-[11px]">{page * PAGE_SIZE + ri + 1}</td>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">
                      {cell === null ? (
                        <span className="text-slate-300 italic">null</span>
                      ) : typeof cell === 'number' ? (
                        <span className="font-mono text-slate-900">{cell.toLocaleString()}</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 font-semibold"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 font-semibold"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
