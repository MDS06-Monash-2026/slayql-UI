import React, { useMemo, useState } from 'react';
import { Download, LayoutDashboard, Loader2, MessageCircle, Presentation, RotateCcw, Send, Sparkles, Undo2 } from 'lucide-react';
import { editPowerBIReport, generatePowerBIReport } from '../../services/api';
import DataTablePanel from '../demo/DataTablePanel';
import VegaWorkbenchChart from './VegaWorkbenchChart';

const initialPreferences = { title: 'Revenue and operations briefing', layout: 'executive', palette: 'indigo', font: 'Inter', density: 'comfortable' };

export default function AIDashboardBuilder({ connectionId, result = { columns: [], column_types: [], rows: [] }, sql, isDark = false }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedWidgetId, setSelectedWidgetId] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const boundedResult = useMemo(() => ({ columns: result?.columns || [], column_types: result?.column_types || [], rows: (result?.rows || []).slice(0, 200) }), [result]);
  const displayResult = result || boundedResult;
  const profile = report?.data_profile;
  const profileValue = (field) => field === 'row_count' ? (profile?.row_count ?? result?.row_count ?? 0) : (profile?.columns?.find((item) => item.name === field)?.average ?? profile?.columns?.find((item) => item.name === field)?.max ?? '-');

  const generate = async () => {
    setGenerating(true); setError(''); setMessage('');
    try { setReport(await generatePowerBIReport(connectionId, { preference: { ...preferences, source_sql: sql }, result: boundedResult })); setHistory([]); }
    catch (err) { setError(err.message || 'Unable to generate report'); }
    finally { setGenerating(false); }
  };

  const applyEdit = async (text = instruction) => {
    if (!report || !text.trim()) return;
    setEditing(true); setError('');
    try {
      const response = await editPowerBIReport(connectionId, { report, instruction: text.trim(), selected_widget_id: selectedWidgetId });
      setHistory((items) => [...items, report]); setReport(response.report); setMessage(response.message || 'Report updated'); setInstruction('');
    } catch (err) { setError(err.message || 'Unable to update report'); }
    finally { setEditing(false); }
  };

  const exportReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${(report.title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const undo = () => { if (history.length) { setReport(history[history.length - 1]); setHistory((items) => items.slice(0, -1)); setMessage('Restored the previous report version'); } };
  const reset = () => { setReport(null); setHistory([]); setMessage(''); setSelectedWidgetId(null); };
  const palette = report?.theme?.palette || preferences.palette;
  const layout = report?.layout || preferences.layout;

  return <div className="space-y-5">
    <section className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><LayoutDashboard className="w-4 h-4" /></div><div><h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">AI report studio</h2><p className="text-[11px] text-slate-500 dark:text-slate-400">DeepSeek composes a governed Power BI-style report from your bounded query result.</p></div></div>
      <div className="flex items-center gap-2"><button onClick={undo} disabled={!history.length || editing} title="Undo last edit" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-40"><Undo2 className="w-4 h-4" /></button><button onClick={reset} disabled={!report || editing} title="Reset report" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-40"><RotateCcw className="w-4 h-4" /></button>{report && <button onClick={exportReport} title="Export report JSON" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500"><Download className="w-4 h-4" /></button>}<button onClick={generate} disabled={generating || !connectionId} className="h-9 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50">{generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Generate report</button></div>
    </section>
    <section className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3"><label className="lg:col-span-2 text-[10px] font-bold text-slate-500 uppercase">Report title<input value={preferences.title} onChange={(e) => setPreferences({ ...preferences, title: e.target.value })} className="mt-1.5 w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs normal-case text-slate-800 dark:text-slate-100" /></label><label className="text-[10px] font-bold text-slate-500 uppercase">Layout<select value={preferences.layout} onChange={(e) => setPreferences({ ...preferences, layout: e.target.value })} className="mt-1.5 w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs normal-case"><option value="executive">Executive</option><option value="analytical">Analytical</option><option value="story">Data story</option></select></label><label className="text-[10px] font-bold text-slate-500 uppercase">Typography<select value={preferences.font} onChange={(e) => setPreferences({ ...preferences, font: e.target.value })} className="mt-1.5 w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs normal-case"><option>Inter</option><option>IBM Plex Sans</option><option>Source Sans 3</option></select></label><label className="text-[10px] font-bold text-slate-500 uppercase">Density<select value={preferences.density} onChange={(e) => setPreferences({ ...preferences, density: e.target.value })} className="mt-1.5 w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs normal-case"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label></section>
    {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    {!result && <div className="h-64 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-400"><Presentation className="w-6 h-6 mb-2" /><p className="text-xs font-semibold">Run a SQL query in Workbench first</p></div>}
    {!report && <div className="h-52 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-400"><Sparkles className="w-6 h-6 mb-2 text-indigo-500" /><p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Ready to compose</p><p className="text-[10px] mt-1">Generate a baseline report now, or run a SQL query first for data-driven visuals.</p></div>}
    {report && <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121622] overflow-hidden" style={{ fontFamily: report.theme?.font || preferences.font }}><header className="px-6 py-6 border-b border-slate-200 dark:border-slate-800 bg-indigo-50 dark:bg-slate-900/80"><p className="text-[10px] uppercase font-bold text-slate-500">AI-generated presentation</p><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{report.title}</h1><p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{report.subtitle}</p><p className="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-3 max-w-3xl">{report.narrative}</p></header><div className={`grid grid-cols-1 ${layout === 'story' ? 'md:grid-cols-1' : layout === 'analytical' ? 'md:grid-cols-2' : 'md:grid-cols-3'} ${report.theme?.density === 'compact' ? 'gap-3 p-3' : 'gap-5 p-5'}`}>{(report.sections || []).flatMap((section) => section.widgets || []).map((widget) => <article key={widget.id} onClick={() => setSelectedWidgetId(widget.id)} className={`min-w-0 border bg-slate-50/50 dark:bg-[#161c27] rounded-xl p-4 cursor-pointer ${selectedWidgetId === widget.id ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200 dark:border-slate-800'} ${widget.span > 1 ? 'md:col-span-2' : ''}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-slate-800 dark:text-slate-200">{widget.title}</p>{selectedWidgetId === widget.id && <MessageCircle className="w-3.5 h-3.5 text-indigo-500" />}</div>{widget.type === 'kpi' ? <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-4">{typeof profileValue(widget.field) === 'number' ? Number(profileValue(widget.field)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : profileValue(widget.field)}</p> : widget.type === 'narrative' ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-3">{report.narrative}</p> : widget.type === 'table' ? <div className="mt-3"><DataTablePanel columns={result.columns} rows={result.rows} isDark={isDark} /></div> : <VegaWorkbenchChart idiom={widget.chart_type} result={result} recommendation={{ x_field: widget.config?.x_field, y_fields: widget.config?.y_fields || [widget.field] }} palette={palette} font={report.theme?.font || preferences.font} isDark={isDark} />}</article>)}</div><footer className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 text-[9px] text-slate-400 flex justify-between"><span>{message || 'Select a visual, then describe a change in chat.'}</span><span>{profile?.row_count ?? result.row_count ?? result.rows.length} bounded rows</span></footer></section>}
    {report && <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-[#121622]"><div className="flex items-center gap-2 mb-2"><MessageCircle className="w-4 h-4 text-indigo-500" /><p className="text-xs font-bold text-slate-800 dark:text-slate-200">Report assistant</p><span className="text-[10px] text-slate-400">{selectedWidgetId ? `Editing ${selectedWidgetId}` : 'Editing the whole report'}</span></div><div className="flex gap-2"><textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) applyEdit(); }} placeholder="e.g. Rename this KPI to Net revenue or switch it to a trend chart" className="min-h-10 flex-1 resize-y rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-100" /><button onClick={() => applyEdit()} disabled={editing || !instruction.trim()} title="Apply report edit" className="h-10 w-10 shrink-0 rounded-lg bg-indigo-600 text-white inline-flex items-center justify-center disabled:opacity-50">{editing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button></div><div className="flex flex-wrap gap-2 mt-3">{['Rename this KPI', 'Use a trend chart', 'Add an executive narrative'].map((prompt) => <button key={prompt} onClick={() => applyEdit(prompt)} className="text-[10px] px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600">{prompt}</button>)}</div></section>}
  </div>;
}
