import React from 'react';
import { Clock, Play, Trash2, ChevronRight } from 'lucide-react';
import { formatRelativeTime } from '../../lib/api/history';

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const color =
    status === 'success' ? 'bg-emerald-500' :
    status === 'error'   ? 'bg-red-500'     :
                            'bg-slate-300';
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />;
}

// ─── Single history item ──────────────────────────────────────────────────────

function HistoryItem({ item, onOpen, onRunAgain, onDelete, onToggleSave }) {
  return (
    <div className="group flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200">
      <StatusDot status={item.status} />
      <div className="flex-1 min-w-0">
        <p
          onClick={() => onOpen(item)}
          className="text-xs font-semibold text-slate-800 truncate cursor-pointer hover:text-indigo-700 transition-colors"
          title={item.prompt}
        >
          {item.prompt}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-slate-400">
            {formatRelativeTime(item.createdAt)}
          </span>
          {item.rowCount > 0 && (
            <>
              <span className="text-slate-200">·</span>
              <span className="text-[10px] text-slate-400">{item.rowCount} rows</span>
            </>
          )}
          <span className="text-slate-200">·</span>
          <span className="text-[10px] text-slate-400 font-mono truncate hidden sm:block">
            {item.database}
          </span>
        </div>
      </div>

      {/* Action buttons — visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={() => onRunAgain(item)}
          title="Run again"
          className="p-1.5 rounded-md hover:bg-emerald-50 hover:text-emerald-600 text-slate-400 transition-all"
        >
          <Play className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          title="Delete"
          className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-500 text-slate-400 transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── QueryHistoryPanel ────────────────────────────────────────────────────────

export default function QueryHistoryPanel({
  history,
  onOpen,
  onRunAgain,
  onDelete,
  onToggleSave,
  maxItems = 5,
}) {
  const items = history.slice(0, maxItems);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-xs font-bold text-slate-800">Recent Queries</span>
        </div>
        {history.length > maxItems && (
          <button className="flex items-center gap-0.5 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
            View all <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Items */}
      <div className="divide-y divide-slate-100">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Clock className="w-6 h-6 mb-2 opacity-40" />
            <p className="text-xs font-medium">No queries yet</p>
            <p className="text-[10px] mt-0.5">Your query history will appear here.</p>
          </div>
        ) : (
          items.map((item) => (
            <HistoryItem
              key={item.id}
              item={item}
              onOpen={onOpen}
              onRunAgain={onRunAgain}
              onDelete={onDelete}
              onToggleSave={onToggleSave}
            />
          ))
        )}
      </div>
    </div>
  );
}
