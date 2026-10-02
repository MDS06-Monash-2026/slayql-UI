import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import AgentStreamPanel from './AgentStreamPanel';

// How a question becomes a checked answer, in five plain steps. Built from the run's event
// stream, so the same view works while running and when reopening an old chat. The full
// technical log stays one click away for anyone who wants it.

const STEPS = [
  { id: 'understand', label: 'Understanding your question', stages: ['preparation', 'intent_validation', 'orchestration', 'schema_discovery'] },
  { id: 'find', label: 'Finding the right data', stages: ['graph_expansion', 'value_grounding'] },
  { id: 'write', label: 'Writing the query', stages: ['model_generation', 'sql_validation', 'semantic_validation'] },
  { id: 'check', label: 'Checking against your data', stages: ['execution', 'verification'] },
  { id: 'answer', label: 'Preparing the answer', stages: ['visualization', 'answer_generation', 'completion'] },
];
const STEP_OF = Object.fromEntries(STEPS.flatMap((s, i) => s.stages.map((st) => [st, i])));
const OUTCOME_WORD = { confident: 'Checks passed', caveat: 'Passed with a caveat', clarify: 'Two meanings found', handoff: 'Sent to an analyst' };
const CHART_WORD = { kpi: 'a headline number', bar: 'a bar chart', line: 'a line chart', area: 'an area chart', pie: 'a pie chart', donut: 'a donut chart', scatter: 'a scatter plot', histogram: 'a histogram', heatmap: 'a heatmap' };

function seconds(ms) {
  if (!ms && ms !== 0) return '';
  return ms < 1000 ? `${Math.max(0.1, ms / 1000).toFixed(1)}s` : `${(ms / 1000).toFixed(1)}s`;
}

function details(events) {
  const out = ['', '', '', '', ''];
  const find = (type, stage) => events.filter((e) => e.type === type && (!stage || e.stage === stage));
  const gen = find('provider.completed', 'model_generation');
  if (gen.length) {
    const last = gen[gen.length - 1].payload || {};
    const repaired = gen.length > 1 || events.some((e) => e.payload?.is_repair);
    out[2] = `${repaired ? 'Rewritten after a check, ' : ''}${seconds(last.duration_ms || last.latency_ms)}`.replace(/, $/, '');
    if (events.some((e) => e.type === 'sql.validation_completed' && e.payload?.is_valid)) out[2] += `${out[2] ? ' · ' : ''}safe, read-only`;
  }
  const consensus = find('verification.consensus')[0]?.payload;
  const decision = find('verification.decision')[0]?.payload;
  const parts = [];
  if (consensus?.candidates > 1) parts.push(`${Math.round((consensus.agreement || 0) * (consensus.succeeded || 0))} of ${consensus.candidates} queries agree`);
  if (decision?.outcome) parts.push(`${OUTCOME_WORD[decision.outcome] || decision.outcome}${typeof decision.probability === 'number' ? ` (${Math.round(decision.probability * 100)}%)` : ''}`);
  out[3] = parts.join(' · ');
  const viz = find('visualization.agent_completed')[0]?.payload;
  if (viz?.idiom && CHART_WORD[viz.idiom]) out[4] = `Shown as ${CHART_WORD[viz.idiom]}`;
  return out;
}

function evidence(events) {
  const pick = (type, stage) => events.find((e) => e.type === type && e.stage === stage)?.payload || {};
  const discovery = pick('stage.evidence', 'schema_discovery');
  const graph = pick('stage.evidence', 'graph_expansion');
  const grounding = pick('stage.evidence', 'value_grounding');
  const ranked = (discovery.ranked_tables || []).map((t) => t.table).filter(Boolean);
  // Tables the final, validated query actually reads (the last validation wins after a repair).
  const validations = events.filter((e) => e.type === 'sql.validation_completed' && Array.isArray(e.payload?.referenced_tables));
  const used = (validations[validations.length - 1]?.payload?.referenced_tables || []).map((t) => String(t).split('.').pop().toLowerCase());
  return {
    ranked,
    used,
    linked: (graph.join_path || []).filter(Boolean),
    relationships: (graph.relationships || []).filter((r) => r.from_table && r.to_table),
    values: (grounding.grounded_values || [])
      .filter((v) => v.table && v.column && v.value !== undefined && Number(v.score ?? 1) > 0)
      .slice(0, 6),
  };
}

