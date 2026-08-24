import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronDown, Code2, Loader2, Play, Sparkles, Table2, WandSparkles, X } from 'lucide-react';
import { assistWorkbenchSql, executeWorkbenchQuery, fetchChartIdioms, recommendWorkbenchVisualization } from '../../services/api';
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
  const editorRef = useRef(null);

  useEffect(() => {
    fetchChartIdioms().then((payload) => setIdioms(payload.idioms || [])).catch(() => setIdioms([]));
  }, []);

  useEffect(() => {
    if (initialTable) setSql(`SELECT *\nFROM ${initialTable}\nLIMIT 50;`);
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
      try {
        const visual = await recommendWorkbenchVisualization(connectionId, { question: instruction || 'Choose the clearest visualization for this SQL result', result: { columns: response.result.columns, column_types: response.result.column_types, rows: response.result.rows } });
        setRecommendation(visual);
      } catch {
        // Query results remain usable when AI is unavailable.
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
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
      editorRef.current?.focus();
    } catch (err) {
      setError(err.message);
    } finally {
      setAssisting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-[#111827] overflow-hidden shadow-sm">
        <div className="h-11 px-3 flex items-center justify-between gap-3 border-b border-slate-700 bg-[#161d2a]">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200"><Code2 className="w-4 h-4 text-indigo-400" />SQL editor<span className="text-[9px] font-semibold text-slate-500 px-1.5 py-0.5 rounded bg-slate-800">READ ONLY</span></div>
          <div className="flex items-center gap-2"><button onClick={() => setAssistantOpen((value) => !value)} className={`h-8 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition ${assistantOpen ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-indigo-300 hover:bg-slate-700'}`}><Sparkles className="w-3.5 h-3.5" />AI cursor</button><button onClick={runQuery} disabled={running || !sql.trim()} className="h-8 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50">{running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}Run</button></div>
        </div>
        <div className="relative">
          <textarea ref={editorRef} value={sql} onChange={(event) => setSql(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runQuery(); }} spellCheck={false} className="block w-full h-56 resize-y bg-[#111827] text-slate-200 font-mono text-[13px] leading-6 p-4 outline-none caret-indigo-400" aria-label="SQL editor" />
          <div className="absolute bottom-2 right-3 text-[9px] text-slate-600">Ctrl + Enter to run</div>
        </div>
        {assistantOpen && <div className="border-t border-indigo-500/30 bg-[#151b29] p-3"><div className="flex items-start gap-2"><div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-300 flex items-center justify-center shrink-0"><Bot className="w-4 h-4" /></div><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><input value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') askAssistant(); }} placeholder="Ask Gemini to complete a join, add a window function, optimize, or explain..." className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500" /><button onClick={askAssistant} disabled={assisting || !instruction.trim()} className="h-9 px-3 rounded-lg bg-indigo-500 text-white text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50">{assisting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WandSparkles className="w-3.5 h-3.5" />}Apply</button><button onClick={() => setAssistantOpen(false)} className="w-8 h-8 text-slate-500 hover:text-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button></div><div className="mt-2 flex items-center justify-between gap-3"><p className="text-[10px] text-slate-500">Gemini 3.5 Flash-Lite receives the catalog, current SQL, and cursor position. Credentials and raw database rows are excluded.</p>{assistantNote && <span className="text-[10px] text-emerald-400 truncate max-w-xs">{assistantNote}</span>}</div></div></div></div>}
      </section>

      {error && <div className="px-3 py-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">{error}</div>}

      <section className="min-h-72">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200">
          <div className="flex"><button onClick={() => setResultTab('rows')} className={`px-3 py-2 text-xs font-bold border-b-2 ${resultTab === 'rows' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}><span className="inline-flex items-center gap-1.5"><Table2 className="w-3.5 h-3.5" />Rows {result && `(${result.row_count})`}</span></button><button onClick={() => setResultTab('visual')} className={`px-3 py-2 text-xs font-bold border-b-2 ${resultTab === 'visual' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}><span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Visualization</span></button></div>
          {resultTab === 'visual' && <label className="relative mb-2 sm:mb-0"><select value={recommendation.idiom} onChange={(event) => setRecommendation((current) => ({ ...current, idiom: event.target.value }))} className="appearance-none h-9 pl-3 pr-8 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 outline-none"><option value="bar">Select chart</option>{Object.entries(idioms.reduce((groups, idiom) => ({ ...groups, [idiom.family]: [...(groups[idiom.family] || []), idiom] }), {})).map(([family, items]) => <optgroup key={family} label={family}>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}</select><ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" /></label>}
        </div>
        {!result ? <div className="h-64 flex flex-col items-center justify-center text-slate-400"><Play className="w-5 h-5 mb-2" /><p className="text-xs">Run the query to preview rows and visualization.</p></div> : resultTab === 'rows' ? <div className="overflow-auto border-b border-slate-200 max-h-[420px]"><table className="w-full text-left text-xs whitespace-nowrap"><thead className="sticky top-0 bg-slate-100 text-[10px] uppercase text-slate-500"><tr>{result.columns.map((column) => <th key={column} className="px-3 py-2.5 font-bold border-b border-slate-200">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{result.rows.map((row, index) => <tr key={index} className="hover:bg-indigo-50/40">{row.map((value, cell) => <td key={cell} className="px-3 py-2 font-mono text-slate-700 max-w-xs truncate">{value === null ? <span className="text-slate-300">NULL</span> : String(value)}</td>)}</tr>)}</tbody></table></div> : <div className="pt-4"><div className="mb-3"><p className="text-sm font-bold text-slate-900">{recommendation.title}</p><p className="text-[11px] text-slate-500">{recommendation.reason || 'Choose from the 50-idiom visualization catalog.'}</p></div><VegaWorkbenchChart idiom={recommendation.idiom} result={resultPayload} recommendation={recommendation} /></div>}
      </section>
    </div>
  );
}
