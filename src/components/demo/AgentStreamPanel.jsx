import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Loader2, Radio } from 'lucide-react';

const SAFE_PAYLOAD_KEYS = new Set([
  'attempt', 'phase', 'kind', 'label', 'status', 'summary', 'error', 'delta',
  'finish_reason', 'requested_model_id', 'execution_model_id', 'resolved_model_id',
  'resolved_provider', 'provider', 'response_id', 'duration_ms', 'latency_ms',
  'row_count', 'batch_index', 'offset', 'is_final', 'is_valid', 'name', 'message',
  'model', 'mode', 'idiom', 'reason', 'token_usage', 'usage', 'detail', 'chart',
  'intent', 'requires_sql', 'confidence', 'is_follow_up', 'resolved_question',
  'reportable', 'resolution_code',
  'is_semantically_valid', 'missing_requirements',
  'thinking_effort', 'provider_reasoning_effort', 'max_repair_attempts',
]);

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
    payload.summary = `SQL candidate streamed (${String(sourcePayload.sql).length} characters)`;
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
    return `${usage.total_tokens || 0} total tokens${usage.cost !== undefined ? `, $${Number(usage.cost).toFixed(6)}` : ''}`;
  }
  if (payload.chart) return `${payload.chart.idiom || payload.chart.type || 'chart'}: ${payload.chart.title || 'visualization ready'}`;
  if (payload.row_count !== undefined) return `${payload.row_count} rows streamed${payload.offset ? ` from offset ${payload.offset}` : ''}`;
  if (payload.resolved_model_id) return `Resolved to ${payload.resolved_model_id}`;
  if (payload.finish_reason) return `Finish reason: ${payload.finish_reason}`;
  return '';
}

export default function AgentStreamPanel({ events = [], isRunning = false }) {
  const [isOpen, setIsOpen] = useState(isRunning);
  useEffect(() => {
    if (isRunning) setIsOpen(true);
  }, [isRunning]);

  const normalizedEvents = useMemo(
    () => events.map((event) => normalizeStreamEvent(event, event?.type)),
    [events]
  );
  if (normalizedEvents.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
      >
        <Radio className={`h-3.5 w-3.5 ${isRunning ? 'text-emerald-600' : 'text-slate-500'}`} />
        <span className="font-semibold">SSE stream</span>
        <span className="font-mono text-[10px] text-slate-400">{normalizedEvents.length} events</span>
        {isRunning ? <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-indigo-600" /> : <Check className="ml-auto h-3.5 w-3.5 text-emerald-600" />}
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="max-h-80 overflow-auto border-t border-slate-100 bg-slate-50/60 px-3 py-2">
          <div className="space-y-2">
            {normalizedEvents.map((event, index) => {
              const summary = eventSummary(event);
              const failed = event.type.includes('failed');
              return (
                <div key={`${event.event_id}-${index}`} className="grid grid-cols-[34px_minmax(0,1fr)] gap-2 text-[11px]">
                  <span className="pt-0.5 text-right font-mono text-slate-400">{event.sequence ?? index + 1}</span>
                  <div className="min-w-0 border-l border-slate-200 pl-2.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {failed && <AlertCircle className="h-3 w-3 text-red-500" />}
                      <span className={`font-mono font-semibold ${failed ? 'text-red-700' : 'text-slate-700'}`}>{event.type}</span>
                      <span className="text-[10px] text-slate-400">{event.stage}</span>
                      {event.payload?.attempt && <span className="text-[10px] text-indigo-600">attempt {event.payload.attempt}</span>}
                    </div>
                    {summary && <p className="mt-0.5 break-words leading-relaxed text-slate-500 whitespace-pre-wrap">{summary}</p>}
                    {Object.keys(event.payload || {}).length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer select-none text-[10px] text-slate-400 hover:text-slate-600">Payload</summary>
                        <pre className="mt-1 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-2 font-mono text-[10px] leading-relaxed text-slate-200">{JSON.stringify(event.payload, null, 2)}</pre>
                      </details>
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
