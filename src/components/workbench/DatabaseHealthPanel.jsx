import React, { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { inspectWorkbenchHealth } from '../../services/api';

export default function DatabaseHealthPanel({ connectionId, isDark = false }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inspect = async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await inspectWorkbenchHealth(connectionId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Database health agent</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Integrity, relationships, indexing, capacity, and AI-prioritized actions.</p>
          </div>
        </div>
        <button
          onClick={inspect}
          disabled={loading}
          className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 transition-all shadow-xs"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>Run health check</span>
        </button>
      </section>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}

      {!report && (
        <div className="h-72 flex flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-800 rounded-xl text-slate-400 dark:text-slate-500">
          <ShieldCheck className="w-7 h-7 mb-2" />
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No health report yet</p>
          <p className="text-[10px] mt-1 text-slate-400 dark:text-slate-500">Checks are read-only and do not apply schema changes.</p>
        </div>
      )}

      {report && (
        <>
          <section className="grid sm:grid-cols-4 gap-4 p-5 rounded-2xl bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="sm:col-span-1 border-r border-slate-100 dark:border-slate-800/80 pr-4">
              <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Health score</p>
              <p className={`text-5xl font-bold mt-2 ${report.score >= 85 ? 'text-emerald-600 dark:text-emerald-400' : report.score >= 65 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {report.score}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">out of 100</p>
            </div>
            <div className="sm:col-span-3">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Assessment</p>
              <p className="text-xs leading-5 text-slate-600 dark:text-slate-300 mt-2">{report.summary}</p>
              <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{report.diagnostics?.table_count || 0}</p>
                  <p className="text-[9px] uppercase text-slate-400 dark:text-slate-500 font-semibold">Tables</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{report.diagnostics?.total_rows?.toLocaleString?.() || '-'}</p>
                  <p className="text-[9px] uppercase text-slate-400 dark:text-slate-500 font-semibold">Rows</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{report.diagnostics?.missing_fk_indexes?.length || 0}</p>
                  <p className="text-[9px] uppercase text-slate-400 dark:text-slate-500 font-semibold">Index gaps</p>
                </div>
              </div>
            </div>
          </section>

          <section className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
            {report.findings?.map((finding, index) => (
              <div key={index} className="py-4 flex items-start gap-3">
                {finding.severity === 'warning' || finding.severity === 'critical' ? (
                  <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${finding.severity === 'critical' ? 'text-rose-500' : 'text-amber-500'}`} />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{finding.title}</p>
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                      finding.severity === 'critical' 
                        ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300' 
                        : finding.severity === 'warning' 
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' 
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {finding.severity}
                    </span>
                  </div>
                  <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400 mt-1">{finding.detail}</p>
                  <p className="text-[11px] leading-5 text-indigo-600 dark:text-indigo-400 font-semibold mt-1">Action: {finding.recommendation}</p>
                </div>
              </div>
            ))}
          </section>
          <p className="text-[9px] text-slate-400 dark:text-slate-500">AI interpretation: {report.model}. Deterministic diagnostics remain available in the response for audit.</p>
        </>
      )}
    </div>
  );
}
