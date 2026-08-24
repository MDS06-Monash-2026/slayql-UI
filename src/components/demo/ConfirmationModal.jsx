import React from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  isWorking = false,
  tone = 'danger',
}) {
  if (!isOpen) return null;
  const isDanger = tone === 'danger';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl p-5 slide-in-up">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDanger ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirmation-title" className="text-sm font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{message}</p>
          </div>
          <button type="button" onClick={onCancel} disabled={isWorking} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close confirmation">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={isWorking} className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={isWorking} className={`min-w-24 px-3 py-2 rounded-lg text-xs font-bold text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50 ${isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {isWorking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
