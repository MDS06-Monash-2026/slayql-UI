import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
  Loader2,
} from 'lucide-react';

const STAGE_LABELS = {
  intent_validation: 'Checking request intent and conversation context',
  schema_discovery: 'Reading schema and finding candidate tables',
  graph_expansion: 'Following relationships across the data graph',
  value_grounding: 'Grounding values to real columns',
  model_generation: 'Drafting SQL with model guardrails',
  sql_validation: 'Checking SQL safety and dialect',
  semantic_validation: 'Checking whether SQL answers the request',
  execution: 'Running a read-only query',
  visualization: 'Choosing the clearest visualization',
  answer_generation: 'Summarizing the validated result',
};

export default function SlayQLTraceTimeline({ stages = {}, activeStageKey, isRunning, tokenUsage, reasoning = '' }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isRunning) setIsOpen(true);
  }, [isRunning]);

  const stageKeys = [
    'intent_validation',
    'schema_discovery',
    'graph_expansion',
    'value_grounding',
    'model_generation',
    'sql_validation',
    'semantic_validation',
    'execution',
    'visualization',
    'answer_generation',
  ];

  const completedStages = stageKeys.filter(
    (k) => stages[k]?.status === 'completed' || stages[k]?.status === 'passed'
  );

  const currentStageLabel = activeStageKey ? STAGE_LABELS[activeStageKey] || activeStageKey : 'Processing query...';
  const progress = Math.round((completedStages.length / stageKeys.length) * 100);

  if (!isRunning && completedStages.length === 0) return null;

  return (
    <div className="text-xs font-sans mb-3">
      {/* Minimalist Collapsible Header (Claude / AI Studio Style) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200/80 shadow-sm transition-all text-left group"
      >
        {isRunning ? (
          <div className="flex items-center gap-1.5 text-indigo-600 font-medium">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{currentStageLabel}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-600">
            <Sparkles className="w-3 h-3 text-indigo-500" />
            <span className="font-medium">
              Analysis complete • {completedStages.length} reasoning {completedStages.length === 1 ? 'step' : 'steps'}
            </span>
          </div>
        )}

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform ${
          isOpen ? 'rotate-180' : ''
          }`}
        />
        {isRunning && (
          <span className="ml-auto text-[10px] font-mono text-slate-400">{progress}%</span>
        )}
      </button>

      {/* Expandable Minimalist Trace Detail */}
      {isOpen && (
        <div className="mt-2.5 p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-2.5 animate-fade-in-up">
          {isRunning && (
            <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${Math.max(progress, 8)}%` }} />
            </div>
          )}
          <div className="space-y-2">
            {stageKeys.map((key) => {
              const label = STAGE_LABELS[key] || key;
              const stageData = stages[key];
              const isPassed = stageData?.status === 'completed' || stageData?.status === 'passed';
              const isCurrent = activeStageKey === key && isRunning;

              if (!stageData && !isRunning) return null;

              return (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <div className="mt-0.5 flex-shrink-0">
                    {isPassed ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : isCurrent ? (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300 inline-block ml-0.5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${isCurrent ? 'text-indigo-600 font-bold' : isPassed ? 'text-slate-800' : 'text-slate-400'}`}>
                        {label}
                      </span>
                      {stageData?.duration_ms && (
                        <span className="text-[10px] text-slate-400 font-mono">{stageData.duration_ms}ms</span>
                      )}
                    </div>

                    {/* Evidence Snippet */}
                    {stageData?.evidence && stageData.evidence.length > 0 && (
                      <div className="mt-1 space-y-1 text-[11px] text-slate-500">
                        {stageData.evidence.map((ev, i) => (
                          <div key={i}>
                            {ev.summary && <p>{ev.summary}</p>}
                            {ev.join_path && (
                              <p className="font-mono text-purple-700 mt-0.5">
                                Path: {ev.join_path.join(' → ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {reasoning && (
            <div className="max-h-32 overflow-auto rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500 whitespace-pre-wrap">
              {reasoning}
            </div>
          )}

          {/* Tokens and Cost */}
          {tokenUsage && (
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Tokens: {tokenUsage.total_tokens || tokenUsage.prompt_tokens + tokenUsage.completion_tokens || tokenUsage.input_tokens + tokenUsage.output_tokens || 0}</span>
              {(tokenUsage.cost !== undefined || tokenUsage.estimated_cost_usd !== undefined) && (
                <span className="text-emerald-700 font-medium">
                  Cost: ${Number(tokenUsage.cost ?? tokenUsage.estimated_cost_usd ?? 0).toFixed(5)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
