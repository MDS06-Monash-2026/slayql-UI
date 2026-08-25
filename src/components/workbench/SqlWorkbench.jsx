import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronDown, Code2, Loader2, Play, Sparkles, Table2, WandSparkles, X, Copy, Check, Eye, Edit3 } from 'lucide-react';
import { assistWorkbenchSql, executeWorkbenchQuery, fetchChartIdioms, recommendWorkbenchVisualization } from '../../services/api';
import { highlightSQLTokens } from '../../utils/sqlHighlighter';
import VegaWorkbenchChart from './VegaWorkbenchChart';

const DEFAULT_SQL = `SELECT
  c.segment,
  COUNT(DISTINCT o.id) AS order_count,
  ROUND(SUM(o.total_amount), 2) AS revenue
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status IN ('completed', 'shipped')
GROUP BY c.segment
ORDER BY revenue DESC;`;

export default function SqlWorkbench({ connectionId, initialTable, initialTableKey, onResult }) {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [resultTab, setResultTab] = useState('rows');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [assisting, setAssisting] = useState(false);
  const [assistantNote, setAssistantNote] = useState('');
  const [idioms, setIdioms] = useState([]);
  const [recommendation, setRecommendation] = useState({ idiom: 'bar', title: 'Query result', reason: '', x_field: '', y_fields: [] });
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState('highlight'); // 'highlight' | 'edit'
  const editorRef = useRef(null);

  useEffect(() => {
    fetchChartIdioms().then((payload) => setIdioms(payload.idioms || [])).catch(() => setIdioms([]));
  }, []);

  useEffect(() => {
    if (initialTable) {
      setSql(`SELECT *\nFROM ${initialTable}\nLIMIT 50;`);
    }
  }, [initialTable, initialTableKey]);

  const resultPayload = useMemo(() => result ? { columns: result.columns || [], column_types: result.column_types || [], rows: result.rows || [] } : null, [result]);

  const runQuery = async () => {
    setRunning(true);
    setError('');
    try {
      const response = await executeWorkbenchQuery(connectionId, sql);
      setSql(response.validation.sanitized_sql);
      setResult(response.result);
      onResult?.(response.result, response.validation.sanitized_sql);
      setResultTab('rows');
      // Show database rows as soon as execution returns. Visualization is a
      // secondary AI request and must not block the primary data workflow.
      setRunning(false);
      recommendWorkbenchVisualization(connectionId, {
        question: instruction || 'Choose the clearest visualization for this SQL result',
        result: { columns: response.result.columns, column_types: response.result.column_types, rows: response.result.rows },
      }).then(setRecommendation).catch(() => {
        // Query results remain usable when AI visualization is unavailable.
      });
    } catch (err) {
      setError(err.message);
      setRunning(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const askAssistant = async () => {
    if (!instruction.trim()) return;
    setAssisting(true);
    setError('');
    try {
      const response = await assistWorkbenchSql(connectionId, { instruction: instruction.trim(), sql, cursor_position: editorRef.current?.selectionStart || sql.length });
      setSql(response.sql);
      setAssistantNote(response.explanation);
      setInstruction('');
      setViewMode('highlight');
    } catch (err) {
      setError(err.message);
    } finally {
      setAssisting(false);
    }
  };

  const lines = (sql || '').split('\n');

  return (
    <div className="space-y-5">
      {/* IDE Code Editor */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-[#0f141c] text-slate-100 overflow-hidden shadow-md">
        {/* Toolbar Header */}
        <div className="h-11 px-3.5 flex items-center justify-between gap-3 border-b border-slate-800 bg-[#161c27]">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <span className="text-xs font-bold text-slate-200 ml-1 flex items-center gap-1.5 font-mono">
              <Code2 className="w-3.5 h-3.5 text-indigo-400" />
              workbench.sql
            </span>
            <span className="text-[9px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700">READ ONLY</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* View / Edit Mode Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = viewMode === 'highlight' ? 'edit' : 'highlight';
                setViewMode(next);
                if (next === 'edit') {
                  setTimeout(() => editorRef.current?.focus(), 50);
                }
              }}
              className="h-8 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title={viewMode === 'highlight' ? 'Switch to raw editor' : 'Switch to syntax highlighted view'}
            >
              {viewMode === 'highlight' ? <Edit3 className="w-3.5 h-3.5 text-indigo-400" /> : <Eye className="w-3.5 h-3.5 text-sky-400" />}
              <span>{viewMode === 'highlight' ? 'Edit' : 'Preview'}</span>
            </button>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className="h-8 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Copy SQL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* AI Assistant */}
            <button
              type="button"
              onClick={() => setAssistantOpen((value) => !value)}
              className={`h-8 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition ${assistantOpen ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-indigo-300 hover:bg-slate-700'}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI cursor</span>
            </button>

            {/* Run Button */}
            <button
              type="button"
              onClick={runQuery}
              disabled={running || !sql.trim()}
              className="h-8 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 transition-all"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>Run</span>
            </button>
          </div>
        </div>

        {/* Editor Body */}
        <div className="p-4 bg-[#0f141c] relative min-h-[160px]">
          {viewMode === 'edit' ? (
            <textarea
              ref={editorRef}
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runQuery(); }}
              spellCheck={false}
              className="block w-full h-56 resize-y bg-[#161c27] text-slate-100 font-mono text-xs leading-relaxed p-3.5 rounded-xl border border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/40"
              aria-label="SQL editor"
            />
          ) : (
            <div
              onClick={() => { setViewMode('edit'); setTimeout(() => editorRef.current?.focus(), 50); }}
              className="flex font-mono text-xs leading-relaxed cursor-text select-text"
              title="Click to edit SQL"
            >
              {/* Line numbers */}
              <div className="select-none text-slate-600 pr-4 text-right border-r border-slate-800 mr-4 font-mono text-[11px]">
                {lines.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              {/* Highlighted tokens */}
              <pre className="font-mono text-xs text-slate-200 leading-relaxed overflow-x-auto whitespace-pre flex-1">
                <code>{highlightSQLTokens(sql)}</code>
              </pre>
            </div>
          )}
          <div className="absolute bottom-2 right-3 text-[9px] text-slate-500 select-none">
            Ctrl + Enter to run
          </div>
        </div>

        {/* AI Assistant Drawer */}
        {assistantOpen && (
          <div className="border-t border-indigo-500/30 bg-[#161c27] p-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <input
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') askAssistant(); }}
                    placeholder="Ask AI to complete a join, add window function, aggregate, optimize..."
                    className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={askAssistant}
                    disabled={assisting || !instruction.trim()}
                    className="h-9 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                  >
                    {assisting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WandSparkles className="w-3.5 h-3.5" />}
                    <span>Apply</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssistantOpen(false)}
                    className="w-8 h-8 text-slate-400 hover:text-slate-200 rounded-lg flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] text-slate-400">
                    AI receives the database catalog, current SQL, and cursor position.
                  </p>
                  {assistantNote && <span className="text-[10px] text-emerald-400 truncate max-w-xs">{assistantNote}</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {error && <div className="px-3.5 py-2.5 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-xs text-red-700 dark:text-red-300 font-medium">{error}</div>}

      <section className="min-h-72">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex">
            <button
              onClick={() => setResultTab('rows')}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors ${resultTab === 'rows' ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <span className="inline-flex items-center gap-1.5"><Table2 className="w-3.5 h-3.5" />Rows {result && `(${result.row_count})`}</span>
            </button>
            <button
              onClick={() => setResultTab('visual')}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors ${resultTab === 'visual' ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Visualization</span>
            </button>
          </div>
          {resultTab === 'visual' && (
            <label className="relative mb-2 sm:mb-0">
              <select
                value={recommendation.idiom}
                onChange={(event) => setRecommendation((current) => ({ ...current, idiom: event.target.value }))}
                className="appearance-none h-9 pl-3 pr-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="bar">Select chart</option>
                {Object.entries(idioms.reduce((groups, idiom) => ({ ...groups, [idiom.family]: [...(groups[idiom.family] || []), idiom] }), {})).map(([family, items]) => (
                  <optgroup key={family} label={family}>
                    {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </label>
          )}
        </div>
        {!result ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400">
            <Play className="w-5 h-5 mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-xs">Run the query to preview rows and visualization.</p>
          </div>
        ) : resultTab === 'rows' ? (
          <div className="overflow-auto border-b border-slate-200 dark:border-slate-800 max-h-[420px]">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/90 text-[10px] uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  {result.columns.map((column) => <th key={column} className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700">{column}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {result.rows.map((row, index) => (
                  <tr key={index} className="hover:bg-indigo-50/40 dark:hover:bg-slate-800/50 transition-colors">
                    {row.map((value, cell) => (
                      <td key={cell} className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300 max-w-xs truncate">
                        {value === null ? <span className="text-slate-300 dark:text-slate-600">NULL</span> : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="pt-4">
            <div className="mb-3">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{recommendation.title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{recommendation.reason || 'Choose from the 50-idiom visualization catalog.'}</p>
            </div>
            <VegaWorkbenchChart idiom={recommendation.idiom} result={resultPayload} recommendation={recommendation} />
          </div>
        )}
      </section>
    </div>
  );
}
