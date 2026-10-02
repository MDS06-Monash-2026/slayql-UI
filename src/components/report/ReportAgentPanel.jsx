import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  BookOpen,
  Bot,
  Check,
  History,
  Loader2,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  TriangleAlert,
  X,
} from 'lucide-react';

const STEP_ICONS = {
  list_tables: Table2,
  describe_table: Table2,
  profile_column: Search,
  run_sql: Play,
  get_definitions: BookOpen,
  submit_report: ShieldCheck,
  edit_report: ShieldCheck,
  ask_user: Sparkles,
  answer: Bot,
  think: Sparkles,
  fallback: Bot,
};

export const STAGES = [
  { id: 'explore', label: 'Explore the data' },
  { id: 'check', label: 'Run and check each figure' },
  { id: 'findings', label: 'Compute findings and summary' },
];

export function StageRail({ stage }) {
  const order = STAGES.findIndex((s) => s.id === stage);
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-live="polite">
      {STAGES.map((s, index) => {
        const state = stage === 'done' || index < order ? 'done' : index === order ? 'active' : 'waiting';
        return (
          <li key={s.id} className="flex items-center gap-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              state === 'done' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                : state === 'active' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
              {state === 'done' ? <Check className="h-3 w-3" /> : state === 'active' ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              {s.label}
            </span>
            {index < STAGES.length - 1 && <span className="h-px w-3 bg-slate-300 dark:bg-slate-700" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

// The agent's steps as they stream in: tables read, columns profiled, queries tested, plans checked.
export function AgentTimeline({ steps, running, compact = false }) {
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [steps.length]);
  return (
    <ol className={`relative space-y-0 ${compact ? 'text-xs' : 'text-[13px]'}`}>
      {steps.map((step, i) => {
        const Icon = STEP_ICONS[step.name] || Sparkles;
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex gap-3 pb-3 tl-fill">
            {!last && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />}
            <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-[#121622] ${
              step.ok === false ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                : step.name === 'submit_report' || step.name === 'edit_report' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'}`}>
              {step.ok === false ? <TriangleAlert className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </span>
            <span className={`pt-1 leading-snug ${step.name === 'think' ? 'italic text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>{step.label}</span>
          </li>
        );
      })}
      {running && (
        <li className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white"><Loader2 className="h-3.5 w-3.5 animate-spin" /></span>
          <span>{steps.length ? 'Thinking about the next step…' : 'Reading your database…'}</span>
        </li>
      )}
      <li ref={end} aria-hidden="true" />
    </ol>
  );
}

const FOLLOW_UPS = [
  'Add a chart of refunds by month',
  'Split revenue by customer segment',
  'Make this a monthly report',
  'Which figure changed most this period?',
];

// Follow-up chat with the report agent, docked beside the dashboard.
export function ReportCopilot({ messages, steps, running, draft, setDraft, onSend, onPickQuestions, onClose, model }) {
  const end = useRef(null);
  const input = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages.length, steps.length, running]);
  useEffect(() => { input.current?.focus(); }, [draft === '']);
  const send = () => { if (draft.trim() && !running) onSend(draft.trim()); };
  return (
    <aside className="flex h-[calc(100dvh-170px)] min-h-[520px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-40px_rgba(49,46,129,0.5)] lg:sticky lg:top-4 dark:border-slate-800 dark:bg-[#121622]" aria-label="Report agent">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white"><Bot className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Report agent</p>
          <p className="truncate text-[11px] text-slate-500">{model ? `${model} · ` : ''}changes are checked before they appear</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Close the agent"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !running && (
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 p-4 text-sm text-slate-700 dark:from-indigo-500/10 dark:to-violet-500/10 dark:text-slate-200">
            Ask for a change in plain words, or a question about the figures. The agent reads your data, rewrites what is needed and checks it before it reaches the dashboard.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
              m.role === 'user' ? 'rounded-br-md bg-indigo-600 text-white' : m.error ? 'rounded-bl-md bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200' : 'rounded-bl-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>
              {m.content}
              {m.questions?.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 border-t border-white/25 pt-1.5 text-xs opacity-90">
                  {m.questions.map((q) => <li key={q.id || q.question}>+ {q.question}</li>)}
                </ul>
              )}
            </div>
          </div>
        ))}
        {(running || steps.length > 0) && (
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
            <AgentTimeline steps={steps} running={running} compact />
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        {!running && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {FOLLOW_UPS.map((s) => (
              <button key={s} type="button" onClick={() => setDraft(s)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-indigo-300">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 p-1.5 focus-within:border-indigo-500 dark:border-slate-700">
          <button type="button" onClick={onPickQuestions} disabled={running} title="Add questions you asked in chat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-40 dark:hover:bg-slate-800">
            <History className="h-4 w-4" />
          </button>
          <textarea ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask for a change…" aria-label="Message the report agent"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-800 outline-none dark:text-slate-100" />
          <button type="button" onClick={send} disabled={running || !draft.trim()} aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-40">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
