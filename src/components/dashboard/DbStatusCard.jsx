import React from 'react';
import { Database, Table2, Rows, Zap, ExternalLink } from 'lucide-react';

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 bg-white rounded-lg border border-slate-100">
      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div>
        <p className="text-[10px] text-slate-400 font-medium leading-none mb-0.5">{label}</p>
        <p className="text-sm font-bold text-slate-800 leading-none">{value}</p>
      </div>
    </div>
  );
}

export default function DbStatusCard({ dbStatus, onManage }) {
  if (!dbStatus) {
    // Skeleton
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" />
        <div className="h-6 bg-slate-200 rounded w-1/2 mb-2" />
        <div className="h-3 bg-slate-200 rounded w-1/4" />
      </div>
    );
  }

  const isConnected = dbStatus.status === 'connected';
  const rowsFormatted = dbStatus.rows >= 1_000_000
    ? `${(dbStatus.rows / 1_000_000).toFixed(1)}M`
    : dbStatus.rows >= 1_000
    ? `${(dbStatus.rows / 1_000).toFixed(0)}K`
    : dbStatus.rows;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Database className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-none mb-0.5">
              Connected Database
            </p>
            <p className="text-sm font-bold text-slate-900 leading-tight">{dbStatus.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status pill */}
          <span className={[
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
            isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
          ].join(' ')}>
            <span className={[
              'w-1.5 h-1.5 rounded-full',
              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500',
            ].join(' ')} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="p-3 bg-slate-50 flex gap-2 flex-wrap">
        <Stat icon={Table2} label="Tables"  value={dbStatus.tables}  color="bg-indigo-500" />
        <Stat icon={Rows}   label="Rows"    value={rowsFormatted}   color="bg-blue-500"   />
        <Stat icon={Zap}    label="Latency" value={`${dbStatus.latencyMs}ms`} color="bg-emerald-500" />

        {/* Manage button */}
        <button
          onClick={onManage}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-700 transition-all"
        >
          <ExternalLink className="w-3 h-3" />
          Manage
        </button>
      </div>
    </div>
  );
}
