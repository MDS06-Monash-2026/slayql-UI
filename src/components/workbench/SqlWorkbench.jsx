import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  Code2,
  Loader2,
  Play,
  Sparkles,
  Table2,
  WandSparkles,
  X,
  Copy,
  Check,
  CornerDownLeft,
  CheckCheck,
  Undo2,
  Terminal,
  Database,
  ArrowRight,
} from 'lucide-react';
import { assistWorkbenchSql, executeWorkbenchQuery, fetchChartIdioms, recommendWorkbenchVisualization } from '../../services/api';
import { highlightSQLTokens } from '../../utils/sqlHighlighter';
import DataTablePanel from '../demo/DataTablePanel';
import VegaWorkbenchChart from './VegaWorkbenchChart';

const DEFAULT_SQL = `-- Type your SQL here\n`;

const CURSOR_QUICK_PRESETS = [
  { label: '📊 Top revenue', prompt: 'Show top customers ranked by total revenue with order count' },
  { label: '📈 Monthly trend', prompt: 'Calculate monthly order volume, revenue and average ticket size' },
  { label: '🔗 Auto-join tables', prompt: 'Join customers with their latest completed orders' },
  { label: '⚡ Optimize query', prompt: 'Optimize this query structure, qualify columns and add efficient filtering' },
];

