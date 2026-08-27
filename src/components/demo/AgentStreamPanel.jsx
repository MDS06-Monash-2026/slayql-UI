import React, { useState } from 'react';
import { AlertCircle, Check, ChevronDown, Radio, Activity, Terminal } from 'lucide-react';

const SAFE_PAYLOAD_KEYS = new Set([
  'attempt', 'phase', 'kind', 'label', 'status', 'summary', 'error', 'delta',
  'finish_reason', 'requested_model_id', 'execution_model_id', 'resolved_model_id',
  'resolved_provider', 'provider', 'response_id', 'duration_ms', 'latency_ms',
  'row_count', 'batch_index', 'offset', 'is_final', 'is_valid', 'name', 'message',
  'model', 'mode', 'idiom', 'reason', 'token_usage', 'usage', 'detail', 'chart',
  'intent', 'requires_sql', 'confidence', 'is_follow_up', 'resolved_question',
  'orchestrator_route', 'tool_name', 'catalog_operation', 'tool', 'agent', 'operation', 'route',
  'reportable', 'resolution_code',
  'is_semantically_valid', 'missing_requirements',
  'thinking_effort', 'provider_reasoning_effort', 'max_repair_attempts',
]);

const EVENT_TYPE_LABELS = {
  'stage.started': 'Stage Initialized',
  'stage.completed': 'Stage Completed',
  'stage.failed': 'Stage Error',
  'provider.request_started': 'Model Request Dispatched',
  'provider.reasoning_delta': 'Reasoning Streamed',
  'provider.completed': 'Model Inference Completed',
  'provider.usage_finalized': 'Token Usage Finalized',
  'sql.candidate_ready': 'SQL Generated',
  'sql.validation_check': 'Safety Check Executed',
  'sql.validation_completed': 'SQL Validation Passed',
  'execution.started': 'Read-Only Query Started',
  'execution.columns': 'Result Schema Discovered',
  'execution.rows': 'Data Rows Streamed',
  'execution.completed': 'Query Execution Completed',
  'visualization.recommended': 'Visualization Selected',
  'visualization.not_recommended': 'Table View Recommended',
  'run.completed': 'Agent Run Completed',
  'run.failed': 'Agent Run Failed',
  'orchestrator.decision': 'Orchestrator Route Selected',
  'orchestrator.provider.completed': 'Orchestrator Decision Completed',
  'orchestrator.usage': 'Orchestrator Token Usage',
  'orchestrator.reasoning_delta': 'Orchestrator Reasoning Streamed',
  'orchestrator.response_delta': 'Orchestrator Response Streamed',
  'orchestrator.tool_call.started': 'Agent Tool Call Started',
  'orchestrator.tool_call.completed': 'Agent Tool Call Completed',
};

export function normalizeStreamEvent(event, fallbackType) {
  const source = event && typeof event === 'object' ? event : {};
  const sourcePayload = source.payload && typeof source.payload === 'object' ? source.payload : {};
  const payload = {};
  Object.entries(sourcePayload).forEach(([key, value]) => {
    if (SAFE_PAYLOAD_KEYS.has(key)) payload[key] = value;
  });
  if (typeof payload.delta === 'string') payload.delta = payload.delta.slice(0, 800);
  if (sourcePayload.rows && Array.isArray(sourcePayload.rows)) {
    payload.row_count = sourcePayload.rows.length;
    payload.offset = sourcePayload.offset || 0;
    payload.is_final = Boolean(sourcePayload.is_final);
  }
  if (sourcePayload.sql && !payload.summary) {
    payload.summary = `SQL candidate generated (${String(sourcePayload.sql).length} chars)`;
  }
  if (sourcePayload.chart && typeof sourcePayload.chart === 'object') {
    payload.chart = Object.fromEntries(
      ['type', 'idiom', 'title', 'recommendation_reason', 'model', 'mode']
        .filter((key) => sourcePayload.chart[key] !== undefined)
        .map((key) => [key, sourcePayload.chart[key]])
    );
  }
  return {
    event_id: source.event_id || `${source.run_id || 'run'}:${source.sequence || Date.now()}`,
    sequence: source.sequence,
    occurred_at: source.occurred_at,
    stage: source.stage || 'stream',
    type: source.type || fallbackType || 'message',
    payload,
  };
}

function eventSummary(event) {
  const payload = event.payload || {};
  if (payload.summary) return payload.summary;
  if (payload.error) return payload.error;
  if (payload.delta) return payload.delta;
  if (payload.detail?.summary || payload.detail?.text) return payload.detail.summary || payload.detail.text;
  if (payload.usage || payload.token_usage) {
    const usage = payload.usage || payload.token_usage;
    return `${usage.total_tokens || 0} tokens${usage.cost !== undefined ? ` ($${Number(usage.cost).toFixed(5)})` : ''}`;
  }
  if (payload.chart) return `${payload.chart.idiom || payload.chart.type || 'Chart'}: ${payload.chart.title || 'Ready'}`;
  if (payload.row_count !== undefined) return `${payload.row_count} rows received${payload.offset ? ` (offset ${payload.offset})` : ''}`;
  if (payload.resolved_model_id) return `Model: ${payload.resolved_model_id}`;
  if (payload.finish_reason) return `Finish reason: ${payload.finish_reason}`;
  return '';
}

export default function AgentStreamPanel({ events = [], isRunning = false }) {
  const [isOpen, setIsOpen] = useState(false);

  const normalizedEvents = Array.isArray(events) ? events : [];
  if (normalizedEvents.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#161c27] shadow-xs transition-all">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <Activity className={`h-3.5 w-3.5 ${isRunning ? 'text-indigo-500 animate-pulse' : 'text-slate-400'}`} />
        <span className="font-semibold text-slate-700 dark:text-slate-200">Execution Telemetry</span>
        <span className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
          {normalizedEvents.length} events
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">{isOpen ? 'Hide' : 'Expand'}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="max-h-80 overflow-auto border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0f141c] p-3">
          <div className="space-y-2">
            {normalizedEvents.map((event, index) => {
              const summary = eventSummary(event);
              const failed = event.type.includes('failed');
              const humanLabel = EVENT_TYPE_LABELS[event.type] || event.type;

              return (
                <div key={`${event.event_id}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 text-[11px]">
                  <span className="pt-0.5 text-right font-mono text-slate-400 dark:text-slate-600 text-[10px] select-none">
                    {event.sequence ?? index + 1}
                  </span>
                  <div className="min-w-0 border-l border-slate-200 dark:border-slate-800 pl-2.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {failed ? (
                        <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 inline-block" />
                      )}
                      <span className={`font-semibold ${failed ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        {humanLabel}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                        {event.stage}
                      </span>
                      {event.payload?.attempt && (
                        <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.2 rounded">
                          attempt {event.payload.attempt}
                        </span>
                      )}
                    </div>
                    {summary && (
                      <p className="mt-0.5 break-words leading-relaxed text-slate-600 dark:text-slate-400 font-mono text-[10.5px]">
                        {summary}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
