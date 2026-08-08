import React, { useState, useMemo } from 'react';
import {
  Code, Table2, BarChart3, Copy, Check, Play, RefreshCw, ChevronUp, ChevronDown,
  FileCheck2, AlertCircle, Loader2, BarChart2, LineChart, PieChart
} from 'lucide-react';
import {
  BarChart, Bar, LineChart as RLineChart, Line,
  PieChart as RPieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { SQL_KEYWORDS } from '../../mock/mockData';

// ─── Colour palette for charts ───────────────────────────────────────────────

const CHART_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ─── SQL syntax highlighter ───────────────────────────────────────────────────

function highlightSQL(sql) {
  if (!sql) return '';
  const kwPattern = SQL_KEYWORDS
    .slice().sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const tokenRe = new RegExp(
    `(--[^\\n]*)|('(?:[^'\\\\]|\\\\.)*')|(\\b(?:${kwPattern})\\b)|(\\b\\d+(?:\\.\\d+)?\\b)`,
    'gi'
  );
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = tokenRe.exec(sql)) !== null) {
    if (match.index > lastIndex) parts.push(sql.slice(lastIndex, match.index));
    const [, comment, str, kw, num] = match;
    if (comment) parts.push(<span key={parts.length} className="sql-cmt">{comment}</span>);
    else if (str) parts.push(<span key={parts.length} className="sql-str">{str}</span>);
    else if (kw)  parts.push(<span key={parts.length} className="sql-kw">{kw}</span>);
    else if (num) parts.push(<span key={parts.length} className="sql-num">{num}</span>);
    lastIndex = tokenRe.lastIndex;
  }
  if (lastIndex < sql.length) parts.push(sql.slice(lastIndex));
  return <code className="font-mono whitespace-pre-wrap leading-relaxed block text-sm">{parts}</code>;
}

// ─── SQL panel ───────────────────────────────────────────────────────────────

function SqlPanel({ sql, onExecute, onRegenerate, isExecuting }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-3">
      {/* Code block */}
      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 relative">
        {/* Action bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 bg-slate-900">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Generated SQL</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition-all"
              aria-label={copied ? 'Copied' : 'Copy SQL'}
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Regenerate</span>
            </button>
          </div>
        </div>
        {/* Code */}
        <pre className="p-4 overflow-x-auto text-slate-100">
          {highlightSQL(sql)}
        </pre>
      </div>

      {/* QOC pass notice */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
        <FileCheck2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Strict Output Contract (QOC) passed:</strong> SQL extracted cleanly from a
          single fenced code block — no conversational text detected.
        </span>
      </div>

      {/* Execute button */}
      <button
        onClick={onExecute}
        disabled={isExecuting}
        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-md shadow-emerald-100 transition-all"
      >
        {isExecuting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {isExecuting ? 'Executing…' : 'Execute Query'}
      </button>
    </div>
  );
}

// ─── Data table ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 5;

function DataTable({ headers, rows }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage]      = useState(0);

  const sortedRows = useMemo(() => {
    if (sortCol === null) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      const na = parseFloat(va), nb = parseFloat(vb);
      const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortCol, sortDir]);

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
  const pageRows   = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (colIdx) => {
    if (sortCol === colIdx) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(colIdx); setSortDir('asc'); }
    setPage(0);
  };

  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
        <Table2 className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm font-medium">No rows returned</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-10">#</th>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    onClick={() => handleSort(i)}
                    className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-900 hover:bg-slate-100 transition-all select-none"
                  >
                    <div className="flex items-center gap-1">
                      {h}
                      {sortCol === i ? (
                        sortDir === 'asc'
                          ? <ChevronUp className="w-3 h-3 text-indigo-500" />
                          : <ChevronDown className="w-3 h-3 text-indigo-500" />
                      ) : (
                        <ChevronUp className="w-3 h-3 text-slate-300" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-3 py-2 text-xs text-slate-400 font-mono">{page * PAGE_SIZE + ri + 1}</td>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-slate-700 font-medium">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Page {page + 1} of {totalPages} · {rows.length} rows</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 font-medium transition-all"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 font-medium transition-all"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden animate-pulse">
      <div className="bg-slate-100 h-10 border-b border-slate-200" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-slate-100 last:border-0">
          <div className="h-4 bg-slate-100 rounded w-6" />
          <div className="h-4 bg-slate-100 rounded flex-1" />
          <div className="h-4 bg-slate-100 rounded w-24" />
        </div>
      ))}
    </div>
  );
}

