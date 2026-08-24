import React from 'react';
import { Bookmark, Play, X, Clock, FileCode2 } from 'lucide-react';

export default function SavedQueriesDrawer({ isOpen, onClose, savedQueries = [], onRunQuery }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh] slide-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Saved Enterprise Queries</h2>
              <p className="text-xs text-slate-500">Curated analytical queries and business metrics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Query List */}
        <div className="flex-1 p-6 overflow-y-auto divide-y divide-slate-100 space-y-4">
          {savedQueries.map((q) => (
            <div key={q.id} className="pt-4 first:pt-0 flex items-start justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{q.name}</h3>
                </div>
                <p className="text-xs text-slate-500">{q.description}</p>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] overflow-x-auto">
                  {q.sql}
                </div>
              </div>

              <button
                onClick={() => {
                  onRunQuery(q.prompt || q.sql);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-100 transition-all flex-shrink-0 mt-1"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Run</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
