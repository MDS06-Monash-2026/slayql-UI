import React, { useState } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Check, Code2, Loader2, Pencil, ShieldCheck, Table2, BarChart3 } from 'lucide-react';
import TrustBadge from '../trust/TrustBadge';
import DataTablePanel from '../demo/DataTablePanel';
import ReportChart from './ReportChart';
import { formatValue, periodLabel, themeFor, upIsBad } from './chartTheme';

const NUMBER_PATTERN = /((?<![\w.\-/])[-+]?\d[\d,]*(?:\.\d+)?(?:[KMB%x]|\s?times)?(?![\w\-/]))/gi;

// Numbers in findings are bold so the eye lands on them (as in the reference dashboards).
function Emphasised({ text }) {
  const parts = String(text || '').split(NUMBER_PATTERN);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-slate-900 dark:text-white">{part}</strong> : <React.Fragment key={i}>{part}</React.Fragment>));
}

function Evidence({ item }) {
  const findings = item.findings || [];
  if (!findings.length && !item.definitions_used?.length && !item.repaired) {
    return <p className="text-xs text-slate-500">All checks passed: join grain, business definitions, date coverage, result sanity and data coverage.</p>;
  }
  return (
    <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
      {findings.map((f, i) => <li key={i}><b className="font-semibold">{f.title}.</b> {f.detail}</li>)}
      {item.definitions_used?.map((d) => <li key={d.term}>Uses the approved definition of <b>{d.term}</b> (version {d.version}).</li>)}
      {item.repaired && <li>SlayQL rewrote the first query after a check failed, and the new one passed.</li>}
    </ul>
  );
}

