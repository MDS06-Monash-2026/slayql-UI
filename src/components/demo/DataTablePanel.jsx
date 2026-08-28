import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Table2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from 'lucide-react';

const PAGE_SIZE = 10;

export default function DataTablePanel({
  columns = [],
  rows = [],
  isTruncated,
  executionTimeMs,
  isDark = false,
}) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [filterText, setFilterText] = useState('');

  const tableScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

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

  useEffect(() => {
    const timer = setTimeout(checkScroll, 50);
    return () => clearTimeout(timer);
  }, [checkScroll, columns, pageRows]);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const handleSort = (idx) => {
    if (sortCol === idx) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(idx);
      setSortDir('asc');
    }
    setPage(0);
  };

  const handleScrollHorizontally = (direction) => {
    if (!tableScrollRef.current) return;
    const distance = 260;
    tableScrollRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
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
      <div
        className={`py-16 text-center rounded-2xl border ${
          isDark
            ? 'bg-[#1f242d] border-slate-800 text-slate-400'
            : 'bg-white border-slate-200 text-slate-400'
        }`}
      >
        <Table2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
        <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          No result rows returned
        </p>
        <p className="text-xs text-slate-400 mt-1">Execute the query to inspect returned data.</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border shadow-sm p-4 space-y-4 ${
        isDark
          ? 'bg-[#1a1e27] border-slate-800 text-slate-200'
          : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      {/* Table Toolbar */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 ${
          isDark ? 'border-slate-800' : 'border-slate-200/80'
        }`}
      >
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
              className={`pl-8 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                isDark
                  ? 'bg-slate-800/60 border-slate-700 text-slate-100 focus:bg-slate-800'
                  : 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'
              }`}
            />
          </div>
          <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            {sortedRows.length} {sortedRows.length === 1 ? 'row' : 'rows'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Horizontal Scroll Navigation Chevrons */}
          <div
            className={`flex items-center gap-1 px-1.5 py-1 rounded-xl border ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => handleScrollHorizontally('left')}
              disabled={!canScrollLeft}
              title="Scroll columns left"
              className={`p-1 rounded-lg transition-all disabled:opacity-25 disabled:cursor-not-allowed ${
                isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-1.5 select-none ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Columns
            </span>
            <button
              type="button"
              onClick={() => handleScrollHorizontally('right')}
              disabled={!canScrollRight}
              title="Scroll columns right"
              className={`p-1 rounded-lg transition-all disabled:opacity-25 disabled:cursor-not-allowed ${
                isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {executionTimeMs !== undefined && (
            <span
              className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                isDark
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              {executionTimeMs}ms
            </span>
          )}
          {isTruncated && (
            <span
              className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                isDark
                  ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              Limit 200
            </span>
          )}
          <button
            onClick={handleExportCsv}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all shadow-xs ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/80'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div
        className={`relative rounded-2xl border overflow-hidden shadow-xs ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}
      >
        <div ref={tableScrollRef} className="overflow-x-auto scroll-smooth">
          <table className="w-full text-xs">
            {/* Header row */}
            <thead
              className={`border-b ${
                isDark
                  ? 'bg-[#1a1f2b] text-slate-200 border-slate-800'
                  : 'bg-sky-50 text-sky-950 border-sky-200/80'
              }`}
            >
              <tr>
                <th
                  className={`px-3 py-3 font-bold uppercase tracking-wider text-center w-12 border-r text-[11px] ${
                    isDark ? 'text-slate-500 border-slate-800' : 'text-sky-700/70 border-sky-200/60'
                  }`}
                >
                  #
                </th>
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    onClick={() => handleSort(idx)}
                    className={`px-4 py-3 font-bold uppercase tracking-wider cursor-pointer select-none transition-all text-center border-r last:border-r-0 text-[11px] ${
                      isDark
                        ? 'text-slate-200 hover:bg-slate-800/80 border-slate-800'
                        : 'text-sky-950 hover:bg-sky-100/70 border-sky-200/60'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>{col}</span>
                      {sortCol === idx ? (
                        sortDir === 'asc' ? (
                          <ChevronUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        )
                      ) : (
                        <ChevronUp className={`w-3.5 h-3.5 opacity-40 hover:opacity-100 ${isDark ? 'text-slate-500' : 'text-sky-600/60'}`} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                isDark ? 'bg-[#181c25] divide-slate-800/80' : 'bg-white divide-slate-100'
              }`}
            >
              {pageRows.map((row, ri) => (
                <tr
                  key={ri}
                  className={`transition-colors ${
                    isDark
                      ? 'even:bg-slate-800/30 hover:bg-slate-800/60'
                      : 'even:bg-slate-50/60 hover:bg-slate-100/60'
                  }`}
                >
                  <td
                    className={`px-3 py-2.5 font-mono text-[11px] text-center border-r font-semibold ${
                      isDark ? 'text-slate-500 border-slate-800' : 'text-slate-400 border-slate-100'
                    }`}
                  >
                    {page * PAGE_SIZE + ri + 1}
                  </td>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-4 py-2.5 font-medium whitespace-nowrap text-center border-r last:border-r-0 ${
                        isDark ? 'text-slate-200 border-slate-800' : 'text-slate-800 border-slate-100'
                      }`}
                    >
                      {cell === null ? (
                        <span className={`italic font-normal ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>null</span>
                      ) : typeof cell === 'number' ? (
                        <span className={`font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{cell.toLocaleString()}</span>
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
        <div
          className={`flex items-center justify-between text-xs pt-1 ${
            isDark ? 'text-slate-400' : 'text-slate-600'
          }`}
        >
          <span className="font-medium">
            Page {page + 1} of {totalPages} ({sortedRows.length} items)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border font-semibold shadow-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border font-semibold shadow-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
