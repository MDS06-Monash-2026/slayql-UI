import React, { useState } from 'react';
import { LayoutDashboard, Loader2, Presentation, Sparkles } from 'lucide-react';
import { generateWorkbenchDashboard } from '../../services/api';
import VegaWorkbenchChart from './VegaWorkbenchChart';

export default function AIDashboardBuilder({ connectionId, result, sql }) {
  const [preferences, setPreferences] = useState({ title: 'Revenue and operations briefing', layout: 'executive', palette: 'indigo', font: 'Inter', density: 'comfortable' });
  const [dashboard, setDashboard] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    if (!result) return;
    setGenerating(true);
    setError('');
    try {
      const response = await generateWorkbenchDashboard(connectionId, { preference: { ...preferences, source_sql: sql }, result: { columns: result.columns, column_types: result.column_types, rows: result.rows } });
      setDashboard(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const profileValue = (field) => {
    if (field === 'row_count') return dashboard?.data_profile?.row_count || result?.row_count || 0;
    const column = dashboard?.data_profile?.columns?.find((item) => item.name === field);
    return column?.average ?? column?.max ?? column?.non_null_count ?? '-';
  };

  return (
    <div className="space-y-6">
      <section className="grid lg:grid-cols-[1fr_auto] gap-5 items-end pb-5 border-b border-slate-200">
        <div><div className="flex items-center gap-2"><div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><LayoutDashboard className="w-4 h-4" /></div><div><h2 className="text-sm font-bold text-slate-900">AI report studio</h2><p className="text-[11px] text-slate-500">Presentation layouts generated from bounded aggregates, not full database rows.</p></div></div></div>
        <button onClick={generate} disabled={generating || !result} className="h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">{generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Generate report</button>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <label className="lg:col-span-2 text-[10px] font-bold text-slate-500 uppercase">Report title<input value={preferences.title} onChange={(event) => setPreferences({ ...preferences, title: event.target.value })} className="mt-1.5 w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs normal-case text-slate-800 outline-none focus:border-indigo-400" /></label>
        <label className="text-[10px] font-bold text-slate-500 uppercase">Layout<select value={preferences.layout} onChange={(event) => setPreferences({ ...preferences, layout: event.target.value })} className="mt-1.5 w-full h-10 px-2 rounded-lg border border-slate-200 bg-white text-xs normal-case text-slate-800"><option value="executive">Executive</option><option value="analytical">Analytical</option><option value="story">Data story</option></select></label>
        <label className="text-[10px] font-bold text-slate-500 uppercase">Typography<select value={preferences.font} onChange={(event) => setPreferences({ ...preferences, font: event.target.value })} className="mt-1.5 w-full h-10 px-2 rounded-lg border border-slate-200 bg-white text-xs normal-case text-slate-800"><option>Inter</option><option>IBM Plex Sans</option><option>Source Sans 3</option></select></label>
        <label className="text-[10px] font-bold text-slate-500 uppercase">Density<select value={preferences.density} onChange={(event) => setPreferences({ ...preferences, density: event.target.value })} className="mt-1.5 w-full h-10 px-2 rounded-lg border border-slate-200 bg-white text-xs normal-case text-slate-800"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
        <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Color system</p><div className="h-10 flex items-center gap-2">{[['indigo', '#4f46e5'], ['emerald', '#059669'], ['sunset', '#e11d48']].map(([name, color]) => <button key={name} onClick={() => setPreferences({ ...preferences, palette: name })} className={`w-8 h-8 rounded-full border-2 ${preferences.palette === name ? 'border-slate-900 ring-2 ring-slate-300' : 'border-white'}`} style={{ background: color }} title={name} />)}</div></div>
      </section>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {!result && <div className="h-72 border border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400"><Presentation className="w-6 h-6 mb-2" /><p className="text-xs font-semibold">Run a SQL query in Workbench first</p><p className="text-[10px] mt-1">The report agent profiles that bounded result.</p></div>}
      {result && !dashboard && <div className="h-72 border border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400"><Sparkles className="w-6 h-6 mb-2" /><p className="text-xs font-semibold">Ready to compose</p><p className="text-[10px] mt-1">Choose preferences, then generate a governed report layout.</p></div>}
      {dashboard && <section className="rounded-lg border border-slate-200 bg-white overflow-hidden" style={{ fontFamily: preferences.font }}><div className={`px-6 py-6 border-b border-slate-200 ${preferences.palette === 'emerald' ? 'bg-emerald-50' : preferences.palette === 'sunset' ? 'bg-rose-50' : 'bg-indigo-50'}`}><p className="text-[10px] uppercase font-bold text-slate-500">AI-generated presentation</p><h2 className="text-2xl font-bold text-slate-900 mt-1">{dashboard.title}</h2><p className="text-sm text-slate-600 mt-1">{dashboard.subtitle}</p><p className="text-xs leading-5 text-slate-500 mt-3 max-w-3xl">{dashboard.narrative}</p></div><div className={`grid grid-cols-1 ${preferences.layout === 'story' ? 'md:grid-cols-1' : preferences.layout === 'analytical' ? 'md:grid-cols-2' : 'md:grid-cols-3'} ${preferences.density === 'compact' ? 'gap-3 p-3' : 'gap-5 p-5'}`}>{dashboard.widgets?.map((widget, index) => <article key={`${widget.title}-${index}`} className={`min-w-0 border border-slate-200 rounded-lg p-4 ${preferences.layout === 'executive' && widget.span === 3 ? 'md:col-span-3' : preferences.layout === 'executive' && widget.span === 2 ? 'md:col-span-2' : preferences.layout === 'analytical' && widget.span > 1 ? 'md:col-span-2' : ''}`}><p className="text-xs font-bold text-slate-800">{widget.title}</p>{widget.type === 'kpi' ? <p className="text-3xl font-bold text-slate-900 mt-4">{typeof profileValue(widget.field) === 'number' ? Number(profileValue(widget.field)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : profileValue(widget.field)}</p> : widget.type === 'narrative' ? <p className="text-xs leading-5 text-slate-500 mt-3">{dashboard.narrative}</p> : widget.type === 'table' ? <div className="overflow-auto mt-3 max-h-64"><table className="w-full text-[10px]"><tbody>{result.rows.slice(0, 8).map((row, rowIndex) => <tr key={rowIndex} className="border-b border-slate-100">{row.slice(0, 5).map((value, valueIndex) => <td key={valueIndex} className="py-1.5 pr-2">{String(value)}</td>)}</tr>)}</tbody></table></div> : <VegaWorkbenchChart idiom={widget.chart_type} result={result} recommendation={{ x_field: result.columns.find((column) => column !== widget.field) || result.columns[0], y_fields: [widget.field] }} palette={preferences.palette} font={preferences.font} />}</article>)}</div><div className="px-5 py-3 border-t border-slate-200 text-[9px] text-slate-400 flex flex-wrap justify-between gap-2"><span>Generated by gemini-3.5-flash-lite from aggregate result profiles</span><span>{result.row_count} bounded rows profiled</span></div></section>}
    </div>
  );
}
