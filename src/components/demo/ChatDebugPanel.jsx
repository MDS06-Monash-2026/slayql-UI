import React, { useEffect, useState } from 'react';
import { Bug, ChevronDown, Clock3, Radio, Route, Wrench } from 'lucide-react';

const EVENT_LABELS = {
  'run.accepted': 'Run accepted',
  'stream.ready': 'SSE stream ready',
  'intent.validator_started': 'Intent validation started',
  'intent.validator_completed': 'Intent validation completed',
  'orchestrator.decision': 'Orchestrator route selected',
  'orchestrator.provider.completed': 'Orchestrator completed',
  'orchestrator.usage': 'Orchestrator token usage',
  'orchestrator.reasoning_delta': 'Orchestrator reasoning streamed',
  'orchestrator.response_delta': 'Orchestrator response streamed',
  'orchestrator.tool_call.started': 'Tool call started',
  'orchestrator.tool_call.completed': 'Tool call completed',
  'stage.started': 'Stage started',
  'stage.completed': 'Stage completed',
  'provider.request_started': 'Provider request started',
  'provider.first_delta': 'First provider token',
  'provider.completed': 'Provider completed',
  'execution.started': 'Query execution started',
  'execution.completed': 'Query execution completed',
  'run.completed': 'Run completed',
  'run.failed': 'Run failed',
};

function eventSummary(event) {
  const payload = event.payload || {};
  if (payload.summary) return payload.summary;
  if (payload.error) return payload.error;
  if (payload.tool) return `${payload.tool}${payload.agent ? ` via ${payload.agent}` : ''}`;
  if (payload.duration_ms !== undefined) return `${payload.duration_ms} ms`;
  if (payload.latency_ms !== undefined) return `${payload.latency_ms} ms latency`;
  return '';
}

function durationLabel(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  const ms = Math.max(0, Number(value));
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export default function ChatDebugPanel({
  events = [],
  isRunning = false,
  startedAt = null,
  durationMs = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const normalizedEvents = Array.isArray(events) ? events : [];

  useEffect(() => {
    if (!isRunning || !startedAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [isRunning, startedAt]);

  if (normalizedEvents.length === 0 && !isRunning) return null;

  const decision = [...normalizedEvents].reverse().find((event) => event.type === 'orchestrator.decision');
  const toolCall = [...normalizedEvents].reverse().find((event) => event.type === 'orchestrator.tool_call.started');
  const latest = normalizedEvents[normalizedEvents.length - 1];
  const providerCompleted = [...normalizedEvents].reverse().find((event) => event.type === 'provider.completed');
  const elapsed = isRunning && startedAt
    ? now - startedAt
    : durationMs ?? (startedAt ? now - startedAt : null);
  const route = decision?.payload?.route || (toolCall?.payload?.tool === 'sql_agent' ? 'sql_agent' : null);
  const recentEvents = normalizedEvents.slice(-10).reverse();

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-[#161c27]">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50"
        aria-expanded={isOpen}
      >
        <Bug className={`h-3.5 w-3.5 ${isRunning ? 'animate-pulse text-amber-500' : 'text-slate-400'}`} />
        <span className="font-semibold text-slate-700 dark:text-slate-200">Debug</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          {normalizedEvents.length} events
        </span>
        {route && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            {route}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] text-slate-400">{durationLabel(elapsed)}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-[#0f141c]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-[#161c27]">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Route className="h-3 w-3" />Route</div>
              <div className="mt-1 truncate font-mono text-[11px] text-slate-700 dark:text-slate-200">{route || 'classifying'}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-[#161c27]">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Wrench className="h-3 w-3" />Tool</div>
              <div className="mt-1 truncate font-mono text-[11px] text-slate-700 dark:text-slate-200">{toolCall?.payload?.tool || 'pending'}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-[#161c27]">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Clock3 className="h-3 w-3" />Elapsed</div>
              <div className="mt-1 font-mono text-[11px] text-slate-700 dark:text-slate-200">{durationLabel(elapsed)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-[#161c27]">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Radio className="h-3 w-3" />Provider</div>
              <div className="mt-1 font-mono text-[11px] text-slate-700 dark:text-slate-200">{durationLabel(providerCompleted?.payload?.duration_ms)}</div>
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Recent SSE events</span>
              <span className="font-mono normal-case">{latest?.type || 'waiting'}</span>
            </div>
            {recentEvents.map((event, index) => (
              <div key={`${event.event_id}-${index}`} className="flex min-w-0 items-start gap-2 rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-[10px] dark:border-slate-800 dark:bg-[#161c27]">
                <span className="w-6 shrink-0 text-right font-mono text-slate-400">{event.sequence ?? '-'}</span>
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${event.type.includes('failed') ? 'bg-red-500' : 'bg-indigo-400'}`} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{EVENT_LABELS[event.type] || event.type}</span>
                  {eventSummary(event) && <span className="ml-1.5 break-words text-slate-500 dark:text-slate-400">{eventSummary(event)}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