export default function SqlWorkbench({ connectionId, initialTable, initialTableKey, onResult, theme = 'light' }) {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [resultTab, setResultTab] = useState('rows');
  const [copied, setCopied] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // --- Cursor AI (Cmd+K / Ctrl+K) State ---
  const [cursorOpen, setCursorOpen] = useState(false);
  const [cursorPrompt, setCursorPrompt] = useState('');
  const [cursorLoading, setCursorLoading] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState(null); // { originalSql, proposedSql, explanation, confidence }
  
  const [idioms, setIdioms] = useState([]);
  const [recommendation, setRecommendation] = useState({ idiom: 'bar', title: 'Query result', reason: '', x_field: '', y_fields: [] });

  const editorRef = useRef(null);
  const preRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const cursorInputRef = useRef(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    fetchChartIdioms().then((payload) => setIdioms(payload.idioms || [])).catch(() => setIdioms([]));
  }, []);

  useEffect(() => {
    if (initialTable) {
      setSql(`SELECT *\nFROM ${initialTable}\nLIMIT 50;`);
    }
  }, [initialTable, initialTableKey]);

  // Focus cursor input when Cmd+K opens
  useEffect(() => {
    if (cursorOpen) {
      setTimeout(() => cursorInputRef.current?.focus(), 40);
    }
  }, [cursorOpen]);

  const resultPayload = useMemo(() => result ? { columns: result.columns || [], column_types: result.column_types || [], rows: result.rows || [] } : null, [result]);

  const runQuery = async (overrideSql) => {
    const targetSql = (typeof overrideSql === 'string' ? overrideSql : sql).trim();
    if (!targetSql) return;
    setRunning(true);
    setError('');
    try {
      const response = await executeWorkbenchQuery(connectionId, targetSql);
      setSql(response.validation.sanitized_sql);
      setResult(response.result);
      onResult?.(response.result, response.validation.sanitized_sql);
      setResultTab('rows');
      setRunning(false);
      recommendWorkbenchVisualization(connectionId, {
        question: cursorPrompt || 'Choose the clearest visualization for this SQL result',
        result: { columns: response.result.columns, column_types: response.result.column_types, rows: response.result.rows },
      }).then(setRecommendation).catch(() => {});
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

  // --- Trigger Cursor AI Generation ---
  const handleTriggerCursorAi = async (customInstruction) => {
    const instruction = (customInstruction || cursorPrompt).trim();
    if (!instruction) return;
    
    setCursorLoading(true);
    setError('');
    const originalSql = sql;
    
    try {
      const response = await assistWorkbenchSql(connectionId, {
        instruction,
        sql: originalSql,
        cursor_position: editorRef.current?.selectionStart || originalSql.length,
      });

      setPendingSuggestion({
        originalSql,
        proposedSql: response.sql,
        explanation: response.explanation,
        confidence: response.confidence || 0.95,
      });
      // Show proposed SQL in editor for immediate live review
      setSql(response.sql);
    } catch (err) {
      setError(err.message);
    } finally {
      setCursorLoading(false);
    }
  };

  // Accept Cursor AI Suggestion
  const handleAcceptSuggestion = () => {
    if (!pendingSuggestion) return;
    setSql(pendingSuggestion.proposedSql);
    setPendingSuggestion(null);
    setCursorOpen(false);
    setCursorPrompt('');
    setTimeout(() => editorRef.current?.focus(), 50);
  };

  // Reject / Revert Cursor AI Suggestion
  const handleRejectSuggestion = () => {
    if (!pendingSuggestion) return;
    setSql(pendingSuggestion.originalSql);
    setPendingSuggestion(null);
    setCursorOpen(false);
    setTimeout(() => editorRef.current?.focus(), 50);
  };

  // Run immediately & Accept
  const handleRunAndAccept = () => {
    if (!pendingSuggestion) return;
    const finalSql = pendingSuggestion.proposedSql;
    setSql(finalSql);
    setPendingSuggestion(null);
    setCursorOpen(false);
    setCursorPrompt('');
    runQuery(finalSql);
  };

  const handleKeyDown = (e) => {
    // Cmd+K / Ctrl+K toggles Cursor AI
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setCursorOpen((prev) => !prev);
      return;
    }

    // Escape closes cursor / rejects pending
    if (e.key === 'Escape') {
      if (pendingSuggestion) {
        e.preventDefault();
        handleRejectSuggestion();
        return;
      }
      if (cursorOpen) {
        e.preventDefault();
        setCursorOpen(false);
        return;
      }
    }

    // Ctrl+Enter / Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (pendingSuggestion) {
        handleAcceptSuggestion();
      } else {
        runQuery();
      }
      return;
    }

    // Tab key inserts 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const nextSql = sql.substring(0, start) + '  ' + sql.substring(end);
      setSql(nextSql);
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.selectionStart = editorRef.current.selectionEnd = start + 2;
          updateCursorPosition();
        }
      }, 0);
    }
  };

  const handleScroll = (e) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.target.scrollTop;
      preRef.current.scrollLeft = e.target.scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const updateCursorPosition = () => {
    if (!editorRef.current) return;
    const text = editorRef.current.value.substring(0, editorRef.current.selectionStart);
    const lineList = text.split('\n');
    setCursorPos({
      line: lineList.length,
      col: lineList[lineList.length - 1].length + 1,
    });
  };

  const lines = (sql || '').split('\n');

  return (
    <div className="space-y-5">
      {/* IDE Code Editor with Cursor AI Integration */}
      <section className={`rounded-2xl border overflow-hidden shadow-sm transition-all relative ${
        isDark 
          ? 'bg-[#0f141c] border-slate-800 text-slate-100 shadow-md' 
          : 'bg-white border-slate-300/90 text-slate-900'
      }`}>
        {/* Minimalist Toolbar Header with Window Dots */}
        <div className={`h-11 px-3.5 flex items-center justify-between gap-3 border-b transition-colors ${
          isDark 
            ? 'bg-[#161c27] border-slate-800' 
            : 'bg-slate-100/90 border-slate-200/90'
        }`}>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 ml-1">
              query.sql
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Cursor AI Pill Trigger */}
            <button
              type="button"
              onClick={() => setCursorOpen((v) => !v)}
              className={`h-8 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-all shadow-2xs ${
                cursorOpen || pendingSuggestion
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-indigo-500/20'
                  : isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-900/50'
                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
              }`}
              title="Cursor AI Inline Edit (Ctrl+K / Cmd+K)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Edit</span>
              <kbd className="hidden sm:inline-block px-1 rounded text-[9px] font-mono opacity-80 bg-black/10 dark:bg-white/10">
                ⌘K
              </kbd>
            </button>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  : 'bg-white hover:bg-slate-200/80 text-slate-700 border border-slate-200 shadow-2xs'
              }`}
              title="Copy SQL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Run Button */}
            <button
              type="button"
              onClick={() => runQuery()}
              disabled={running || !sql.trim()}
              className="h-8 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition-all active:scale-95"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>Run</span>
            </button>
          </div>
        </div>

        {/* Cursor AI (Cmd+K) Floating Inline Command Bar */}
        {cursorOpen && !pendingSuggestion && (
          <div className={`p-3 border-b animate-in fade-in slide-in-from-top-1 duration-150 transition-colors ${
            isDark 
              ? 'bg-[#121622] border-indigo-900/60' 
              : 'bg-indigo-50/70 border-indigo-100'
          }`}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                {cursorLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              </div>
              <input
                ref={cursorInputRef}
                value={cursorPrompt}
                onChange={(e) => setCursorPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleTriggerCursorAi();
                  }
                  if (e.key === 'Escape') {
                    setCursorOpen(false);
                  }
                }}
                placeholder="Instruct Cursor AI (e.g. 'Add 30-day moving avg', 'Filter by top 5 regions', 'Join orders')..."
                className={`h-9 flex-1 rounded-lg border px-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all ${
                  isDark
                    ? 'bg-[#1a202c] border-slate-700 text-slate-100 placeholder-slate-500'
                    : 'bg-white border-indigo-200 text-slate-900 placeholder-slate-400'
                }`}
              />
              <button
                type="button"
                onClick={() => handleTriggerCursorAi()}
                disabled={cursorLoading || !cursorPrompt.trim()}
                className="h-9 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
              >
                {cursorLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
                <span>Generate</span>
              </button>
              <button
                type="button"
                onClick={() => setCursorOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
                title="Dismiss (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cursor Quick Action Presets */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-indigo-100 dark:border-indigo-950/80">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1">
                Presets:
              </span>
              {CURSOR_QUICK_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setCursorPrompt(preset.prompt);
                    handleTriggerCursorAi(preset.prompt);
                  }}
                  className={`px-2 py-1 rounded-md text-[10.5px] font-medium border transition-all hover:scale-102 active:scale-98 ${
                    isDark
                      ? 'bg-[#1a202c] hover:bg-indigo-950/80 border-slate-800 text-indigo-300 hover:border-indigo-700'
                      : 'bg-white hover:bg-indigo-50 border-indigo-100 text-indigo-700 hover:border-indigo-300 shadow-2xs'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cursor AI Diff & Review Inspector Bar */}
        {pendingSuggestion && (
          <div className={`p-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150 ${
            isDark 
              ? 'bg-indigo-950/40 border-indigo-800/80 text-slate-200' 
              : 'bg-indigo-50 border-indigo-200 text-indigo-950'
          }`}>
            <div className="flex items-start gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Check className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    AI recommendation ready
                  </p>
                  <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {Math.round((pendingSuggestion.confidence || 0.95) * 100)}% match
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                  {pendingSuggestion.explanation || 'Applied schema-validated optimization and SQL structure.'}
                </p>
              </div>
            </div>

            {/* Action Buttons: Accept / Reject / Run */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRejectSuggestion}
                className="h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 inline-flex items-center gap-1.5 transition-all active:scale-95"
                title="Reject and restore previous SQL (Esc)"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>
              <button
                type="button"
                onClick={handleAcceptSuggestion}
                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                title="Accept AI suggestion (Ctrl+Enter)"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Accept</span>
              </button>
              <button
                type="button"
                onClick={handleRunAndAccept}
                className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                title="Accept and execute immediately"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run</span>
              </button>
            </div>
          </div>
        )}

        {/* Live IDE Editor Body with Real-Time Syntax Highlighting */}
        <div className={`relative flex h-60 overflow-hidden ${isDark ? 'bg-[#0f141c]' : 'bg-slate-50/40'}`}>
          {/* Synchronized Line Numbers */}
          <div
            ref={lineNumbersRef}
            className={`w-11 py-3 text-right pr-3 select-none font-mono text-[11px] leading-[1.65] shrink-0 border-r overflow-hidden ${
              isDark ? 'bg-[#121622]/60 text-slate-600 border-slate-800/80' : 'bg-slate-100/70 text-slate-400 border-slate-200'
            }`}
            aria-hidden="true"
          >
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          {/* Layered Live Syntax-Highlighted Editor */}
          <div className="relative flex-1 h-full min-w-0 overflow-hidden">
            {/* Background Syntax Highlighting Layer */}
            <pre
              ref={preRef}
              aria-hidden="true"
              className={`absolute inset-0 m-0 py-3 px-4 font-mono text-[12.5px] leading-[1.65] whitespace-pre overflow-hidden select-none pointer-events-none ${
                isDark ? 'text-slate-200' : 'text-slate-800'
              }`}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                tabSize: 2,
              }}
            >
              <code>{highlightSQLTokens(sql)}</code>{sql.endsWith('\n') ? ' ' : ''}
            </pre>

            {/* Transparent Interactive Textarea Layer */}
            <textarea
              ref={editorRef}
              value={sql}
              onChange={(e) => {
                setSql(e.target.value);
                updateCursorPosition();
              }}
              onKeyUp={updateCursorPosition}
              onClick={updateCursorPosition}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className={`absolute inset-0 block w-full h-full m-0 py-3 px-4 font-mono text-[12.5px] leading-[1.65] whitespace-pre overflow-auto resize-none bg-transparent outline-none border-none selection:bg-indigo-500/25 ${
                isDark 
                  ? 'text-transparent caret-indigo-400' 
                  : 'text-transparent caret-indigo-600'
              }`}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                tabSize: 2,
              }}
              aria-label="SQL editor"
            />
          </div>
        </div>

        {/* IDE Status Bar */}
        <div className={`h-7 px-3.5 border-t flex items-center justify-between text-[10px] select-none ${
          isDark 
            ? 'bg-[#121622] border-slate-800/80 text-slate-500' 
            : 'bg-slate-100/90 border-slate-200/90 text-slate-500'
        }`}>
          <div className="flex items-center gap-3">
            <span className="font-mono">Ln {cursorPos.line}, Col {cursorPos.col}</span>
            <span>•</span>
            <span>{lines.length} lines</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer hover:underline" onClick={() => setCursorOpen(true)}>
              ⌘K for Cursor AI
            </span>
            <span className="hidden sm:inline">•</span>
            <span>Tab to indent</span>
            <span>•</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Ctrl + Enter to run</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          <p className="font-bold">Execution failed</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}

      {/* Query Results Section */}
      {resultPayload && (
        <section className={`rounded-2xl border shadow-sm overflow-hidden transition-all ${
          isDark 
            ? 'bg-[#121622] border-slate-800' 
            : 'bg-white border-slate-200'
        }`}>
          {/* Results Tab Header */}
          <div className={`px-4 pt-3 flex items-center justify-between border-b gap-3 ${
            isDark 
              ? 'border-slate-800 bg-[#161c27]' 
              : 'border-slate-200 bg-slate-50/80'
          }`}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setResultTab('rows')}
                className={`pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  resultTab === 'rows'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Rows ({result.row_count || result.rows?.length || 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setResultTab('chart')}
                className={`pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  resultTab === 'chart'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Visualization</span>
              </button>
            </div>

            <div className="pb-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
              {result.execution_time_ms ? `${result.execution_time_ms}ms` : 'Ready'}
            </div>
          </div>

          {/* Table View Tab */}
          {resultTab === 'rows' && (
            <div className="p-4">
              <DataTablePanel
                columns={resultPayload.columns}
                rows={resultPayload.rows}
                isTruncated={result.is_truncated}
                executionTimeMs={result.execution_time_ms}
                isDark={isDark}
              />
            </div>
          )}

          {/* Chart View Tab */}
          {resultTab === 'chart' && (
            <div className="p-4">
              <VegaWorkbenchChart
                data={resultPayload}
                recommendation={recommendation}
                idioms={idioms}
                onSelectIdiom={(idiom) => setRecommendation((curr) => ({ ...curr, idiom }))}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
