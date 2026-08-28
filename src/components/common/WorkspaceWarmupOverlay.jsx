import React from 'react';
import { Loader2, Shield, Lock, Sparkles } from 'lucide-react';

export default function WorkspaceWarmupOverlay({ stage = 'Preparing cognitive environment...' }) {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-[#121622] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center space-y-6 relative overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Logo & Spinner */}
        <div className="relative inline-block mx-auto">
          <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg mx-auto bg-white p-1 flex items-center justify-center border border-slate-100 dark:border-slate-800">
            <img src="/SlayQLlogo.png" alt="SlayQL Logo" className="w-full h-full object-contain" />
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        </div>

        {/* Text */}
        <div className="space-y-1.5">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center justify-center gap-1.5">
            <span>Entering SlayQL</span>
            <Sparkles className="w-4 h-4 text-indigo-500" />
          </h2>
          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate h-5">
            {stage || 'Preparing cognitive environment...'}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 h-1.5 rounded-full animate-pulse w-full" />
        </div>

        {/* Security Footer */}
        <div className="flex items-center justify-center gap-3 text-[10.5px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-emerald-500" />
            <span>Encrypted Session</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Shield className="w-3 h-3 text-indigo-500" />
            <span>Read-Only Sandbox</span>
          </div>
        </div>
      </div>
    </div>
  );
}
