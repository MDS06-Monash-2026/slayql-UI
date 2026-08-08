import React, { useRef, useEffect } from 'react';
import { Zap, Send, X, Loader2, CornerDownLeft } from 'lucide-react';
import { MOCK_DATA } from '../../mock/mockData';

// ─── Example prompt chips ─────────────────────────────────────────────────────

const EXAMPLES = [
  { emoji: '📈', label: 'IoT Patents by Month', prompt: MOCK_DATA.iot_patents.prompt },
  { emoji: '🌡️', label: 'Hottest Dates by Station', prompt: MOCK_DATA.noaa_gsod.prompt },
  { emoji: '🔗', label: 'Blockchain Patent Categories', prompt: MOCK_DATA.blockchain_categories.prompt },
  {
    emoji: '💡',
    label: 'Monthly Revenue by Region',
    prompt: 'Show monthly revenue breakdown by region for Q1 2024',
  },
];

// Map queryState → visual label shown inside input area
const STATE_LABELS = {
  idle:       null,
  generating: 'Generating SQL…',
  generated:  null,
  executing:  'Executing query…',
  success:    null,
  error:      null,
};

// ─── QueryInputPanel ──────────────────────────────────────────────────────────

export default function QueryInputPanel({
  value,
  onChange,
  onSubmit,
  onClear,
  queryState,     // 'idle' | 'generating' | 'generated' | 'executing' | 'success' | 'error'
}) {
  const textareaRef = useRef(null);
  const isLoading = queryState === 'generating' || queryState === 'executing';
  const canSubmit = value.trim().length > 0 && !isLoading;
  const stateLabel = STATE_LABELS[queryState];

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
    // Shift+Enter → natural newline (default browser behaviour)
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

      {/* Heading */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Query</p>
        <h2 className="text-base font-bold text-slate-800 mt-0.5">What would you like to know?</h2>
      </div>

      {/* Example chips */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            onClick={() => {
              onChange(ex.prompt);
              setTimeout(() => onSubmit(ex.prompt), 0);
            }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>{ex.emoji}</span>
            <span>{ex.label}</span>
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 mx-4" />

      {/* Input area */}
      <div className="relative px-4 py-3">
        {isLoading ? (
          /* Loading state overlay */
          <div className="flex items-center gap-3 py-2 min-h-[52px]">
            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin flex-shrink-0" />
            <span className="text-sm text-indigo-600 font-medium">{stateLabel}</span>
          </div>
        ) : (
          /* Textarea */
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center mt-0.5">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <textarea
              ref={textareaRef}
              id="query-input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Ask a question about your data…   e.g. Show me the top 10 products by revenue."
              disabled={isLoading}
              className="flex-1 resize-none text-sm text-slate-800 placeholder-slate-400 bg-transparent border-0 outline-none leading-relaxed font-medium min-h-[44px]"
              style={{ overflow: 'hidden' }}
            />
            {/* Clear button */}
            {value && (
              <button
                onClick={onClear}
                className="flex-shrink-0 p-1 rounded-md text-slate-300 hover:text-slate-600 transition-all mt-0.5"
                aria-label="Clear input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100">
        <p className="text-[11px] text-slate-400 hidden sm:block">
          <kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 text-slate-500 font-mono text-[10px]">Enter</kbd>
          {' '}to submit &nbsp;·&nbsp;{' '}
          <kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 text-slate-500 font-mono text-[10px]">Shift+Enter</kbd>
          {' '}for new line
        </p>

        <button
          id="generate-sql-btn"
          onClick={() => onSubmit()}
          disabled={!canSubmit}
          className={[
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
            canSubmit
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed',
          ].join(' ')}
          aria-label="Generate SQL"
        >
          <Send className="w-3.5 h-3.5" />
          Generate SQL
        </button>
      </div>

      {/* Error state */}
      {queryState === 'error' && (
        <div className="px-4 py-2.5 bg-red-50 border-t border-red-200 text-xs text-red-600 font-medium flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
          An error occurred. Please try again or rephrase your question.
        </div>
      )}
    </div>
  );
}
