import React from 'react';
import { LogOut, ShieldCheck, X } from 'lucide-react';

export default function SignOutModal({ isOpen, onClose, onConfirm, user, creditBalance }) {
  if (!isOpen) return null;

  const userName = user?.name || 'Enterprise Reviewer';
  const userRole = user?.role || 'Lead Architect';
  const avatarInitials = user?.avatar_initials || 'ER';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signout-modal-title"
    >
      <div className="w-full max-w-sm rounded-3xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden p-6 space-y-5 slide-in-up">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shadow-xs">
            <LogOut className="w-5 h-5" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Title & Message */}
        <div className="space-y-1">
          <h2 id="signout-modal-title" className="text-base font-bold text-slate-900 tracking-tight">
            Sign out of SlayQL?
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Are you sure you want to end your current session?
          </p>
        </div>

        {/* User Card */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
            {user?.avatar_data_url ? (
              <img src={user.avatar_data_url} alt="" className="w-full h-full object-cover" />
            ) : (
              avatarInitials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 truncate">{userName}</p>
            <p className="text-[11px] text-slate-500 truncate">{userRole}</p>
          </div>
          {typeof creditBalance === 'number' && (
            <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
              {creditBalance.toLocaleString()} cr
            </span>
          )}
        </div>

        {/* Reassurance Note */}
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Your database connections and chat history stay saved.</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 px-4 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Stay signed in
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 h-10 px-4 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/20 transition-all flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