// ─── Visualization panel ──────────────────────────────────────────────────────

const CHART_TYPES = [
  { id: 'bar',     icon: BarChart2,  label: 'Bar' },
  { id: 'line',    icon: LineChart,  label: 'Line' },
  { id: 'pie',     icon: PieChart,   label: 'Pie' },
];

function VisualizationPanel({ chartData, chartTitle, chartSubtitle }) {
  const [chartType, setChartType] = useState('bar');

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
        <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm font-medium">No chart data available</p>
      </div>
    );
  }

  // Recharts expects array of objects with named keys
  const data = chartData.map((d) => ({ name: d.label, value: d.value }));

  return (
    <div className="space-y-4">
      {/* Chart type selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 mr-1">Chart type:</span>
        {CHART_TYPES.map((ct) => (
          <button
            key={ct.id}
            onClick={() => setChartType(ct.id)}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              chartType === ct.id
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700',
            ].join(' ')}
          >
            <ct.icon className="w-3.5 h-3.5" />
            {ct.label}
          </button>
        ))}
      </div>

      {/* Title */}
      {chartTitle && (
        <div>
          <h4 className="text-sm font-semibold text-slate-800">{chartTitle}</h4>
          {chartSubtitle && <p className="text-xs text-slate-400 mt-0.5">{chartSubtitle}</p>}
        </div>
      )}

      {/* Chart */}
      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                cursor={{ fill: '#f1f5f9' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : chartType === 'line' ? (
            <RLineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={{ fill: '#4f46e5', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </RLineChart>
          ) : (
            <RPieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={90}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#cbd5e1' }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
            </RPieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── SqlResultPanel ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'sql',   icon: Code,    label: 'SQL Query' },
  { id: 'table', icon: Table2,  label: 'Data Table' },
  { id: 'chart', icon: BarChart3, label: 'Visualisation' },
];

export default function SqlResultPanel({
  dataset,
  queryState,   // 'generated' | 'executing' | 'success' | 'error'
  onExecute,
  onRegenerate,
  initialTab = 'sql',
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  // Auto-switch to table once results are ready
  React.useEffect(() => {
    if (queryState === 'success') setActiveTab('table');
  }, [queryState]);

  const isExecuting = queryState === 'executing';
  const hasResults  = queryState === 'success';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm slide-in-up">

      {/* Tab bar */}
      <div className="flex items-center border-b border-slate-200 px-4 pt-1 bg-white">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            disabled={tab.id !== 'sql' && !hasResults && queryState !== 'executing'}
            className={[
              'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all',
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 disabled:text-slate-300 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}

        {/* Metadata badges */}
        {hasResults && (
          <div className="ml-auto flex items-center gap-2 pb-1">
            <span className="px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
              {dataset.rowCount ?? dataset.rows?.length ?? 0} rows
            </span>
            <span className="px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold">
              {dataset.time}
            </span>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === 'sql' && (
          <SqlPanel
            sql={dataset?.sql}
            onExecute={onExecute}
            onRegenerate={onRegenerate}
            isExecuting={isExecuting}
          />
        )}

        {activeTab === 'table' && (
          isExecuting
            ? <TableSkeleton />
            : hasResults
            ? <DataTable headers={dataset.headers} rows={dataset.rows} />
            : <div className="py-12 text-center text-slate-400 text-sm">Execute the query to see results.</div>
        )}

        {activeTab === 'chart' && (
          isExecuting
            ? <TableSkeleton />
            : hasResults
            ? <VisualizationPanel
                chartData={dataset.chartData}
                chartTitle={dataset.chartTitle}
                chartSubtitle={dataset.chartSubtitle}
              />
            : <div className="py-12 text-center text-slate-400 text-sm">Execute the query to see visualisation.</div>
        )}
      </div>
    </div>
  );
}
