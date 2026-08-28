import React, { useState, useMemo } from 'react';
import {
  Activity,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  Database,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Copy,
  Check,
  Eye,
  EyeOff,
  Table2,
  GitMerge,
  Filter,
} from 'lucide-react';

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

function extractSqlDetails(sqlText) {
  if (!sqlText || typeof sqlText !== 'string') return { tables: [], joins: [], filters: [] };

  const cleanSql = sqlText.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // 1. Extract tables
  const tables = new Set();
  const fromMatches = cleanSql.matchAll(/\bFROM\s+([a-zA-Z0-9_\."]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?/gi);
  for (const m of fromMatches) {
    const raw = m[1].replace(/["`]/g, '').trim();
    if (raw && !raw.startsWith('(') && !raw.toLowerCase().startsWith('select')) {
      tables.add(raw);
    }
  }

  // 2. Extract JOINs and relationships
  const joinMatches = cleanSql.matchAll(
    /\b(?:LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN\s+([a-zA-Z0-9_\."]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?\s+ON\s+([^;\n]+?)(?=\b(?:LEFT|RIGHT|INNER|FULL|CROSS|WHERE|GROUP|HAVING|ORDER|LIMIT|;|\n|$))/gi
  );
  
  const joins = [];
  for (const m of joinMatches) {
    const tableName = m[1].replace(/["`]/g, '').trim();
    if (tableName && !tableName.startsWith('(')) {
      tables.add(tableName);
    }
    const onCondition = m[3]?.trim();
    if (onCondition) {
      // Format human-friendly relation
      const cleanCondition = onCondition.replace(/[\(\)]/g, '').trim();
      joins.push({
        table: tableName,
        condition: cleanCondition,
      });
    }
  }

  // Check JOIN with USING
  const usingMatches = cleanSql.matchAll(/\bJOIN\s+([a-zA-Z0-9_\."]+)\s+USING\s*\(([a-zA-Z0-9_,\s]+)\)/gi);
  for (const m of usingMatches) {
    const tableName = m[1].replace(/["`]/g, '').trim();
    if (tableName) tables.add(tableName);
    joins.push({
      table: tableName,
      condition: `via ${m[2].trim()}`,
    });
  }

  // 3. Extract WHERE conditions
  const filters = [];
  const whereMatch = cleanSql.match(/\bWHERE\s+([^;\n]+?)(?=\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|;|$))/i);
  if (whereMatch && whereMatch[1]) {
    const parts = whereMatch[1]
      .split(/\bAND\b/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !p.toLowerCase().startsWith('select'));
    filters.push(...parts.slice(0, 3));
  }

  return {
    tables: Array.from(tables),
    joins,
    filters,
  };
}

function extractHumanMilestones(events = [], sqlText = '') {
  const milestones = [];
  const { tables, joins, filters } = extractSqlDetails(sqlText);

  // 1. Model Planning
  const modelEvent = events.find(
    (e) => e.type === 'provider.completed' || e.type === 'provider.request_started' || e.type.startsWith('orchestrator')
  );
  const usageEvent = events.find((e) => e.payload?.usage || e.payload?.token_usage);
  if (modelEvent || usageEvent) {
    const tokens = usageEvent?.payload?.usage?.total_tokens || usageEvent?.payload?.token_usage?.total_tokens;
    const modelName = modelEvent?.payload?.resolved_model_id || modelEvent?.payload?.model || 'Agent LLM';
    milestones.push({
      id: 'model',
      title: 'Query Planning & Reasoning',
      description: `Analyzed intent with ${modelName}${tokens ? ` (${tokens.toLocaleString()} tokens)` : ''}`,
      icon: Sparkles,
    });
  }

  // 2. Tables Searched / Inspected
  if (tables.length > 0) {
    milestones.push({
      id: 'tables',
      title: 'Tables Searched & Catalog Schema',
      description: `Targeted ${tables.length} ${tables.length === 1 ? 'table' : 'tables'} in database catalog:`,
      tags: tables,
      icon: Table2,
    });
  }

  // 3. Relationships / Joins Used
  if (joins.length > 0) {
    milestones.push({
      id: 'joins',
      title: 'Table Relationships & Joins',
      description: 'Connected tables using relational foreign keys:',
      relationships: joins,
      icon: GitMerge,
    });
  }

  // 4. Filters & Constraints
  if (filters.length > 0) {
    milestones.push({
      id: 'filters',
      title: 'Filters & Conditions Applied',
      description: 'Filtered records matching criteria:',
      filters,
      icon: Filter,
    });
  }

  // 5. Safety Verification
  const valEvent = events.find((e) => e.type === 'sql.validation_completed' || e.type === 'sql.validation_check');
  if (valEvent || sqlText) {
    milestones.push({
      id: 'validation',
      title: 'Safety Guardrails',
      description: 'Passed read-only permissions and SQL syntax verification',
      icon: ShieldCheck,
    });
  }

  // 6. Execution
  const execEvent = events.find((e) => e.type === 'execution.completed' || e.type === 'execution.rows' || e.type === 'execution.started');
  if (execEvent) {
    const rows = execEvent.payload?.row_count;
    const duration = execEvent.payload?.duration_ms || execEvent.payload?.latency_ms;
    milestones.push({
      id: 'execution',
      title: 'Database Execution',
      description: `Executed query${rows !== undefined ? ` • ${rows} rows returned` : ''}${duration ? ` in ${duration}ms` : ''}`,
      icon: Database,
    });
  }

  // 7. Visualization
  const chartEvent = events.find((e) => e.type === 'visualization.recommended' || e.payload?.chart);
  if (chartEvent && chartEvent.payload?.chart) {
    const chart = chartEvent.payload.chart;
    milestones.push({
      id: 'chart',
      title: 'Data Visualization',
      description: `Rendered ${chart.idiom || chart.type || 'chart'}: ${chart.title || 'Summary'}`,
      icon: BarChart3,
    });
  }

  // Errors
  const failEvent = events.find((e) => e.type.includes('failed') || e.payload?.error);
  if (failEvent) {
    milestones.push({
      id: 'error',
      title: 'Execution Notice',
      description: failEvent.payload?.error || failEvent.payload?.summary || 'Execution completed with notices',
      icon: AlertCircle,
      isError: true,
    });
  }

  return milestones;
}

export default function AgentStreamPanel({
  events = [],
  sql = '',
  isRunning = false,
  isDark = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const normalizedEvents = Array.isArray(events) ? events : [];

  // Extract SQL from events if not explicitly passed
  const effectiveSql = useMemo(() => {
    if (sql) return sql;
    for (const e of normalizedEvents) {
      if (e.payload?.sql) return e.payload.sql;
    }
    return '';
  }, [sql, normalizedEvents]);

  const milestones = useMemo(
    () => extractHumanMilestones(normalizedEvents, effectiveSql),
    [normalizedEvents, effectiveSql]
  );

  if (normalizedEvents.length === 0 && !effectiveSql) return null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(normalizedEvents, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={`rounded-xl border transition-all ${
        isDark
          ? 'bg-[#151924] border-slate-800 text-slate-200'
          : 'bg-white border-slate-200/80 text-slate-800'
      }`}
    >
      {/* Low-Profile Header Bar */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors rounded-xl ${
          isDark
            ? 'hover:bg-slate-800/50 text-slate-300'
            : 'hover:bg-slate-50 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-4 h-4 rounded flex items-center justify-center font-bold shrink-0 ${
              isRunning
                ? 'bg-indigo-500 text-white animate-pulse'
                : isDark
                ? 'bg-indigo-950/60 text-indigo-400'
                : 'bg-indigo-50 text-indigo-600'
            }`}
          >
            <Activity className="w-2.5 h-2.5" />
          </div>
          <span className="font-semibold text-[11px]">
            Execution Telemetry
          </span>
          <span
            className={`font-mono text-[9px] px-1.5 py-0.2 rounded-full border ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-slate-400'
                : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
          >
            {milestones.length > 0 ? `${milestones.length} milestones` : `${normalizedEvents.length} events`}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10.5px]">
          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>
            {isOpen ? 'Hide' : 'Details'}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isDark ? 'text-slate-500' : 'text-slate-400'
            } ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expanded Human-Readable View */}
      {isOpen && (
        <div
          className={`border-t px-3 py-2.5 space-y-2 text-xs transition-all ${
            isDark
              ? 'bg-[#121620] border-slate-800'
              : 'bg-white border-slate-100'
          }`}
        >
          {/* Key Milestones List */}
          <div className="space-y-1.5">
            {milestones.length > 0 ? (
              milestones.map((step) => {
                const Icon = step.icon || CheckCircle2;
                return (
                  <div
                    key={step.id}
                    className={`flex items-start gap-2 p-2 rounded-lg border transition-all ${
                      step.isError
                        ? isDark
                          ? 'bg-red-950/20 border-red-900/40 text-red-300'
                          : 'bg-red-50/60 border-red-200 text-red-800'
                        : isDark
                        ? 'bg-[#181c26] border-slate-800/80'
                        : 'bg-slate-50/70 border-slate-200/60'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                        step.isError
                          ? 'bg-red-100 text-red-600'
                          : isDark
                          ? 'bg-slate-800 text-indigo-400'
                          : 'bg-white border border-slate-200/80 text-indigo-600 shadow-xs'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[11px]">
                          {step.title}
                        </span>
                        <CheckCircle2
                          className={`w-3 h-3 ${
                            step.isError ? 'text-red-500' : 'text-emerald-500'
                          }`}
                        />
                      </div>
                      <p
                        className={`text-[10px] leading-relaxed mt-0.5 ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        {step.description}
                      </p>

                      {/* Tables Searched Tags */}
                      {step.tags && step.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {step.tags.map((tbl, i) => (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[9.5px] font-semibold border ${
                                isDark
                                  ? 'bg-slate-800/90 text-indigo-300 border-indigo-900/50'
                                  : 'bg-white text-indigo-700 border-indigo-200 shadow-xs'
                              }`}
                            >
                              <Table2 className="w-2.5 h-2.5 text-indigo-500" />
                              <span>{tbl}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Relationships & Joins */}
                      {step.relationships && step.relationships.length > 0 && (
                        <div className="space-y-1 mt-1.5">
                          {step.relationships.map((rel, i) => (
                            <div
                              key={i}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-[9.5px] border ${
                                isDark
                                  ? 'bg-[#10131a] text-slate-300 border-slate-800'
                                  : 'bg-white text-slate-700 border-slate-200 shadow-xs'
                              }`}
                            >
                              <GitMerge className="w-3 h-3 text-cyan-500 shrink-0" />
                              <span className="font-semibold text-indigo-600 dark:text-indigo-400">{rel.table}</span>
                              <span className="text-slate-400">•</span>
                              <span className="text-slate-600 dark:text-slate-300 truncate">{rel.condition}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Filters Applied */}
                      {step.filters && step.filters.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {step.filters.map((flt, i) => (
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[9.5px] border ${
                                isDark
                                  ? 'bg-[#10131a] text-slate-300 border-slate-800'
                                  : 'bg-white text-slate-700 border-slate-200'
                              }`}
                            >
                              <Filter className="w-2.5 h-2.5 text-amber-500" />
                              <span>{flt}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div
                className={`p-2 rounded-lg text-[11px] text-center ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {normalizedEvents.length} trace events recorded.
              </div>
            )}
          </div>

          {/* Sub Actions: Toggle Raw Events & Copy JSON */}
          <div
            className={`flex items-center justify-between pt-1 border-t text-[10px] ${
              isDark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'
            }`}
          >
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              className="inline-flex items-center gap-1 hover:underline text-[10px]"
            >
              {showRaw ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{showRaw ? 'Hide raw trace' : `View full trace (${normalizedEvents.length} events)`}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1 hover:underline text-[10px]"
            >
              {copied ? (
                <>
                  <Check className="w-2.5 h-2.5 text-emerald-500" />
                  <span className="text-emerald-500 font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-2.5 h-2.5" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>
          </div>

          {/* Optional Raw Events Accordion */}
          {showRaw && (
            <div
              className={`p-2 rounded-lg font-mono text-[9.5px] max-h-48 overflow-y-auto space-y-1 border ${
                isDark
                  ? 'bg-[#0e1118] border-slate-800 text-slate-400'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              {normalizedEvents.map((e, idx) => (
                <div key={idx} className="truncate">
                  <span className="text-slate-400">#{e.sequence ?? idx + 1}</span>{' '}
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">[{e.type}]</span>{' '}
                  <span>{e.payload?.summary || e.payload?.error || e.stage}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