function Options({ item, onChoose, busy }) {
  if (item.outcome !== 'clarify' || !item.options?.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Which figure do you mean?</p>
      {item.options.map((option) => (
        <button
          key={option.label}
          type="button"
          disabled={busy}
          onClick={() => onChoose(item, option)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-indigo-400 hover:bg-indigo-50/50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-indigo-950/30"
        >
          <span className="text-slate-700 dark:text-slate-200">{option.label}</span>
          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{option.preview}</span>
        </button>
      ))}
    </div>
  );
}

function Sparkline({ points, isDark }) {
  const theme = themeFor(isDark);
  const data = points.map(([x, y]) => ({ x, y }));
  return (
    <div className="h-9 w-24" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
          <Line type="monotone" dataKey="y" stroke={theme.deemphasis} strokeWidth={2} isAnimationActive={false}
            dot={(p) => (p.index === data.length - 1
              ? <circle key="last" cx={p.cx} cy={p.cy} r={3} fill={theme.series[0]} stroke={theme.surface} strokeWidth={2} />
              : null)} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiTile({ kpi, isDark, onEdit, onChoose, busy }) {
  const answered = kpi.outcome === 'confident' || kpi.outcome === 'caveat';
  const change = answered && kpi.previous ? (kpi.value - kpi.previous) / Math.abs(kpi.previous) : null;
  const good = change !== null && (change >= 0) !== upIsBad(kpi.label);
  return (
    <article className="group relative flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#141925]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{kpi.label}</p>
        <button type="button" onClick={() => onEdit(kpi, 'kpi')} title="Change this figure"
          className="rounded p-1 text-slate-400 opacity-0 hover:text-indigo-600 focus:opacity-100 group-hover:opacity-100 print:hidden">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      {kpi.pending ? (
        <div className="mt-3 h-8 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      ) : answered ? (
        <div className="mt-1 flex items-end justify-between gap-2">
          <div>
            <p className="text-[28px] font-semibold leading-tight text-slate-950 dark:text-white">{formatValue(kpi.value, kpi.format)}</p>
            {kpi.period && <p className="text-[11px] text-slate-500">{periodLabel(kpi.period)}</p>}
            {change !== null && (
              <p className={`mt-1 inline-flex items-center gap-0.5 text-xs font-semibold ${good ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(change * 100).toFixed(1)}%
                <span className="ml-1 font-normal text-slate-500">vs {periodLabel(kpi.comparison_label || 'previous')}</span>
              </p>
            )}
          </div>
          {kpi.spark?.length > 2 && <Sparkline points={kpi.spark} isDark={isDark} />}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {kpi.outcome === 'clarify' ? 'This figure depends on which records count.' : 'Not shown: it did not pass its checks.'}
        </p>
      )}
      {!kpi.pending && (
        <div className="mt-3">
          <TrustBadge outcome={kpi.outcome} size="sm" isDark={isDark} approved={Boolean(kpi.definitions_used?.length)} />
        </div>
      )}
      <Options item={kpi} onChoose={onChoose} busy={busy} />
      {kpi.outcome === 'handoff' && kpi.findings?.[0] && <p className="mt-2 text-xs text-slate-500">{kpi.findings[0].title}. It is in the analyst review queue.</p>}
    </article>
  );
}

function PanelCard({ panel, width = 1, isDark, onEdit, onChoose, busy }) {
  const [view, setView] = useState(panel.chart === 'table' ? 'table' : 'chart');
  const [showSql, setShowSql] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const span = width >= 3 ? 'lg:col-span-3' : width === 2 ? 'lg:col-span-2' : '';
  const answered = panel.outcome === 'confident' || panel.outcome === 'caveat';
  const facts = (panel.facts || []).filter((f) => f.kind !== 'rows').slice(0, 2);
  return (
    <article className={`group flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 break-inside-avoid dark:border-slate-800 dark:bg-[#141925] ${span}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{panel.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{panel.question}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 print:hidden">
          {panel.chart !== 'table' && answered && (
            <button type="button" onClick={() => setView(view === 'chart' ? 'table' : 'chart')} title={view === 'chart' ? 'Show as table' : 'Show as chart'}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
              {view === 'chart' ? <Table2 className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
            </button>
          )}
          <button type="button" onClick={() => setShowSql(!showSql)} title="Show the query"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <Code2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onEdit(panel, 'panel')} title="Change this chart"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </header>
      {!panel.pending && (
        <button type="button" onClick={() => setShowEvidence(!showEvidence)} className="mt-2 self-start text-left print:pointer-events-none" aria-expanded={showEvidence}>
          <TrustBadge outcome={panel.outcome} size="sm" isDark={isDark} approved={Boolean(panel.definitions_used?.length)} />
        </button>
      )}
      {showEvidence && <div className="mt-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60"><Evidence item={panel} /></div>}
      {showSql && <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{panel.sql}</pre>}
      <div className="mt-3 min-h-0 flex-1">
        {panel.pending ? (
          <div className="flex h-56 items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400 dark:bg-slate-900/40">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running and checking…
          </div>
        ) : !answered ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {panel.outcome === 'clarify' ? 'This chart depends on which records count. Choose one:' : 'Not shown: this chart did not pass its checks and is with an analyst.'}
            <Options item={panel} onChoose={onChoose} busy={busy} />
            {panel.outcome !== 'clarify' && <div className="mt-2"><Evidence item={panel} /></div>}
          </div>
        ) : !(panel.rows || []).length ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            {panel.purpose === 'exception' ? 'None this period: nothing matched, which is good news.' : 'No rows matched this figure on the full data.'}
          </div>
        ) : view === 'table' ? (
          <DataTablePanel columns={panel.columns || []} rows={panel.rows || []} isDark={isDark} isTruncated={panel.truncated} />
        ) : (
          <ReportChart panel={panel} isDark={isDark} />
        )}
      </div>
      {answered && facts.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
          {facts.map((f) => {
            const text = f.text.replace(`${panel.title}: `, '');
            return <li key={f.id}><Emphasised text={text.charAt(0).toUpperCase() + text.slice(1)} /></li>;
          })}
        </ul>
      )}
    </article>
  );
}

// Widen the last chart in a row so every row of the three-column grid is full.
function packWidths(panels) {
  const widths = {};
  let row = [];
  let used = 0;
  const close = () => {
    if (row.length && used < 3) widths[row[row.length - 1].id] += 3 - used;
    row = [];
    used = 0;
  };
  panels.forEach((panel) => {
    const span = Math.min(3, Math.max(1, Number(panel.span) || 1));
    if (used + span > 3) close();
    widths[panel.id] = span;
    row.push(panel);
    used += span;
    if (used === 3) close();
  });
  close();
  return widths;
}

function TrustStrip({ trust, pending }) {
  const total = Object.values(trust || {}).reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
      <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-100">
        <ShieldCheck className="h-4 w-4 text-emerald-600" /> Every figure was run on the full data and checked
      </span>
      <span>{trust.confident + trust.caveat} of {total} passed{trust.caveat ? ` (${trust.caveat} with a caveat)` : ''}</span>
      {trust.clarify > 0 && <span className="text-sky-700 dark:text-sky-300">{trust.clarify} need your definition</span>}
      {trust.handoff > 0 && <span>{trust.handoff} with an analyst</span>}
      {pending > 0 && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {pending} still checking</span>}
    </p>
  );
}

export default function ReportCanvas({ report, isDark = false, onEdit, onChoose, busy = false }) {
  const kpis = report.kpis || [];
  const panels = report.panels || [];
  const narrative = report.narrative;
  const meta = report.meta || {};
  const pending = [...kpis, ...panels].filter((i) => i.pending).length;
  const widths = packWidths(panels);
  const trust = report.trust || [...kpis, ...panels].filter((i) => !i.pending).reduce((acc, i) => ({ ...acc, [i.outcome]: (acc[i.outcome] || 0) + 1 }), { confident: 0, caveat: 0, clarify: 0, handoff: 0 });

  return (
    <div className="report-print-root space-y-4 rounded-3xl bg-[#f7f7f5] p-4 sm:p-6 dark:bg-[#0b0e16]">
      <header className="space-y-2">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-950 dark:text-white">{report.title}</h1>
        {report.subtitle && <p className="text-sm text-slate-600 dark:text-slate-300">{report.subtitle}</p>}
        <TrustStrip trust={trust} pending={pending} />
      </header>

      {kpis.length > 0 && (
        <section className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${kpis.length >= 4 ? 'lg:grid-cols-4' : kpis.length === 3 ? 'lg:grid-cols-3' : ''}`} aria-label="Key figures">
          {kpis.map((kpi) => <KpiTile key={kpi.id} kpi={kpi} isDark={isDark} onEdit={onEdit} onChoose={onChoose} busy={busy} />)}
        </section>
      )}

      {narrative && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#141925]" aria-label="Key highlights">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key highlights</p>
          <p className="mt-2 text-base leading-relaxed text-slate-800 dark:text-slate-100"><Emphasised text={narrative.headline} /></p>
          {narrative.findings?.length > 0 && (
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {narrative.findings.map((f, i) => <li key={i}><Emphasised text={f.text} /></li>)}
            </ul>
          )}
          {narrative.next_steps?.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Suggested next steps</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
                {narrative.next_steps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            {narrative.source === 'model'
              ? `Written by AI from ${report.facts?.length || 0} computed findings; every number was checked against them.`
              : `Written from ${report.facts?.length || 0} computed findings.`}
            {narrative.removed_sentences > 0 && ` ${narrative.removed_sentences} AI sentence${narrative.removed_sentences > 1 ? 's were' : ' was'} removed because ${narrative.removed_sentences > 1 ? 'their numbers were' : 'its numbers were'} not in the data.`}
          </p>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3" aria-label="Analysis">
        {panels.map((panel) => <PanelCard key={panel.id} panel={panel} width={widths[panel.id]} isDark={isDark} onEdit={onEdit} onChoose={onChoose} busy={busy} />)}
      </section>

      {meta.generated_at && (
        <footer className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-[11px] text-slate-500 sm:grid-cols-3 dark:border-slate-800 dark:bg-[#141925]">
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">How this report was made</p>
            <p>{meta.planner === 'model' ? `Planned by ${meta.model}` : String(meta.planner || '').startsWith('template:') ? 'Ready-made pack (figures written in advance)' : 'Planned from the database structure'} · {meta.refreshed ? 'refreshed' : 'generated'} {new Date(meta.generated_at).toLocaleString()}</p>
            <p>Confidence: {meta.confidence_model}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">Definitions applied</p>
            <p>{meta.definitions?.length ? meta.definitions.map((d) => `${d.term} (v${d.version})`).join(', ') : 'None approved yet for this data source.'}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">What was sent to the AI</p>
            {meta.data_sent?.length ? meta.data_sent.map((line) => <p key={line}>{line}</p>) : <p>Nothing: this version used no AI.</p>}
            <p>No table rows were sent. AI cost USD {Number(meta.ai_cost_usd || 0).toFixed(4)} ({meta.ai_calls || 0} calls).</p>
          </div>
        </footer>
      )}
    </div>
  );
}
