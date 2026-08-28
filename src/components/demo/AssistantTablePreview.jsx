import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Table2,
} from 'lucide-react';

const PAGE_SIZE = 8;

export default function AssistantTablePreview({
  columns = [],
  rows = [],
  rowCount,
  isTruncated = false,
  isDark = false,
}) {
  const [page, setPage] = useState(0);
  const tableContainerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const totalRows = rows.length;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE) || 1;
  const currentRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const checkScroll = useCallback(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const timer = setTimeout(checkScroll, 50);
    return () => clearTimeout(timer);
  }, [checkScroll, columns, currentRows]);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const handleScrollHorizontally = (direction) => {
    if (!tableContainerRef.current) return;
    const distance = 240;
    tableContainerRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  if (!columns || columns.length === 0) return null;

  return (
    <div
      className={`rounded-2xl border shadow-xs overflow-hidden transition-all ${
        isDark
          ? 'bg-[#181c25] border-slate-800 text-slate-200'
          : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      {/* Table Sub-Header / Controls Bar */}
      <div
        className={`flex items-center justify-between px-3.5 py-2 border-b text-xs ${
          isDark ? 'bg-[#141720] border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center font-bold shadow-xs ${
              isDark
                ? 'bg-indigo-950/60 border border-indigo-800/60 text-indigo-400'
                : 'bg-indigo-50 border border-indigo-200 text-indigo-600'
            }`}
          >
            <Table2 className="w-3 h-3" />
          </div>
          <span className={`text-xs font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
            Query Results
          </span>
          <span
            className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
              isDark
                ? 'bg-slate-800 text-slate-300 border-slate-700'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {totalRows} {totalRows === 1 ? 'row' : 'rows'}
            {isTruncated ? ', limited' : ''}
          </span>
        </div>

        {/* Horizontal Column Navigation Chevrons */}
        <div className="flex items-center gap-1.5">
          <div
            className={`flex items-center gap-0.5 px-1 py-0.5 rounded-lg border ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => handleScrollHorizontally('left')}
              disabled={!canScrollLeft}
              title="Scroll columns left"
              className={`p-1 rounded-md transition-all disabled:opacity-25 disabled:cursor-not-allowed ${
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
              className={`p-1 rounded-md transition-all disabled:opacity-25 disabled:cursor-not-allowed ${
                isDark
                  ? 'text-slate-300 hover:text-white hover:bg-slate-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Scroll Container */}
      <div ref={tableContainerRef} className="overflow-x-auto scroll-smooth">
        <table className="min-w-full text-xs">
          {/* Header Row */}
          <thead
            className={`border-b ${
              isDark
                ? 'bg-[#1a1f2b] text-slate-200 border-slate-800'
                : 'bg-sky-50 text-sky-950 border-sky-200/80'
            }`}
          >
            <tr>
              <th
                className={`px-3 py-2.5 font-bold uppercase tracking-wider text-center w-10 border-r text-[11px] ${
                  isDark
                    ? 'text-slate-500 border-slate-800'
                    : 'text-sky-700/70 border-sky-200/60'
                }`}
              >
                #
              </th>
              {columns.map((column, colIdx) => (
                <th
                  key={colIdx}
                  className={`px-4 py-2.5 text-center font-bold uppercase tracking-wider whitespace-nowrap border-r last:border-r-0 text-[11px] ${
                    isDark
                      ? 'text-slate-200 border-slate-800'
                      : 'text-sky-950 border-sky-200/60'
                  }`}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          {/* Body Rows */}
          <tbody
            className={`divide-y ${
              isDark
                ? 'bg-[#181c25] divide-slate-800/80'
                : 'bg-white divide-slate-100'
            }`}
          >
            {currentRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`transition-colors ${
                  isDark
                    ? 'even:bg-slate-800/30 hover:bg-slate-800/60'
                    : 'even:bg-slate-50/60 hover:bg-slate-100/60'
                }`}
              >
                <td
                  className={`px-3 py-2 font-mono text-[10px] text-center border-r font-semibold ${
                    isDark
                      ? 'text-slate-500 border-slate-800'
                      : 'text-slate-400 border-slate-100'
                  }`}
                >
                  {page * PAGE_SIZE + rowIndex + 1}
                </td>
                {columns.map((column, colIndex) => {
                  const cell = row[colIndex];
                  return (
                    <td
                      key={`${column}-${colIndex}`}
                      className={`px-4 py-2 text-center font-medium whitespace-nowrap border-r last:border-r-0 ${
                        isDark
                          ? 'text-slate-200 border-slate-800'
                          : 'text-slate-800 border-slate-100'
                      }`}
                    >
                      {cell === null ? (
                        <span className={`italic font-normal ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                          null
                        </span>
                      ) : typeof cell === 'number' ? (
                        <span className={`font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          {cell.toLocaleString()}
                        </span>
                      ) : (
                        String(cell ?? '')
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div
          className={`flex items-center justify-between px-3.5 py-2 border-t text-[11px] ${
            isDark ? 'bg-[#141720] border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}
        >
          <span className="font-medium">
            Page {page + 1} of {totalPages} ({totalRows} total)
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={`inline-flex items-center gap-0.5 px-2.5 py-1 rounded-lg border font-semibold shadow-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className={`inline-flex items-center gap-0.5 px-2.5 py-1 rounded-lg border font-semibold shadow-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
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
