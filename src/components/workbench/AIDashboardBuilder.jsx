import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  Presentation,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Undo2,
  TrendingUp,
  Table2,
  BarChart3,
  FileText,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { editPowerBIReport, generatePowerBIReport } from '../../services/api';
import DataTablePanel from '../demo/DataTablePanel';
import VegaWorkbenchChart from './VegaWorkbenchChart';

const initialPreferences = {
  title: 'Executive Revenue & Operations Briefing',
  layout: 'executive',
  palette: 'indigo',
  font: 'Inter',
  density: 'comfortable',
};

const REPORT_PALETTE_TOKENS = {
  indigo: { accent: '#4f46e5', soft: '#eef2ff', border: '#c7d2fe' },
  emerald: { accent: '#059669', soft: '#ecfdf5', border: '#a7f3d0' },
  sunset: { accent: '#e11d48', soft: '#fff1f2', border: '#fecdd3' },
};

export default function AIDashboardBuilder({
  connectionId,
  result = null,
  sql = '',
  isDark = false,
  onDirtyChange,
  onRegisterSave,
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedWidgetId, setSelectedWidgetId] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [localResult, setLocalResult] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');

  const storageKey = connectionId ? `slayql:report-studio:${connectionId}` : null;
  const saveDashboard = useCallback(() => {
    if (!storageKey || !report) return false;
    const payload = { report, history, preferences, result: localResult };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
      setSavedSnapshot(JSON.stringify(report));
      setMessage('Dashboard saved locally for this connection.');
      return true;
    } catch {
      setError('Unable to save this dashboard in browser storage.');
      return false;
    }
  }, [storageKey, report, history, preferences, localResult]);

  useEffect(() => {
    if (!storageKey) return undefined;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved?.report) {
        setReport(saved.report);
        setHistory(Array.isArray(saved.history) ? saved.history : []);
        setPreferences({ ...initialPreferences, ...(saved.preferences || {}) });
        setLocalResult(saved.result || null);
        setSavedSnapshot(JSON.stringify(saved.report));
        setMessage('Restored the saved dashboard for this connection.');
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
    return undefined;
  }, [storageKey]);

  const isDirty = Boolean(report && JSON.stringify(report) !== savedSnapshot);

  useEffect(() => {
    onDirtyChange?.(isDirty);
    onRegisterSave?.(saveDashboard);
    return () => onRegisterSave?.(null);
  }, [isDirty, onDirtyChange, onRegisterSave, saveDashboard]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Safe active result guaranteeing non-null arrays
  const activeResult = useMemo(() => {
    const current = localResult || result;
    return {
      columns: Array.isArray(current?.columns) ? current.columns : [],
      column_types: Array.isArray(current?.column_types) ? current.column_types : [],
      rows: Array.isArray(current?.rows) ? current.rows : [],
      row_count: current?.row_count ?? (Array.isArray(current?.rows) ? current.rows.length : 0),
    };
  }, [localResult, result]);

  const boundedResult = useMemo(() => ({
    columns: activeResult.columns,
    column_types: activeResult.column_types,
    rows: activeResult.rows.slice(0, 200),
  }), [activeResult]);

  const profile = report?.data_profile;

  const profileValue = (field) => {
    if (field === 'row_count') {
      return profile?.row_count ?? activeResult.row_count ?? activeResult.rows.length ?? 0;
    }
    const colProfile = profile?.columns?.find((item) => item.name === field);
    if (colProfile) {
      if (typeof colProfile.average === 'number') return colProfile.average;
      if (typeof colProfile.max === 'number') return colProfile.max;
      if (colProfile.top_values?.length) return colProfile.top_values[0].value;
    }
    // Fallback inspect from actual rows
    const colIndex = activeResult.columns.indexOf(field);
    if (colIndex >= 0 && activeResult.rows.length) {
      const firstVal = activeResult.rows[0][colIndex];
      return firstVal !== undefined && firstVal !== null ? firstVal : '-';
    }
    return '-';
  };

  const generate = async () => {
    setGenerating(true);
    setError('');
    setMessage('');
    try {
      const response = await generatePowerBIReport(connectionId, {
        preference: { ...preferences, source_sql: sql },
        result: boundedResult,
      });
      setReport(response);
      if (response.result && (!activeResult.rows.length || !activeResult.columns.length)) {
        setLocalResult(response.result);
      }
      setHistory([]);
    } catch (err) {
      setError(err.message || 'Unable to generate report. Check connection or credit balance.');
    } finally {
      setGenerating(false);
    }
  };

  const applyEdit = async (text = instruction) => {
    const promptText = (text || instruction).trim();
    if (!report || !promptText) return;
    setEditing(true);
    setError('');
    try {
      const response = await editPowerBIReport(connectionId, {
        report,
        instruction: promptText,
        selected_widget_id: selectedWidgetId,
      });
      setHistory((items) => [...items, report]);
      setReport(response.report);
      setMessage(response.message || 'Report updated successfully.');
      setInstruction('');
    } catch (err) {
      setError(err.message || 'Unable to update report.');
    } finally {
      setEditing(false);
    }
  };

  const exportReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(report.title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const undo = () => {
    if (history.length) {
      setReport(history[history.length - 1]);
      setHistory((items) => items.slice(0, -1));
      setMessage('Restored the previous report version.');
    }
  };

  const reset = () => {
    setReport(null);
    setHistory([]);
    setMessage('');
    setSelectedWidgetId(null);
  };

  const palette = report?.theme?.palette || preferences.palette;
  const layout = report?.layout || preferences.layout;
  const reportFont = report?.theme?.font || preferences.font;
  const paletteTokens = REPORT_PALETTE_TOKENS[palette] || REPORT_PALETTE_TOKENS.indigo;
  const reportStyle = {
    fontFamily: reportFont,
    '--report-accent': paletteTokens.accent,
    '--report-soft': paletteTokens.soft,
    '--report-border': paletteTokens.border,
  };

  return (
    <div className="space-y-6">
      {/* Studio Header Bar */}
      <section className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                AI Report Studio
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60">
                DeepSeek Power BI Engine
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Compose governed, interactive business dashboards with live Vega charts, KPIs, and executive narratives.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!history.length || editing}
            title="Undo last edit"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!report || editing}
            title="Reset report"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {report && (
            <button
              type="button"
              onClick={saveDashboard}
              disabled={!isDirty}
              title="Save dashboard locally"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <Save className="w-4 h-4" />
            </button>
          )}
          {report && (
            <button
              type="button"
              onClick={exportReport}
              title="Export report JSON"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={generating || !connectionId}
            className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 shadow-sm shadow-indigo-500/20 transition-all cursor-pointer"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Composing Dashboard...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{report ? 'Regenerate Report' : 'Generate Report'}</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* Preferences & Layout Configuration Grid */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#121622]/50">
        <label className="lg:col-span-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Report Title
          <input
            value={preferences.title}
            onChange={(e) => setPreferences({ ...preferences, title: e.target.value })}
            className="mt-1.5 w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs normal-case text-slate-800 dark:text-slate-100 focus:border-indigo-500 outline-none"
          />
        </label>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Layout Format
          <select
            value={preferences.layout}
            onChange={(e) => setPreferences({ ...preferences, layout: e.target.value })}
            className="mt-1.5 w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs normal-case text-slate-800 dark:text-slate-100 focus:border-indigo-500 outline-none"
          >
            <option value="executive">Executive Grid</option>
            <option value="analytical">Analytical Split</option>
            <option value="story">Data Story Feed</option>
          </select>
        </label>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Color Palette
          <select
            value={preferences.palette}
            onChange={(e) => setPreferences({ ...preferences, palette: e.target.value })}
            className="mt-1.5 w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs normal-case text-slate-800 dark:text-slate-100 focus:border-indigo-500 outline-none"
          >
            <option value="indigo">Indigo / Royal Blue</option>
            <option value="emerald">Emerald / Teal</option>
            <option value="sunset">Sunset / Coral</option>
          </select>
        </label>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Density
          <select
            value={preferences.density}
            onChange={(e) => setPreferences({ ...preferences, density: e.target.value })}
            className="mt-1.5 w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs normal-case text-slate-800 dark:text-slate-100 focus:border-indigo-500 outline-none"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Typography
          <select
            value={preferences.font}
            onChange={(e) => setPreferences({ ...preferences, font: e.target.value })}
            className="mt-1.5 w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs normal-case text-slate-800 dark:text-slate-100 focus:border-indigo-500 outline-none"
          >
            <option value="Inter">Inter</option>
            <option value="IBM Plex Sans">IBM Plex Sans</option>
            <option value="Source Sans 3">Source Sans 3</option>
            <option value="system-ui">System UI</option>
          </select>
        </label>
      </section>

      {/* Error Alert Box */}
      {error && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Initial Empty / Ready State */}
      {!report && (
        <div className="h-64 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-slate-50/30 dark:bg-slate-900/20">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 shadow-xs">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Ready to Compose Power BI Report
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mt-1 mb-4">
            Click <strong>Generate Report</strong> to analyze your schema and construct an interactive dashboard with KPIs, Vega charts, and executive insights.
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={generating || !connectionId}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-all"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Baseline Dashboard
          </button>
        </div>
      )}

      {/* Generated Report Presentation Canvas */}
      {report && (
        <section
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121622] overflow-hidden shadow-sm"
          style={reportStyle}
        >
          {/* Executive Header Banner */}
          <header className="px-6 py-6 border-b dark:border-slate-800" style={{ backgroundColor: isDark ? '#151922' : paletteTokens.soft, borderColor: isDark ? undefined : paletteTokens.border }}>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[9.5px] uppercase font-extrabold tracking-wider text-white" style={{ backgroundColor: paletteTokens.accent }}>
                Executive Briefing
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {report.mode === 'openrouter' ? 'DeepSeek AI Curated' : 'Governed Schema Analysis'}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2 tracking-tight">
              {report.title}
            </h1>
            {report.subtitle && (
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {report.subtitle}
              </p>
            )}
            {report.narrative && (
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-3 max-w-4xl">
                {report.narrative}
              </p>
            )}
          </header>

          {/* Interactive Widgets Grid */}
          <div
            className={`grid grid-cols-1 ${
              layout === 'story'
                ? 'md:grid-cols-1'
                : layout === 'analytical'
                ? 'md:grid-cols-2'
                : 'md:grid-cols-3'
            } ${report.theme?.density === 'compact' ? 'gap-3.5 p-4' : 'gap-5 p-6'}`}
          >
            {(report.sections || []).flatMap((section) => section.widgets || []).map((widget) => {
              const isSelected = selectedWidgetId === widget.id;
              const spanClasses = widget.span > 1 ? 'md:col-span-2' : '';

              return (
                <article
                  key={widget.id}
                  onClick={() => setSelectedWidgetId(isSelected ? null : widget.id)}
                  className={`min-w-0 border bg-slate-50/60 dark:bg-[#161c27] rounded-xl p-5 cursor-pointer transition-all duration-150 relative group ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  } ${spanClasses}`}
                  style={{ borderColor: isSelected ? paletteTokens.accent : undefined }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {widget.title}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isSelected && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                          Active Target
                        </span>
                      )}
                      <MessageCircle
                        className={`w-3.5 h-3.5 transition-colors ${
                          isSelected
                            ? 'text-indigo-500'
                            : 'text-slate-400 opacity-0 group-hover:opacity-100'
                        }`}
                      />
                    </div>
                  </div>

                  {/* KPI Card */}
                  {widget.type === 'kpi' && (
                    <div className="mt-4">
                      <div className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100" style={{ color: isDark ? undefined : paletteTokens.accent }}>
                        {typeof profileValue(widget.field) === 'number'
                          ? Number(profileValue(widget.field)).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })
                          : profileValue(widget.field)}
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400">
                        <TrendingUp className="w-3 h-3 text-emerald-500" />
                        <span>Aggregated metric from schema profile</span>
                      </div>
                    </div>
                  )}

                  {/* Narrative Card */}
                  {widget.type === 'narrative' && (
                    <p className="text-xs leading-5 text-slate-600 dark:text-slate-300 mt-2">
                      {report.narrative || 'Summary insights generated from the data model.'}
                    </p>
                  )}

                  {/* Data Table Widget */}
                  {widget.type === 'table' && (
                    <div className="mt-3">
                      <DataTablePanel
                        columns={activeResult.columns}
                        rows={activeResult.rows}
                        isDark={isDark}
                      />
                    </div>
                  )}

                  {/* Vega Chart Widget */}
                  {widget.type === 'chart' && (
                    <div className="mt-3">
                      <VegaWorkbenchChart
                        idiom={widget.chart_type}
                        result={activeResult}
                        recommendation={{
                          x_field: widget.config?.x_field,
                          y_fields: widget.config?.y_fields || [widget.field],
                        }}
                        palette={palette}
                        font={report.theme?.font || preferences.font}
                        isDark={isDark}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Footer Metrics */}
          <footer className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/40">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>{message || 'Click any card to target, then describe changes in the assistant below.'}</span>
            </span>
            <span className="font-mono font-semibold">
              {profile?.row_count ?? activeResult.row_count} records analyzed
            </span>
          </footer>
        </section>
      )}

      {/* Interactive Natural Language Report Assistant */}
      {report && (
        <section className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-[#121622] shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950/80 text-indigo-500 flex items-center justify-center">
                <MessageCircle className="w-3.5 h-3.5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Interactive Dashboard Assistant
              </h4>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {selectedWidgetId ? `Target: #${selectedWidgetId}` : 'Target: Entire Dashboard'}
            </span>
          </div>

          <div className="flex gap-2">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) applyEdit();
              }}
              placeholder={
                selectedWidgetId
                  ? 'e.g. "Rename this card to Total Revenue" or "Change to a bar chart comparison"'
                  : 'e.g. "Add a trend chart for monthly sales" or "Switch layout to analytical split"'
              }
              rows={2}
              className="flex-1 resize-y rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:border-indigo-500 outline-none placeholder-slate-400"
            />
            <button
              type="button"
              onClick={() => applyEdit()}
              disabled={editing || !instruction.trim()}
              title="Apply report edit"
              className="px-4 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50 shadow-sm transition-all"
            >
              {editing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Apply</span>
            </button>
          </div>

          {/* Quick Preset Prompts */}
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              'Rename this visual',
              'Use a trend line chart',
              'Switch to grouped bar comparison',
              'Add an executive narrative',
              'Change layout to executive grid',
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => applyEdit(prompt)}
                className="text-[10px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                + {prompt}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