function Chip({ children, strong, isDark, title }) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-[16rem] items-center truncate rounded-md border px-1.5 py-0.5 font-mono text-[11px] ${
        strong
          ? isDark ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200' : 'border-indigo-200 bg-indigo-50 text-indigo-800'
          : isDark ? 'border-slate-700 bg-slate-800/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'
      }`}
    >
      {children}
    </span>
  );
}

function ChipList({ items, limit = 8, isDark, strongSet, strongTitle = 'Best match for your question' }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((item) => (
        <Chip key={item} isDark={isDark} strong={strongSet?.has(item)} title={strongSet?.has(item) ? strongTitle : undefined}>{item}</Chip>
      ))}
      {items.length > limit && (
        <button type="button" onClick={() => setAll((v) => !v)} className={`text-[11px] font-medium ${isDark ? 'text-indigo-300' : 'text-indigo-600'} hover:underline`}>
          {all ? 'Show less' : `+${items.length - limit} more`}
        </button>
      )}
    </div>
  );
}

function StepEvidence({ index, ev, isDark }) {
  const [showLinks, setShowLinks] = useState(false);
  const label = `text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`;
  if (index === 0 && ev.ranked.length) {
    return (
      <div className="mt-1.5 space-y-1">
        <p className={label}>Most relevant tables</p>
        <ChipList items={ev.ranked} isDark={isDark} strongSet={new Set(ev.ranked.slice(0, 1))} />
      </div>
    );
  }
  if (index === 1 && (ev.linked.length || ev.values.length)) {
    const usedSet = new Set(ev.used);
    const linked = ev.used.length ? [...ev.linked.filter((t) => usedSet.has(t.toLowerCase())), ...ev.linked.filter((t) => !usedSet.has(t.toLowerCase()))] : ev.linked;
    return (
      <div className="mt-1.5 space-y-2">
        {ev.linked.length > 0 && (
          <div className="space-y-1">
            <p className={label}>
              {ev.used.length ? `Tables considered (${ev.linked.length}) · the query reads the highlighted ${ev.used.length === 1 ? 'one' : ev.used.length}` : `Tables considered (${ev.linked.length})`}
            </p>
            <ChipList items={linked} isDark={isDark} strongSet={new Set(linked.filter((t) => usedSet.has(t.toLowerCase())))} strongTitle="Read by the final query" />
          </div>
        )}
        {ev.values.length > 0 && (
          <div className="space-y-1">
            <p className={label}>Values matched in your data</p>
            <div className="flex flex-wrap gap-1">
              {ev.values.map((v) => (
                <Chip key={`${v.table}.${v.column}=${v.value}`} isDark={isDark} title={`${v.table}.${v.column} = ${v.value}`}>{v.table}.{v.column} = {String(v.value)}</Chip>
              ))}
            </div>
          </div>
        )}
        {ev.relationships.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowLinks((v) => !v)} className={`text-[11px] font-medium ${isDark ? 'text-indigo-300' : 'text-indigo-600'} hover:underline`}>
              {showLinks ? 'Hide how they connect' : `How they connect (${ev.relationships.length} links)`}
            </button>
            {showLinks && (
              <ul className={`mt-1.5 space-y-0.5 rounded-lg p-2 font-mono text-[11px] ${isDark ? 'bg-slate-800/50 text-slate-300' : 'bg-slate-50 text-slate-700'}`}>
                {ev.relationships.map((r) => (
                  <li key={`${r.from_table}.${r.from_column}-${r.to_table}.${r.to_column}`}>
                    {r.from_table}.{r.from_column} <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>→</span> {r.to_table}.{r.to_column}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
}

export default function RunSteps({ events = [], isRunning = false, sql, isDark = false, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen || isRunning);
  const [showLog, setShowLog] = useState(false);
  useEffect(() => { if (isRunning) setOpen(true); }, [isRunning]);

  const { current, failed, times, total } = useMemo(() => {
    let cur = 0;
    const firstAt = Array(STEPS.length).fill(null);
    for (const e of events) {
      const index = STEP_OF[e.stage];
      if (index === undefined) continue;
      cur = Math.max(cur, index);
      const at = e.occurred_at ? Date.parse(e.occurred_at) : null;
      if (at && firstAt[index] === null) firstAt[index] = at;
    }
    const ended = events.find((e) => e.type === 'run.completed' || e.type === 'run.failed' || e.type === 'run.cancelled');
    const endAt = ended?.occurred_at ? Date.parse(ended.occurred_at) : null;
    const stepTimes = firstAt.map((start, i) => {
      if (start === null) return null;
      const next = firstAt.slice(i + 1).find((v) => v !== null) ?? endAt;
      return next ? next - start : null;
    });
    const begin = firstAt.find((v) => v !== null);
    return {
      current: cur,
      failed: events.some((e) => e.type === 'run.failed'),
      times: stepTimes,
      total: begin && endAt ? endAt - begin : null,
    };
  }, [events]);
  const notes = useMemo(() => details(events), [events]);
  const ev = useMemo(() => evidence(events), [events]);

  if (!events.length && !isRunning) return null;
  const done = !isRunning && !failed;
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`rounded-2xl border text-sm ${isDark ? 'border-slate-800 bg-[#121622]' : 'border-slate-200 bg-white'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
      >
        {isRunning ? (
          <Loader2 className={`h-4 w-4 shrink-0 animate-spin ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`} aria-hidden="true" />
        ) : failed ? (
          <X className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
        ) : (
          <Check className={`h-4 w-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} aria-hidden="true" />
        )}
        <span className={`flex-1 font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
          {isRunning
            ? `${STEPS[current].label}...`
            : failed ? 'Stopped before an answer' : `Worked through ${STEPS.length} steps${total ? ` in ${seconds(total)}` : ''}`}
        </span>
        {isRunning && <span className={`text-xs tabular-nums ${muted}`}>Step {current + 1} of {STEPS.length}</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${muted} ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="px-4 pb-3">
          <ol className="relative space-y-3 pl-1">
            {STEPS.map((step, i) => {
              const state = done || i < current ? 'done' : i === current ? (failed ? 'failed' : isRunning ? 'active' : 'done') : 'pending';
              return (
                <li key={step.id} className="relative flex gap-3">
                  {i < STEPS.length - 1 && (
                    <span aria-hidden="true" className={`absolute left-[9px] top-5 h-[calc(100%-4px)] w-px ${state === 'done' ? (isDark ? 'bg-emerald-500/40' : 'bg-emerald-200') : isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
                  )}
                  <span className={`relative z-[1] mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    state === 'done' ? 'bg-emerald-500 text-white'
                      : state === 'active' ? (isDark ? 'bg-indigo-500 text-white' : 'bg-indigo-600 text-white')
                      : state === 'failed' ? 'bg-rose-500 text-white'
                      : isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {state === 'done' ? <Check className="h-3 w-3" aria-hidden="true" />
                      : state === 'active' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      : state === 'failed' ? <X className="h-3 w-3" aria-hidden="true" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className={`text-[13px] ${state === 'pending' ? muted : isDark ? 'text-slate-100' : 'text-slate-900'} ${state === 'active' ? 'font-semibold' : 'font-medium'}`}>{step.label}</p>
                      {state === 'done' && times[i] !== null && <span className={`shrink-0 text-[11px] tabular-nums ${muted}`}>{seconds(times[i])}</span>}
                    </div>
                    {notes[i] && state !== 'pending' && <p className={`mt-0.5 truncate text-xs ${muted}`}>{notes[i]}</p>}
                    {state !== 'pending' && i < 2 && <StepEvidence index={i} ev={ev} isDark={isDark} />}
                  </div>
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className={`mt-3 text-xs font-medium underline-offset-4 hover:underline ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}
          >
            {showLog ? 'Hide technical log' : 'Show technical log'}
          </button>
          {showLog && (
            <div className="mt-2">
              <AgentStreamPanel events={events} isRunning={isRunning} sql={sql} isDark={isDark} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
