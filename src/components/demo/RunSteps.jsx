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
  const tables = find('stage.evidence', 'schema_discovery')[0]?.payload?.ranked_tables;
  if (Array.isArray(tables) && tables.length) out[0] = `Most relevant: ${tables.slice(0, 3).map((t) => t.table).join(', ')}`;
  const join = find('stage.evidence', 'graph_expansion')[0]?.payload?.join_path;
  if (Array.isArray(join) && join.length) out[1] = `Linked ${join.length} related tables through their relationships`;
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
