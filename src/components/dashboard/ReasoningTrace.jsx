import React, { useState } from 'react';
import { Network, Target, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';

// ─── Step status icon ─────────────────────────────────────────────────────────

function StepIcon({ status }) {
  if (status === 'done') {
    return (
      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
        <CheckCircle2 className="w-3 h-3 text-white" />
      </div>
    );
  }
  if (status === 'active') {
    return (
      <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin flex-shrink-0" />
    );
  }
  return (
    <div className="w-5 h-5 rounded-full border-2 border-slate-200 bg-white flex-shrink-0" />
  );
}

// ─── Detail panels revealed once a step completes ────────────────────────────

function SchemaDetail({ dataset }) {
  if (!dataset?.schemaTree) return null;
  return (
    <div className="mt-2 ml-7 p-2.5 rounded-lg bg-white border border-slate-200 font-mono text-xs text-slate-600 space-y-0.5">
      {dataset.schemaTree.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

function GraphDetail({ dataset }) {
  if (!dataset?.graphChain) return null;
  return (
    <div className="mt-2 ml-7 flex items-center gap-2 flex-wrap">
      {dataset.graphChain.map((node, ni) => (
        <React.Fragment key={ni}>
          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-xs font-mono">
            {ni === 0 && <Network className="w-3 h-3" />}
            {node}
          </span>
          {ni < dataset.graphChain.length - 1 && (
            <span className="text-slate-300 text-xs">→</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function ValueDetail({ dataset }) {
  if (!dataset?.valueGrounding) return null;
  const { phrase, table, column } = dataset.valueGrounding;
  return (
    <div className="mt-2 ml-7 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
      <Target className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
      <span>
        Entity&nbsp;<strong>"{phrase}"</strong> grounded to column&nbsp;
        <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">{column}</code>&nbsp;
        in table&nbsp;
        <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">{table}</code>.
      </span>
    </div>
  );
}

// ─── Collapsible explanation panel ───────────────────────────────────────────

function QueryExplanation({ dataset }) {
  const [open, setOpen] = useState(false);
  if (!dataset) return null;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-all text-left"
      >
        <span className="text-xs font-semibold text-slate-700">Query Explanation</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
      </button>
      {open && (
        <div className="px-4 py-3 bg-white space-y-3 slide-in-up">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Intent detected</p>
            <p className="text-xs text-slate-700">
              Retrieve and aggregate data matching the user's natural-language specification.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tables used</p>
            <div className="flex flex-wrap gap-1">
              {dataset.graphChain?.map((t, i) => (
                <code key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-mono">{t}</code>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Operations</p>
            <ul className="text-xs text-slate-600 space-y-0.5 list-disc list-inside">
              <li>Dense schema retrieval (BGE-Large)</li>
              <li>Foreign-key graph propagation (RBP)</li>
              <li>Value-column grounding (BM25)</li>
              <li>SQL generation under strict output contract (QOC)</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ReasoningTrace ───────────────────────────────────────────────────────────

export default function ReasoningTrace({ steps, currentStepIndex, dataset, isDone }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="bg-transparent">
      {/* Header */}
      {!isDone && (
        <div className="flex items-center gap-2 px-1 py-2 mb-2">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
            SlayQL Thinking…
          </span>
        </div>
      )}

      {/* Steps */}
      <div className="py-2 space-y-3">
        {steps.map((step, idx) => {
          const status =
            idx < currentStepIndex ? 'done' :
            idx === currentStepIndex ? 'active' : 'pending';

          return (
            <div key={step.id}>
              <div className="flex items-start gap-2.5">
                <StepIcon status={status} />
                <span className={[
                  'text-sm leading-5 pt-0.5',
                  status === 'active'  ? 'text-indigo-700 font-semibold' :
                  status === 'done'    ? 'text-slate-700' :
                                        'text-slate-400',
                ].join(' ')}>
                  {step.text}
                </span>
              </div>

              {/* Detail panels — only once completed */}
              {status === 'done' && step.detail === 'schema' && <SchemaDetail dataset={dataset} />}
              {status === 'done' && step.detail === 'graph'  && <GraphDetail  dataset={dataset} />}
              {status === 'done' && step.detail === 'value'  && <ValueDetail  dataset={dataset} />}
            </div>
          );
        })}
      </div>

      {/* Collapsible explanation — only when done */}
      {isDone && (
        <div className="pb-4">
          <QueryExplanation dataset={dataset} />
        </div>
      )}
    </div>
  );
}
