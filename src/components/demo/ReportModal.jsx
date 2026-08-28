import React, { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  ShieldAlert,
  Clock,
  Code,
  FileSpreadsheet,
  MessageSquare,
  X,
  Loader2,
  CheckCircle2,
  Flag,
  Sparkles,
} from 'lucide-react';

const REPORT_OPTIONS = [
  {
    id: 'incorrect_answer',
    label: 'Incorrect answer',
    description: 'Inaccurate data, wrong calculation, or flawed logic in the response',
    icon: AlertCircle,
    color: 'text-red-500 bg-red-50 dark:bg-red-950/50 dark:text-red-400 border-red-200/60 dark:border-red-900/40',
  },
  {
    id: 'inappropriate_content',
    label: 'Inappropriate content',
    description: 'Offensive, harmful, hallucinated, or unsafe conversational output',
    icon: ShieldAlert,
    color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/40',
  },
  {
    id: 'low_response_time',
    label: 'Slow response time',
    description: 'Took too long to generate, stalled during stream, or high latency',
    icon: Clock,
    color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200/60 dark:border-blue-900/40',
  },
  {
    id: 'invalid_sql',
    label: 'Invalid SQL syntax',
    description: 'Generated SQL query failed syntax validation or database execution',
    icon: Code,
    color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-400 border-indigo-200/60 dark:border-indigo-900/40',
  },
  {
    id: 'missing_context',
    label: 'Missing context',
    description: 'Used wrong tables, missed business definitions, or ignored schema constraints',
    icon: FileSpreadsheet,
    color: 'text-violet-500 bg-violet-50 dark:bg-violet-950/50 dark:text-violet-400 border-violet-200/60 dark:border-violet-900/40',
  },
  {
    id: 'other',
    label: 'Other issue',
    description: 'Formatting problem, unexpected behavior, or general feedback',
    icon: MessageSquare,
    color: 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
];

export default function ReportModal({
  isOpen,
  onClose,
  message,
  onSubmit,
  isDark = false,
}) {
  const [category, setCategory] = useState('incorrect_answer');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCategory('incorrect_answer');
      setNote('');
      setError(null);
      setIsSuccess(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (isSubmitting || isSuccess) return;

    setError(null);
    setIsSubmitting(true);
    try {
      if (onSubmit) {
        await onSubmit({
          category,
          note: note.trim(),
        });
      }
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setError(err?.message || 'Failed to submit report. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Preview snippet of the message being reported
  const snippet = message?.content
    ? (message.content.length > 140 ? `${message.content.slice(0, 140)}...` : message.content)
    : (message?.sql ? `SQL: ${message.sql.slice(0, 100)}...` : 'Assistant response');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] slide-in-up transition-all ${
          isDark
            ? 'bg-[#1a1e27] border-slate-700/80 text-slate-100 shadow-black/60'
            : 'bg-white border-slate-200 text-slate-900 shadow-slate-900/20'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? 'border-slate-800 bg-[#161a22]/80' : 'border-slate-100 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500/15 to-amber-500/15 border border-red-500/20 text-red-500 flex items-center justify-center font-bold shadow-xs">
              <Flag className="w-5 h-5" />
            </div>
            <div>
              <h2 id="report-modal-title" className="text-sm font-bold tracking-tight">
                Report Assistant Response
              </h2>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Select the issue category and tell us how to improve
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            } disabled:opacity-50`}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5">
          {/* Success Banner State */}
          {isSuccess ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-md">
                <CheckCircle2 className="w-7 h-7 animate-scale-in" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Report Submitted
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                  Thank you! Your feedback helps optimize our SQL generation and agent reasoning.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Error Alert */}
              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-center gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-red-700 dark:text-red-300 hover:underline font-semibold text-[11px]"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Message Preview Snippet */}
              <div
                className={`p-3 rounded-2xl border text-xs leading-relaxed ${
                  isDark
                    ? 'bg-[#141720] border-slate-800/80 text-slate-300'
                    : 'bg-slate-50/70 border-slate-200/70 text-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  <span>Reporting message</span>
                </div>
                <p className="line-clamp-2 italic font-mono text-[11px]">
                  "{snippet}"
                </p>
              </div>

              {/* Category Selection Options */}
              <div className="space-y-2">
                <label className={`block text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  What was wrong with this response?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {REPORT_OPTIONS.map((opt) => {
                    const isSelected = category === opt.id;
                    const IconComponent = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCategory(opt.id)}
                        disabled={isSubmitting}
                        className={`group relative flex items-start gap-3 p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? isDark
                              ? 'bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30 text-white'
                              : 'bg-indigo-50/60 border-indigo-600 ring-2 ring-indigo-600/20 text-slate-900'
                            : isDark
                            ? 'bg-[#151922] border-slate-800/80 hover:bg-[#1f2430] hover:border-slate-700 text-slate-300'
                            : 'bg-white border-slate-200/80 hover:bg-slate-50/80 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        {/* Option Icon Pill */}
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                              : opt.color
                          }`}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>

                        {/* Text Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p
                              className={`text-xs font-bold tracking-tight ${
                                isSelected
                                  ? isDark
                                    ? 'text-indigo-300'
                                    : 'text-indigo-900'
                                  : isDark
                                  ? 'text-slate-200'
                                  : 'text-slate-800'
                              }`}
                            >
                              {opt.label}
                            </p>
                            {/* Radio circle indicator */}
                            <div
                              className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all shrink-0 ml-1.5 ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : isDark
                                  ? 'border-slate-700 bg-slate-800'
                                  : 'border-slate-300 bg-slate-50'
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                          <p
                            className={`text-[11px] leading-4 mt-0.5 ${
                              isSelected
                                ? isDark
                                  ? 'text-indigo-200/80'
                                  : 'text-indigo-700/90'
                                : isDark
                                ? 'text-slate-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {opt.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Field for User Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="report-user-note"
                    className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}
                  >
                    Additional details (optional)
                  </label>
                  <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {note.length} / 1000
                  </span>
                </div>
                <textarea
                  id="report-user-note"
                  ref={textareaRef}
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                  disabled={isSubmitting}
                  placeholder="Tell us what was wrong, expected results, query context, or any suggestions..."
                  rows={3}
                  className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs leading-relaxed resize-none outline-none transition-all ${
                    isDark
                      ? 'bg-[#141720] border-slate-700/80 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30'
                      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20'
                  }`}
                />
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Actions */}
        {!isSuccess && (
          <div
            className={`flex items-center justify-end gap-2.5 px-6 py-4 border-t ${
              isDark ? 'border-slate-800 bg-[#161a22]/60' : 'border-slate-100 bg-slate-50/60'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                isDark
                  ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              } disabled:opacity-50`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Flag className="w-3.5 h-3.5" />
                  <span>Submit Report</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
