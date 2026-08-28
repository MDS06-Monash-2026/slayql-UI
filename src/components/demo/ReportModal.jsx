import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Loader2,
  CheckCircle2,
  Flag,
} from 'lucide-react';

const REPORT_OPTIONS = [
  {
    id: 'incorrect_answer',
    label: 'Incorrect answer',
    activeGradient: 'bg-gradient-to-r from-red-500 via-rose-500 to-red-600 text-white shadow-xs shadow-rose-500/25 ring-1 ring-rose-400/50',
  },
  {
    id: 'inappropriate_content',
    label: 'Inappropriate content',
    activeGradient: 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-xs shadow-amber-500/25 ring-1 ring-orange-400/50',
  },
  {
    id: 'low_response_time',
    label: 'Slow response time',
    activeGradient: 'bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-600 text-white shadow-xs shadow-blue-500/25 ring-1 ring-cyan-400/50',
  },
  {
    id: 'invalid_sql',
    label: 'Invalid SQL syntax',
    activeGradient: 'bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-xs shadow-indigo-500/25 ring-1 ring-indigo-400/50',
  },
  {
    id: 'missing_context',
    label: 'Missing context',
    activeGradient: 'bg-gradient-to-r from-purple-500 via-fuchsia-600 to-pink-600 text-white shadow-xs shadow-purple-500/25 ring-1 ring-pink-400/50',
  },
  {
    id: 'other',
    label: 'Other issue',
    activeGradient: 'bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 dark:from-slate-600 dark:via-slate-700 dark:to-slate-800 text-white shadow-xs shadow-slate-500/20 ring-1 ring-slate-400/40',
  },
];

export default function ReportModal({
  isOpen,
  onClose,
  onSubmit,
  isDark = false,
}) {
  const [category, setCategory] = useState('incorrect_answer');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const textareaRef = useRef(null);

  const handleNoteChange = (e) => {
    const val = e.target.value.slice(0, 1000);
    setNote(val);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(26, textareaRef.current.scrollHeight)}px`;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCategory('incorrect_answer');
      setNote('');
      setError(null);
      setIsSuccess(false);
      setIsSubmitting(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
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
      }, 650);
    } catch (err) {
      setError(err?.message || 'Failed to submit report. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className={`w-full max-w-[340px] rounded-xl border shadow-2xl overflow-hidden flex flex-col slide-in-up transition-all ${
          isDark
            ? 'bg-[#181c25] border-slate-700/80 text-slate-100 shadow-black/70'
            : 'bg-white border-slate-200 text-slate-900 shadow-slate-900/15'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-3 py-1.5 border-b ${
            isDark ? 'border-slate-800/90 bg-[#141720]/80' : 'border-slate-100 bg-slate-50/90'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-4.5 h-4.5 rounded bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center font-bold">
              <Flag className="w-2.5 h-2.5" />
            </div>
            <h2 id="report-modal-title" className="text-[11px] font-bold tracking-tight">
              Report Response
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
              isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            } disabled:opacity-50`}
            aria-label="Close modal"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-2.5 space-y-2">
          {/* Success State */}
          {isSuccess ? (
            <div className="py-3 flex flex-col items-center justify-center text-center space-y-1 animate-fade-in">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 animate-scale-in" />
              </div>
              <h3 className="text-[11px] font-bold text-slate-900 dark:text-slate-100">
                Report Submitted
              </h3>
              <p className="text-[9px] text-slate-500 dark:text-slate-400">
                Thank you for your feedback!
              </p>
            </div>
          ) : (
            <>
              {/* Error Alert */}
              {error && (
                <div className="p-1.5 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-[9px] flex items-center justify-between">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="font-bold underline ml-1"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Full Width Single-Row Selection Buttons */}
              <div className="space-y-0.5">
                <label className={`block text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Select Reason
                </label>
                <div className="flex flex-col gap-0.5">
                  {REPORT_OPTIONS.map((opt) => {
                    const isSelected = category === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCategory(opt.id)}
                        disabled={isSubmitting}
                        className={`w-full report-pill-animated flex items-center justify-between px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer select-none text-left ${
                          isSelected
                            ? `${opt.activeGradient} report-pill-selected scale-[1.01]`
                            : isDark
                            ? 'bg-[#151922] text-slate-300 border border-slate-800/90 hover:bg-[#1e2330] hover:text-white hover:border-slate-700'
                            : 'bg-slate-50 text-slate-700 border border-slate-200/80 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-300'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {/* Selected Indicator Circle */}
                        <div
                          className={`w-2.5 h-2.5 rounded-full flex items-center justify-center transition-all shrink-0 ${
                            isSelected
                              ? 'bg-white text-slate-900 shadow-xs'
                              : isDark
                              ? 'border border-slate-700 bg-slate-800/60'
                              : 'border border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <div className="w-1 h-1 rounded-full bg-slate-900" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ultra Compact User Input Text Area */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="report-note-input"
                    className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    Feedback note (optional)
                  </label>
                  <span className={`text-[8px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {note.length}/1000
                  </span>
                </div>
                <textarea
                  id="report-note-input"
                  ref={textareaRef}
                  value={note}
                  onChange={handleNoteChange}
                  disabled={isSubmitting}
                  placeholder="Additional details..."
                  rows={1}
                  className={`w-full px-2 py-1 rounded-md border text-[10px] leading-tight resize-none overflow-hidden outline-none transition-all ${
                    isDark
                      ? 'bg-[#13161f] border-slate-700/80 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'
                  }`}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!isSuccess && (
          <div
            className={`flex items-center justify-end gap-1.5 px-2.5 py-1.5 border-t ${
              isDark ? 'border-slate-800 bg-[#141720]/60' : 'border-slate-100 bg-slate-50/60'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                isDark
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              } disabled:opacity-50`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-2.5 py-0.5 rounded text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] shadow-xs transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Flag className="w-2.5 h-2.5" />
                  <span>Submit</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
